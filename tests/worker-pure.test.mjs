import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');

async function loadWorkerModule() {
  const directory = await mkdtemp(resolve(tmpdir(), 'tg-bot-worker-test-'));
  const source = await readFile(resolve(root, 'worker.bundle.js'), 'utf8');
  const modulePath = resolve(directory, 'worker-test.mjs');
  await writeFile(modulePath, source, 'utf8');
  const module = await import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
  return {
    module,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

test('extracts Telegram text and primary media consistently', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    assert.equal(typeof module.default?.fetch, 'function');
    assert.equal(typeof module.default?.scheduled, 'function');
    assert.equal(module.extractMessageText({ text: 'hello' }), 'hello');
    assert.equal(module.extractMessageText({ caption: 'caption' }), 'caption');
    assert.equal(module.extractMessageText({}), '');
    assert.equal(module.extractPrimaryMediaFileId({
      photo: [{ file_id: 'small' }, { file_id: 'large' }],
    }), 'large');
    assert.equal(module.extractPrimaryMediaFileId({ document: { file_id: 'doc' } }), 'doc');
    assert.equal(module.extractPrimaryMediaFileId({}), null);
  } finally {
    await cleanup();
  }
});

test('parses bot commands, UID metadata, and reply targets', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    assert.equal(module.normalizeBotCommandText('/reply@MyBot 123 hi'), '/reply 123 hi');
    assert.deepEqual(module.parseReplyCommand('/r 42 hello'), { userId: 42, text: 'hello' });
    assert.deepEqual(module.parseReplyCommand('/reply hello'), { userId: null, text: 'hello' });
    assert.equal(module.parseReplyCommand('/reply'), null);
    assert.equal(module.extractTargetUserId({ text: 'context #UID:-100' }), -100);
    assert.equal(module.extractTargetUserId({
      reply_to_message: { forward_origin: { sender_user: { id: 99 } } },
    }), 99);
  } finally {
    await cleanup();
  }
});

test('applies keyword filtering and verification feature flags', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    assert.equal(module.matchKeywordFilter({ KEYWORD_FILTERS: 'spam, 诈骗' }, { text: '这是一条 SPAM 消息' }), 'spam');
    assert.equal(module.matchKeywordFilter({ KEYWORD_FILTERS: 'spam' }, { text: 'normal' }), null);
    assert.equal(module.matchKeywordFilter({ KEYWORD_FILTERS: '' }, { text: 'spam' }), null);
    assert.equal(module.isUserVerificationEnabled({ USER_VERIFICATION: 'yes' }), true);
    assert.equal(module.isUserVerificationEnabled({ USER_VERIFICATION: 'off' }), false);
  } finally {
    await cleanup();
  }
});

test('keeps admin and runtime feature decisions deterministic', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    assert.deepEqual(module.getRootAdminIds({ ADMIN_IDS: '1, 2, 2' }), [1, 2]);
    assert.equal(module.isRootAdmin({ ADMIN_CHAT_ID: '99' }, 99), true);
    assert.equal(module.isRootAdmin({ ADMIN_CHAT_ID: '-100' }, -100), false);
    assert.equal(module.getAdminMetaMode({ ADMIN_META_MODE: 'silent' }), 'off');
    assert.equal(module.shouldSendUserMetaMessage({}, true, { _createdNow: true }, true), true);
    assert.equal(module.shouldSendUserMetaMessage({ ADMIN_META_MODE: 'off' }, true, { _createdNow: true }, true), false);
    assert.equal(module.isTopicModeEnabled({ TOPIC_MODE: 'off' }), false);
    assert.equal(module.isDataCleanupAutoEnabled({ DATA_CLEANUP_AUTO: 'false' }), false);
    assert.equal(module.isDeletedAccountSweepAutoEnabled({ DELETED_ACCOUNT_SWEEP_AUTO: 'false' }), false);
    assert.equal(module.isUserPrivateCommand({ text: '/start' }), true);
    assert.equal(module.isUserPrivateCommand({ text: 'hello' }), false);
  } finally {
    await cleanup();
  }
});

test('normalizes verification traces and validates API identity', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    assert.equal(module.normalizeRotationAngle(-90), 270);
    assert.equal(module.normalizeRotationAngle(450), 90);
    assert.deepEqual(module.normalizeSliderTrace([
      { x: 20, t: 120 },
      { x: 10, t: 100 },
      { x: 'bad', t: 200 },
    ]), [{ x: 10, t: 0 }, { x: 20, t: 20 }]);
    assert.deepEqual(module.parseVerificationApiIdentity({ uid: '7', token: 'abc' }), { userId: 7, token: 'abc' });
    assert.throws(() => module.parseVerificationApiIdentity({ userId: 0, token: 'abc' }));
    assert.throws(() => module.parseVerificationApiIdentity({ userId: 7 }));
  } finally {
    await cleanup();
  }
});

test('parses cookies, IDs, pagination, and webhook paths', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    assert.deepEqual(module.parseCookies('a=1; admin_session=abc%201; ignored'), { a: '1', admin_session: 'abc 1' });
    assert.match(module.buildSessionCookie('abc 1'), /admin_session=abc%201/);
    assert.deepEqual(module.parseIdList('1, -2, bad, 3'), [1, -2, 3]);
    assert.equal(module.parseLimit('999', 20), 100);
    assert.equal(module.parseOffset('-1', 4), 4);
    assert.equal(module.normalizeWebhookPath('hooks///'), '/hooks///');
  } finally {
    await cleanup();
  }
});

test('normalizes message types and storage keys consistently', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    assert.equal(module.detectMessageType({ photo: [{ file_id: '1' }] }), 'photo');
    assert.equal(module.detectMessageType({ text: 'hello' }), 'text');
    assert.equal(module.detectMessageType({}), 'unknown');
    assert.equal(module.isIgnoredAdminServiceMessage({ new_chat_members: [{}] }), true);
    assert.equal(module.isIgnoredAdminServiceMessage({ text: 'normal' }), false);
    assert.equal(module.userKey(42), 'user:42');
    assert.equal(module.blacklistKey(42), 'blacklist:42');
    assert.equal(module.adminKey(42), 'admin:42');
    assert.equal(module.topicUserKey(42), 'topic:user:42');
    assert.equal(module.topicThreadKey(7), 'topic:thread:7');
    assert.equal(module.trustKey(42), 'trust:42');
    assert.equal(module.verifyKey(42), 'verify:42');
    assert.equal(module.verificationCacheKey('42'), '42');
    assert.equal(module.buildGroupAdminMemberCacheKey(-100, 42), '-100:42');
    assert.equal(module.buildMessageHistoryDedupeKey({ telegramMessageId: 9, direction: 'user_to_admin' }, 42), '42:user_to_admin:9');
    assert.equal(module.buildMessageHistoryDedupeKey({ telegramMessageId: 0, direction: 'user_to_admin' }, 42), '');
  } finally {
    await cleanup();
  }
});

test('handles timed caches, JSON comparisons, and D1 status normalization', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    const cache = new Map();
    module.writeTimedCacheValue(cache, 'a', { value: 1 }, 50, 100);
    assert.deepEqual(module.readTimedCacheValue(cache, 'a', 149), { value: 1 });
    assert.equal(module.readTimedCacheValue(cache, 'a', 150), null);

    const pruneCache = new Map([
      ['old', { value: 1, expiresAt: 50 }],
      ['first', { value: 2, expiresAt: 200 }],
      ['second', { value: 3, expiresAt: 200 }],
    ]);
    module.pruneTimedCache(pruneCache, 1, 100);
    assert.deepEqual([...pruneCache.keys()], ['second']);

    assert.equal(module.serializeJsonForStorage(undefined), 'null');
    assert.equal(module.areJsonStorageValuesEqual({ a: 1 }, { a: 1 }), true);
    assert.deepEqual(module.getJsonChangedKeys({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 }), ['b', 'c']);

    const now = Date.parse('2026-01-01T00:01:00.000Z');
    const existing = { lastSeenAt: '2026-01-01T00:00:00.000Z', username: 'same' };
    assert.equal(module.shouldThrottleUserProfileWrite(existing, { ...existing, lastSeenAt: '2026-01-01T00:01:00.000Z' }, now), true);
    assert.equal(module.shouldThrottleUserProfileWrite(existing, { ...existing, username: 'changed' }, now), false);

    assert.deepEqual(module.normalizeD1VerificationStatusRecord({
      userId: '7',
      status: 'PASSED',
      passedAt: '2026-01-01T00:00:00Z',
      clearedAt: 'invalid',
    }), {
      userId: 7,
      status: 'passed',
      passedAt: '2026-01-01T00:00:00.000Z',
      clearedAt: null,
      updatedAt: null,
    });
    assert.equal(module.isSameD1VerificationMeaning(
      { status: 'PASSED', passedAt: '2026-01-01T00:00:00Z' },
      { status: 'passed', passedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00Z' },
    ), true);
  } finally {
    await cleanup();
  }
});

test('builds stable D1 directory and moderation index records', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    const profile = {
      userId: 42,
      username: 'alice',
      displayName: 'Alice',
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-02T00:00:00.000Z',
    };
    assert.deepEqual(module.buildD1UserDirectoryRecord(profile, '2026-01-03T00:00:00.000Z'), {
      userId: 42,
      username: 'alice',
      displayName: 'Alice',
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-02T00:00:00.000Z',
      profileJson: JSON.stringify(profile),
      updatedAt: '2026-01-03T00:00:00.000Z',
    });
    assert.equal(module.buildD1UserDirectoryRecord({ userId: 0 }), null);

    const entry = { userId: 42, reason: 'spam', createdAt: '2026-01-02T00:00:00.000Z' };
    assert.deepEqual(module.buildD1ModerationIndexRecord('BLACKLIST', entry, '2026-01-03T00:00:00.000Z'), {
      userId: 42,
      kind: 'blacklist',
      entryJson: JSON.stringify(entry),
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
    });
  } finally {
    await cleanup();
  }
});

test('dual-writes user profiles and moderation indexes to KV and D1', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    const kvWrites = [];
    const d1Calls = [];
    const env = {
      BOT_KV: {
        put: async (key, value) => kvWrites.push({ key, value }),
      },
      DB: {
        prepare(sql) {
          const call = { sql, bindings: [] };
          return {
            bind(...bindings) {
              call.bindings = bindings;
              return this;
            },
            async run() {
              d1Calls.push(call);
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      },
    };
    const profile = {
      userId: 77,
      username: 'dualwrite',
      displayName: 'Dual Write',
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-02T00:00:00.000Z',
    };

    assert.equal(
      await module.putUserProfileIfChanged(env, profile.userId, profile, { existing: null }),
      true,
    );
    assert.deepEqual(kvWrites, [{ key: 'user:77', value: JSON.stringify(profile) }]);
    assert.equal(d1Calls.some((call) => call.sql.includes('INSERT INTO user_directory')), true);

    await module.writeD1ModerationIndex(env, 'trust', {
      userId: 77,
      note: 'known user',
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    assert.equal(d1Calls.some((call) => (
      call.sql.includes('INSERT INTO user_moderation_index') && call.bindings[1] === 'trust'
    )), true);

    await module.deleteD1DirectoryEntries(env, 77, 'trust');
    assert.equal(d1Calls.some((call) => (
      call.sql.includes('DELETE FROM user_moderation_index') && call.bindings[1] === 'trust'
    )), true);
  } finally {
    await cleanup();
  }
});

test('backfills D1 directory indexes across resumable KV cursor batches', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    const values = new Map([
      ['user:1', JSON.stringify({ userId: 1, displayName: 'One' })],
      ['user:2', JSON.stringify({ userId: 2, displayName: 'Two' })],
      ['blacklist:2', JSON.stringify({ userId: 2, reason: 'spam' })],
      ['trust:1', JSON.stringify({ userId: 1, note: 'known' })],
    ]);
    const prefixes = {
      'user:': ['user:1', 'user:2'],
      'blacklist:': ['blacklist:2'],
      'trust:': ['trust:1'],
    };
    const batchCalls = [];
    const env = {
      BOT_KV: {
        async get(key) { return values.get(key) || null; },
        async put(key, value) { values.set(key, value); },
        async list({ prefix, cursor, limit }) {
          const keys = prefixes[prefix] || [];
          const start = Number(cursor || 0);
          const end = Math.min(start + limit, keys.length);
          return {
            keys: keys.slice(start, end).map((name) => ({ name })),
            cursor: end < keys.length ? String(end) : undefined,
            list_complete: end >= keys.length,
          };
        },
      },
      DB: {
        prepare(sql) {
          return {
            sql,
            bindings: [],
            bind(...bindings) {
              this.bindings = bindings;
              return this;
            },
            async run() { return { success: true }; },
          };
        },
        async batch(statements) {
          batchCalls.push(...statements);
          return statements.map(() => ({ success: true }));
        },
      },
    };

    const first = await module.runDirectoryIndexBackfill(env, { batchSize: 1, source: 'test' });
    assert.equal(first.state.status, 'running');
    assert.equal(first.state.cursors.users, '1');
    assert.equal(first.writtenThisRun, 1);

    const second = await module.runDirectoryIndexBackfill(env, { batchSize: 10, source: 'test' });
    assert.equal(second.state.status, 'complete');
    assert.deepEqual(second.state.written, { users: 2, blacklist: 1, trust: 1 });
    assert.equal(batchCalls.filter((statement) => statement.sql.includes('user_directory')).length, 2);
    assert.equal(batchCalls.filter((statement) => statement.sql.includes('user_moderation_index')).length, 2);

    const completed = await module.runDirectoryIndexBackfill(env, { batchSize: 10, source: 'test' });
    assert.equal(completed.skipped, 'complete');
  } finally {
    await cleanup();
  }
});

test('uses D1 user pagination only after directory backfill is complete', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    const env = {
      BOT_KV: {
        async get(key) {
          if (key === 'sys:directory_index_backfill') {
            return JSON.stringify({ version: 1, status: 'complete' });
          }
          return null;
        },
        async list() {
          throw new Error('KV listing should not run after D1 backfill completion');
        },
      },
      DB: {
        prepare(sql) {
          return {
            sql,
            bindings: [],
            bind(...bindings) {
              this.bindings = bindings;
              return this;
            },
            async run() { return { success: true }; },
            async first() {
              return { total: 2, blacklisted: 1, trusted: 1, verified: 1 };
            },
            async all() {
              return {
                results: [{
                  profileJson: JSON.stringify({
                    userId: 2,
                    displayName: 'Indexed User',
                    lastSeenAt: '2026-01-02T00:00:00.000Z',
                    verificationStatus: 'verified',
                    verificationPassedAt: '2026-01-02T00:00:00.000Z',
                  }),
                  blacklistJson: JSON.stringify({ userId: 2, reason: 'spam' }),
                  trustJson: null,
                }],
              };
            },
          };
        },
      },
    };

    const page = await module.listUsersPage(env, { limit: 1, offset: 0 });
    assert.equal(page.source, 'd1');
    assert.equal(page.total, 2);
    assert.equal(page.nextOffset, 1);
    assert.deepEqual(page.summary, { total: 2, blacklisted: 1, trusted: 1, verified: 1 });
    assert.equal(page.items[0].displayName, 'Indexed User');
    assert.equal(page.items[0].blacklisted, true);
    assert.equal(page.items[0].blacklistReason, 'spam');
    assert.equal(page.items[0].verified, true);
  } finally {
    await cleanup();
  }
});

test('uses D1 blacklist and trust indexes after backfill completion', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    const env = {
      BOT_KV: {
        async get(key) {
          return key === 'sys:directory_index_backfill'
            ? JSON.stringify({ version: 1, status: 'complete' })
            : null;
        },
        async list() { throw new Error('KV moderation listing should not run'); },
      },
      DB: {
        prepare(sql) {
          return {
            sql,
            bindings: [],
            bind(...bindings) {
              this.bindings = bindings;
              return this;
            },
            async run() { return { success: true }; },
            async first() { return { total: 3 }; },
            async all() {
              const kind = this.bindings[0];
              return {
                results: [{
                  entryJson: JSON.stringify({
                    userId: 9,
                    ...(kind === 'blacklist' ? { reason: 'spam' } : { note: 'known' }),
                  }),
                  profileJson: JSON.stringify({
                    userId: 9,
                    displayName: 'Indexed Nine',
                    username: 'nine',
                  }),
                }],
              };
            },
          };
        },
      },
    };

    const blacklist = await module.listBlacklistPage(env, { limit: 1, offset: 1 });
    const trust = await module.listTrustPage(env, { limit: 1, offset: 1 });
    assert.equal(blacklist.items[0].reason, 'spam');
    assert.equal(blacklist.items[0].displayName, 'Indexed Nine');
    assert.equal(blacklist.total, 3);
    assert.equal(blacklist.prevOffset, 0);
    assert.equal(blacklist.nextOffset, 2);
    assert.equal(trust.items[0].note, 'known');
    assert.equal(trust.items[0].username, 'nine');
  } finally {
    await cleanup();
  }
});

test('builds structured request and Telegram update log context', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    const request = new Request('https://worker.example.com/webhook', {
      headers: { 'cf-ray': 'ray-id-123' },
    });
    assert.equal(module.getRequestId(request), 'ray-id-123');
    assert.deepEqual(module.getTelegramUpdateContext({
      update_id: 55,
      callback_query: {
        from: { id: 7 },
        message: { message_id: 9, chat: { id: -100 }, from: { id: 8 } },
      },
    }), {
      updateId: 55,
      userId: 7,
      chatId: -100,
      messageId: 9,
    });
    assert.deepEqual(module.buildStructuredLogRecord(
      'telegram_update_completed',
      { requestId: 'req-1', updateId: 55, userId: 7, chatId: -100, stage: 'handle_update' },
      { durationMs: 12, status: 'ok' },
      new Date('2026-01-01T00:00:00.000Z'),
    ), {
      timestamp: '2026-01-01T00:00:00.000Z',
      event: 'telegram_update_completed',
      requestId: 'req-1',
      updateId: 55,
      userId: 7,
      chatId: -100,
      stage: 'handle_update',
      durationMs: 12,
      status: 'ok',
    });
  } finally {
    await cleanup();
  }
});

test('tracks rolling webhook errors and deployment health', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    const start = Date.parse('2026-01-01T00:00:00.000Z');
    const first = module.buildWebhookErrorStats(null, { at: '2026-01-01T00:00:01.000Z', updateId: 1, stage: 'handle_update' }, start);
    assert.equal(first.windowCount, 1);
    assert.equal(first.totalCount, 1);
    const second = module.buildWebhookErrorStats(first, { at: '2026-01-01T00:10:00.000Z', updateId: 2, stage: 'handle_update' }, start + 600_000);
    assert.equal(second.windowCount, 2);
    assert.equal(second.totalCount, 2);
    const reset = module.buildWebhookErrorStats(second, { updateId: 3 }, start + 3_700_000);
    assert.equal(reset.windowCount, 1);
    assert.equal(reset.totalCount, 3);

    assert.deepEqual(module.buildDeploymentHealthRecord({
      ok: false,
      webhookUrl: 'https://worker.example.com/webhook',
      commandsError: 'telegram_unavailable',
      passwordReady: true,
    }, new Date('2026-01-01T00:00:00.000Z')), {
      status: 'degraded',
      checkedAt: '2026-01-01T00:00:00.000Z',
      webhookUrl: 'https://worker.example.com/webhook',
      webhookReady: true,
      commandsReady: false,
      passwordReady: true,
      bootstrapNotifyReady: true,
      lastError: 'telegram_unavailable',
    });
  } finally {
    await cleanup();
  }
});

test('classifies top-level routes and preserves admin handler order', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    const paths = {
      verifyImage: '/verify-image',
      verifyWeb: '/verify',
      verifyApiPrefix: '/verify/api',
      mediaPrefix: '/media/',
      adminPanel: '/admin',
    };
    assert.equal(module.classifyTopLevelRoute('GET', '/health', paths), 'health');
    assert.equal(module.classifyTopLevelRoute('POST', '/verify/api/choice', paths), 'verify_api');
    assert.equal(module.classifyTopLevelRoute('GET', '/media/2026/07/image.png', paths), 'media');
    assert.equal(module.classifyTopLevelRoute('HEAD', '/media/2026/07/image.png', paths), 'media');
    assert.equal(module.classifyTopLevelRoute('GET', '/unknown', paths), null);

    const calls = [];
    const response = await module.dispatchAdminRoutes(
      { request: {}, url: {}, env: {} },
      {
        auth: async () => { calls.push('auth'); return null; },
        system: async () => { calls.push('system'); return null; },
        users: async () => { calls.push('users'); return { status: 200 }; },
        reply: async () => { calls.push('reply'); return null; },
        blacklist: async () => { calls.push('blacklist'); return null; },
        trust: async () => { calls.push('trust'); return null; },
        authorizedAdmins: async () => { calls.push('admins'); return null; },
        webhookManagement: async () => { calls.push('webhook'); return null; },
      },
    );
    assert.deepEqual(calls, ['auth', 'system', 'users']);
    assert.deepEqual(response, { status: 200 });
  } finally {
    await cleanup();
  }
});

test('classifies and dispatches verification API routes', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    const prefix = '/verify/api';
    assert.equal(module.classifyVerificationApiRoute(`${prefix}/session`, prefix), 'session');
    assert.equal(module.classifyVerificationApiRoute(`${prefix}/slider`, prefix), 'slider');
    assert.equal(module.classifyVerificationApiRoute(`${prefix}/grid`, prefix), 'grid');
    assert.equal(module.classifyVerificationApiRoute(`${prefix}/choice`, prefix), 'choice');
    assert.equal(module.classifyVerificationApiRoute(`${prefix}/unknown`, prefix), null);

    const calls = [];
    const context = {
      pathname: `${prefix}/grid`,
      prefix,
      env: { name: 'env' },
      body: { answer: [1, 2] },
      publicBaseUrl: 'https://worker.example.com',
    };
    const handlers = Object.fromEntries(
      ['session', 'slider', 'grid', 'choice'].map((route) => [
        route,
        async (env, body, publicBaseUrl) => {
          calls.push({ route, env, body, publicBaseUrl });
          return { route };
        },
      ]),
    );

    assert.deepEqual(
      await module.dispatchVerificationApiRoute(context, handlers),
      { route: 'grid' },
    );
    assert.deepEqual(calls, [{
      route: 'grid',
      env: context.env,
      body: context.body,
      publicBaseUrl: context.publicBaseUrl,
    }]);
    assert.equal(
      await module.dispatchVerificationApiRoute(
        { ...context, pathname: `${prefix}/unknown` },
        handlers,
      ),
      null,
    );
    assert.equal(calls.length, 1);
  } finally {
    await cleanup();
  }
});
