import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { Miniflare } from 'miniflare';

const adminKey = 'integration-admin-key';

async function createWorkerRuntime() {
  const workerScript = await readFile('worker.bundle.js', 'utf8');
  const mf = new Miniflare({
    workers: [{
      config: {
        name: 'tg-bot-integration',
        type: 'worker',
        compatibilityDate: '2025-07-18',
        manifest: {
          mainModule: 'worker.bundle.js',
          modulesRoot: resolve('.'),
          modules: {
            'worker.bundle.js': { type: 'esm', contents: workerScript },
          },
        },
        env: {
          BOT_KV: { type: 'kv' },
          DB: { type: 'd1' },
          IMAGE_BUCKET: { type: 'r2' },
          ADMIN_API_KEY: { type: 'text', value: adminKey },
          DEPLOY_BOOTSTRAP_TOKEN: { type: 'text', value: 'integration-bootstrap-token' },
          ADMIN_CHAT_ID: { type: 'text', value: '-100123' },
          ADMIN_PANEL_URL: { type: 'text', value: 'https://panel.example.com' },
          PUBLIC_BASE_URL: { type: 'text', value: 'https://bot.example.com' },
          TOPIC_MODE: { type: 'text', value: 'false' },
          USER_VERIFICATION: { type: 'text', value: 'false' },
        },
      },
    }],
  });
  await mf.ready;
  return mf;
}

test('Miniflare runs the bundled Worker with KV and D1 bindings', async (t) => {
  const mf = await createWorkerRuntime();
  t.after(() => mf.dispose());
  const kv = await mf.getKVNamespace('BOT_KV');
  const db = await mf.getD1Database('DB');
  const imageBucket = await mf.getR2Bucket('IMAGE_BUCKET');
  await kv.put('sys:config', JSON.stringify({
    ADMIN_PANEL_PASSWORD: 'legacy-password-123',
    ADMIN_SESSION_VERSION: '1',
  }));

  await t.test('health and status routes expose runtime binding state', async () => {
    await kv.put('sys:deployment_health', JSON.stringify({ status: 'healthy', source: 'integration' }));
    const healthResponse = await mf.dispatchFetch('https://bot.example.com/health');
    assert.equal(healthResponse.status, 200);
    assert.equal((await healthResponse.json()).ok, true);

    const statusResponse = await mf.dispatchFetch('https://bot.example.com/');
    assert.equal(statusResponse.status, 200);
    const status = await statusResponse.json();
    assert.equal(status.hasKv, true);
    assert.equal(status.hasD1, true);
    assert.equal(status.hasR2, true);
    assert.equal(status.imagePublicBaseUrl, null);
    assert.equal(status.imageDeliveryMode, 'worker-fallback');
    assert.equal(status.deploymentHealth.source, 'integration');
  });

  await t.test('admin routes reject missing API credentials', async () => {
    const response = await mf.dispatchFetch('https://bot.example.com/admin/api/users');
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: 'Unauthorized' });
  });

  await t.test('deploy bootstrap rejects tokens supplied in query strings', async () => {
    const response = await mf.dispatchFetch(
      'https://bot.example.com/deploy/bootstrap?token=integration-bootstrap-token',
      { method: 'POST' },
    );
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: 'forbidden' });
  });

  await t.test('deploy bootstrap CORS allows the header-based token flow', async () => {
    const response = await mf.dispatchFetch('https://bot.example.com/deploy/bootstrap', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://panel.example.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-deploy-bootstrap-token',
      },
    });
    assert.equal(response.status, 204);
    assert.match(response.headers.get('access-control-allow-headers'), /X-Deploy-Bootstrap-Token/i);
  });

  await t.test('D1 directory pagination is served through the authenticated Worker route', async () => {
    const migrationSql = (await readFile('migrations/0004_directory_indexes.sql', 'utf8'))
      .replace(/\s+/g, ' ')
      .trim();
    await db.exec(migrationSql);
    await kv.put('sys:directory_index_backfill', JSON.stringify({ version: 1, status: 'complete' }));
    const profile = {
      userId: 7,
      username: 'integration_user',
      displayName: 'Integration User',
      lastSeenAt: '2026-07-20T00:00:00.000Z',
      verificationStatus: 'verified',
      verificationPassedAt: '2026-07-20T00:00:00.000Z',
    };
    await db.prepare(
      `INSERT INTO user_directory
       (user_id, username, display_name, first_seen_at, last_seen_at, profile_json, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(
      profile.userId,
      profile.username,
      profile.displayName,
      profile.lastSeenAt,
      profile.lastSeenAt,
      JSON.stringify(profile),
      profile.lastSeenAt,
    ).run();

    const response = await mf.dispatchFetch('https://bot.example.com/admin/api/users?limit=10&offset=0', {
      headers: { 'x-admin-key': adminKey },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.source, 'd1');
    assert.equal(body.total, 1);
    assert.equal(body.users[0].username, 'integration_user');
    assert.equal(body.users[0].verified, true);
  });

  await t.test('blacklist mutations dual-write KV and the D1 moderation index', async () => {
    const response = await mf.dispatchFetch('https://bot.example.com/admin/api/blacklist', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-key': adminKey,
      },
      body: JSON.stringify({ action: 'add', userId: 7, reason: 'integration-test' }),
    });
    assert.equal(response.status, 200);
    const stored = JSON.parse(await kv.get('blacklist:7'));
    assert.equal(stored.reason, 'integration-test');

    const row = await db.prepare(
      `SELECT entry_json AS entryJson FROM user_moderation_index
       WHERE user_id = ?1 AND kind = 'blacklist'`,
    ).bind(7).first();
    assert.equal(JSON.parse(row.entryJson).reason, 'integration-test');

    const listResponse = await mf.dispatchFetch('https://bot.example.com/admin/api/blacklist', {
      headers: { 'x-admin-key': adminKey },
    });
    const list = await listResponse.json();
    assert.equal(list.source, 'd1');
    assert.equal(list.blacklist[0].reason, 'integration-test');
  });

  await t.test('admin password login migrates plaintext and protects session writes with CSRF', async () => {
    const preflight = await mf.dispatchFetch('https://bot.example.com/admin/login', {
      method: 'OPTIONS',
      headers: { origin: 'https://panel.example.com' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://panel.example.com');
    assert.match(preflight.headers.get('access-control-allow-headers'), /X-CSRF-Token/i);

    const rejectedOrigin = await mf.dispatchFetch('https://bot.example.com/admin/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://attacker.example.com',
      },
      body: JSON.stringify({ username: 'admin', password: 'legacy-password-123' }),
    });
    assert.equal(rejectedOrigin.status, 403);

    const loginResponse = await mf.dispatchFetch('https://bot.example.com/admin/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://panel.example.com',
      },
      body: JSON.stringify({ username: 'admin', password: 'legacy-password-123' }),
    });
    assert.equal(loginResponse.status, 200);
    const login = await loginResponse.json();
    assert.match(login.csrfToken, /^[0-9a-f]{48}$/);
    const cookie = loginResponse.headers.get('set-cookie').split(';')[0];

    const migrated = JSON.parse(await kv.get('sys:config'));
    assert.equal('ADMIN_PANEL_PASSWORD' in migrated, false);
    assert.match(migrated.ADMIN_PANEL_PASSWORD_HASH, /^pbkdf2-sha256\$/);

    const missingCsrf = await mf.dispatchFetch('https://bot.example.com/admin/logout', {
      method: 'POST',
      headers: { cookie, origin: 'https://panel.example.com' },
    });
    assert.equal(missingCsrf.status, 403);

    const changeResponse = await mf.dispatchFetch('https://bot.example.com/admin/api/auth/change-password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
        origin: 'https://panel.example.com',
        'x-csrf-token': login.csrfToken,
      },
      body: JSON.stringify({ newPassword: 'new-permanent-password-456' }),
    });
    assert.equal(changeResponse.status, 200);
    const changed = await changeResponse.json();
    assert.match(changed.csrfToken, /^[0-9a-f]{48}$/);
    const newCookie = changeResponse.headers.get('set-cookie').split(';')[0];

    const oldSession = await mf.dispatchFetch('https://bot.example.com/admin/api/users', {
      headers: { cookie, origin: 'https://panel.example.com' },
    });
    assert.equal(oldSession.status, 401);

    const logoutResponse = await mf.dispatchFetch('https://bot.example.com/admin/logout', {
      method: 'POST',
      headers: {
        cookie: newCookie,
        origin: 'https://panel.example.com',
        'x-csrf-token': changed.csrfToken,
      },
    });
    assert.equal(logoutResponse.status, 200);

    const queryKeyResponse = await mf.dispatchFetch(`https://bot.example.com/admin/api/users?key=${adminKey}`);
    assert.equal(queryKeyResponse.status, 401);
  });

  await t.test('webhook mutations reject legacy GET requests', async () => {
    for (const path of ['/setWebhook', '/deleteWebhook', '/setCommands']) {
      const response = await mf.dispatchFetch(`https://bot.example.com${path}`, {
        headers: { 'x-admin-key': adminKey },
      });
      assert.equal(response.status, 404);
    }
  });

  await t.test('image hosting uploads to R2, indexes in D1, serves publicly, and deletes', async () => {
    const migrationSql = (await readFile('migrations/0005_image_assets.sql', 'utf8'))
      .replace(/\s+/g, ' ')
      .trim();
    await db.exec(migrationSql);
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const form = new FormData();
    form.set('file', new Blob([pngBytes], { type: 'image/png' }), 'integration.png');
    const runtimeUrl = await mf.ready;
    const uploadResponse = await fetch(new URL('/admin/api/images', runtimeUrl), {
      method: 'POST',
      headers: { 'x-admin-key': adminKey },
      body: form,
    });
    assert.equal(uploadResponse.status, 201);
    const uploaded = await uploadResponse.json();
    assert.equal(uploaded.image.originalName, 'integration.png');
    assert.equal(uploaded.image.contentType, 'image/png');
    assert.match(uploaded.image.url, /^https:\/\/bot\.example\.com\/media\//);
    assert.ok(await imageBucket.get(uploaded.image.objectKey));

    const publicResponse = await mf.dispatchFetch(uploaded.image.url);
    assert.equal(publicResponse.status, 200);
    assert.equal(publicResponse.headers.get('content-type'), 'image/png');
    assert.deepEqual(new Uint8Array(await publicResponse.arrayBuffer()), pngBytes);

    const listResponse = await mf.dispatchFetch('https://bot.example.com/admin/api/images', {
      headers: { 'x-admin-key': adminKey },
    });
    const list = await listResponse.json();
    assert.equal(list.total, 1);
    assert.equal(list.images[0].id, uploaded.image.id);

    const deleteResponse = await mf.dispatchFetch(`https://bot.example.com/admin/api/images/${uploaded.image.id}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': adminKey },
    });
    assert.equal(deleteResponse.status, 200);
    assert.equal(await imageBucket.get(uploaded.image.objectKey), null);
  });
});
