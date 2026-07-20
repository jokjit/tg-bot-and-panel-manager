import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handleAdminBlacklistRoute,
  handleAdminTrustRoute,
} from '../worker-src/routes/admin-moderation.js';

function createHandlers(overrides = {}) {
  const calls = [];
  const handlers = {
    getAdminApiPrefix: () => '/admin/api',
    requireAdmin: async (...args) => calls.push(['auth', ...args]),
    parseLimit: (value, fallback) => Number(value) || fallback,
    parseOffset: (value, fallback) => Number(value) || fallback,
    listPage: async (...args) => {
      calls.push(['list', ...args]);
      return {
        items: [{ userId: 7 }], total: 1, limit: args[0].limit, offset: args[0].offset,
        nextOffset: null, prevOffset: null, hasMore: false, source: 'd1',
      };
    },
    readJsonBody: async () => ({}),
    toChatId: (value) => Number(value),
    getOperator: () => 'admin:10',
    nowIso: async () => '2026-07-20T00:00:00.000Z',
    addEntry: async (...args) => { calls.push(['add', ...args]); return args[1]; },
    deleteEntry: async (...args) => calls.push(['remove', ...args]),
    createError: (status, message) => Object.assign(new Error(message), { status }),
    json: (body) => body,
    ...overrides,
  };
  return { calls, handlers };
}

test('blacklist and trust routes expose identical pagination contracts', async () => {
  for (const [path, key, route] of [
    ['blacklist', 'blacklist', handleAdminBlacklistRoute],
    ['trust', 'trust', handleAdminTrustRoute],
  ]) {
    const { calls, handlers } = createHandlers();
    const result = await route({
      request: { method: 'GET' },
      url: new URL(`https://example.com/admin/api/${path}?limit=20&offset=40`),
    }, handlers);
    assert.deepEqual(result[key], [{ userId: 7 }]);
    assert.equal(result.source, 'd1');
    assert.deepEqual(calls.find((call) => call[0] === 'list')[1], { limit: 20, offset: 40 });
  }
});

test('blacklist add records reason and audit metadata', async () => {
  const { calls, handlers } = createHandlers({
    readJsonBody: async () => ({ action: ' ADD ', userId: '7', reason: ' spam ' }),
  });
  const result = await handleAdminBlacklistRoute({
    request: { method: 'POST' },
    url: new URL('https://example.com/admin/api/blacklist'),
  }, handlers);
  assert.equal(result.action, 'add');
  assert.deepEqual(calls.find((call) => call[0] === 'add').slice(1), [7, {
    reason: 'spam',
    createdAt: '2026-07-20T00:00:00.000Z',
    createdBy: 'admin:10',
  }]);
});

test('trust add uses its default note and remove targets the parsed user', async () => {
  const added = createHandlers({
    readJsonBody: async () => ({ action: 'add', userId: 8, note: '   ' }),
  });
  await handleAdminTrustRoute({
    request: { method: 'POST' },
    url: new URL('https://example.com/admin/api/trust'),
  }, added.handlers);
  assert.equal(added.calls.find((call) => call[0] === 'add')[2].note, '通过白名单面板设为信任用户');

  const removed = createHandlers({ readJsonBody: async () => ({ action: 'remove', userId: 9 }) });
  const result = await handleAdminTrustRoute({
    request: { method: 'POST' },
    url: new URL('https://example.com/admin/api/trust'),
  }, removed.handlers);
  assert.equal(result.userId, 9);
  assert.deepEqual(removed.calls.find((call) => call[0] === 'remove'), ['remove', 9]);
});

test('moderation routes reject unknown actions and ignore unrelated paths', async () => {
  const { handlers } = createHandlers({ readJsonBody: async () => ({ action: 'unknown', userId: 7 }) });
  await assert.rejects(handleAdminBlacklistRoute({
    request: { method: 'POST' },
    url: new URL('https://example.com/admin/api/blacklist'),
  }, handlers), (error) => error.status === 400);
  assert.equal(await handleAdminTrustRoute({
    request: { method: 'GET' },
    url: new URL('https://example.com/other'),
  }, handlers), null);
});
