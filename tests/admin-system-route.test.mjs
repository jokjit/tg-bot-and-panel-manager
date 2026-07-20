import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAdminSystemRoute } from '../worker-src/routes/admin-system.js';

function createHandlers(overrides = {}) {
  const calls = [];
  const handlers = {
    getAdminApiPrefix: () => '/admin/api',
    requireAdmin: async (...args) => calls.push(['auth', ...args]),
    getStatus: async (...args) => { calls.push(['status', ...args]); return { ok: true, status: 'healthy' }; },
    getEffectiveSystemConfig: async () => ({ topicMode: true }),
    buildSystemConfigView: (config) => ({ ...config, viewed: true }),
    readJsonBody: async () => ({}),
    updateSystemConfig: async (...args) => { calls.push(['update', ...args]); return {}; },
    runDataCleanup: async (...args) => { calls.push(['cleanup', ...args]); return { cleaned: true }; },
    runDeletedAccountSweep: async (...args) => { calls.push(['sweep', ...args]); return { scanned: true }; },
    runDirectoryIndexBackfill: async (...args) => { calls.push(['backfill', ...args]); return { indexed: true }; },
    json: (body) => body,
    ...overrides,
  };
  return { calls, handlers };
}

test('admin system status passes URL and deployment context', async () => {
  const { calls, handlers } = createHandlers();
  const url = new URL('https://example.com/admin/api/status');
  const result = await handleAdminSystemRoute({
    request: { method: 'GET' }, url, webhookPath: '/hook', publicBaseUrl: 'https://bot.example.com',
  }, handlers);
  assert.equal(result.status, 'healthy');
  assert.deepEqual(calls.find((call) => call[0] === 'status').slice(1), [url, '/hook', 'https://bot.example.com']);
});

test('admin system config reads and updates the effective view', async () => {
  const get = createHandlers();
  const getResult = await handleAdminSystemRoute({
    request: { method: 'GET' },
    url: new URL('https://example.com/admin/api/system-config'),
  }, get.handlers);
  assert.deepEqual(getResult.config, { topicMode: true, viewed: true });

  const post = createHandlers({
    readJsonBody: async () => ({ topicMode: false }),
    updateSystemConfig: async (...args) => {
      post.calls.push(['update', ...args]);
      return { metaSync: { synced: false, error: 'Telegram unavailable' } };
    },
  });
  const postResult = await handleAdminSystemRoute({
    request: { method: 'POST' },
    url: new URL('https://example.com/admin/api/system-config'),
  }, post.handlers);
  assert.deepEqual(post.calls.find((call) => call[0] === 'update')[1], { topicMode: false });
  assert.equal(postResult.profileMetaSynced, false);
  assert.equal(postResult.profileMetaSyncError, 'Telegram unavailable');
});

test('admin maintenance routes pass explicit execution metadata', async () => {
  const cases = [
    ['/maintenance/cleanup', 'cleanup', { retentionDays: 30, batchSize: 10, source: 'admin-api', force: true }],
    ['/maintenance/deleted-account-sweep', 'sweep', { batchSize: 10, source: 'admin-api', force: true }],
    ['/maintenance/directory-index-backfill', 'backfill', { batchSize: 10, reset: true, source: 'admin-api' }],
  ];
  for (const [path, callName, expected] of cases) {
    const { calls, handlers } = createHandlers({
      readJsonBody: async () => ({ retentionDays: 30, batchSize: 10, reset: true }),
    });
    const result = await handleAdminSystemRoute({
      request: { method: 'POST' },
      url: new URL(`https://example.com/admin/api${path}`),
    }, handlers);
    assert.equal(result.ok, true);
    assert.deepEqual(calls.find((call) => call[0] === callName)[1], expected);
  }
});

test('admin system route ignores unrelated paths', async () => {
  const { calls, handlers } = createHandlers();
  assert.equal(await handleAdminSystemRoute({
    request: { method: 'GET' },
    url: new URL('https://example.com/other'),
  }, handlers), null);
  assert.deepEqual(calls, []);
});
