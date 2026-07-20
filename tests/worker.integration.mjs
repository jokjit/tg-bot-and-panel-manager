import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { Miniflare } from 'miniflare';

const adminKey = 'integration-admin-key';

async function createWorkerRuntime() {
  const mf = new Miniflare({
    modules: true,
    scriptPath: 'worker.bundle.js',
    compatibilityDate: '2025-07-18',
    kvNamespaces: ['BOT_KV'],
    d1Databases: ['DB'],
    bindings: {
      ADMIN_API_KEY: adminKey,
      ADMIN_CHAT_ID: '-100123',
      PUBLIC_BASE_URL: 'https://bot.example.com',
      TOPIC_MODE: 'false',
      USER_VERIFICATION: 'false',
    },
    outboundService: () => new Response(JSON.stringify({ ok: false, description: 'unexpected outbound request' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    }),
  });
  await mf.ready;
  return mf;
}

test('Miniflare runs the bundled Worker with KV and D1 bindings', async (t) => {
  const mf = await createWorkerRuntime();
  t.after(() => mf.dispose());
  const kv = await mf.getKVNamespace('BOT_KV');
  const db = await mf.getD1Database('DB');

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
    assert.equal(status.deploymentHealth.source, 'integration');
  });

  await t.test('admin routes reject missing API credentials', async () => {
    const response = await mf.dispatchFetch('https://bot.example.com/admin/api/users');
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: 'Unauthorized' });
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
});
