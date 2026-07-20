import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAdminUserRoute } from '../worker-src/routes/admin-users.js';

function createRequest(method = 'GET', body = {}) {
  return {
    method,
    async formData() { return new Map(Object.entries(body)); },
  };
}

function createHandlers(overrides = {}) {
  const calls = [];
  const handlers = {
    getAdminApiPrefix: () => '/admin/api',
    requireAdmin: async (...args) => calls.push(['auth', ...args]),
    parseLimit: (value, fallback) => Number(value) || fallback,
    parseOffset: (value, fallback) => Number(value) || fallback,
    parsePositiveInt: (value, fallback) => Number(value) || fallback,
    toChatId: (value) => Number(value),
    listUsersPage: async (...args) => {
      calls.push(['users', ...args]);
      return {
        items: [{ userId: 7 }], summary: { total: 1 }, total: 1,
        limit: args[0].limit, offset: args[0].offset, nextOffset: null,
        prevOffset: null, hasMore: false,
      };
    },
    listMessageHistory: async (...args) => { calls.push(['history', ...args]); return { items: [] }; },
    handleAvatarProxy: async (...args) => { calls.push(['avatar', ...args]); return { avatar: true }; },
    ensureUploadEnvironment: () => calls.push(['ensureUpload']),
    uploadWelcomeMedia: async (...args) => { calls.push(['upload', ...args]); return { fileId: 'file' }; },
    readJsonBody: async () => ({}),
    getOperator: () => 'admin:10',
    nowIso: async () => '2026-07-20T00:00:00.000Z',
    setBlacklist: async (...args) => { calls.push(['ban', ...args]); return args[1]; },
    deleteBlacklist: async (...args) => calls.push(['unban', ...args]),
    setTrust: async (...args) => { calls.push(['trust', ...args]); return args[1]; },
    deleteTrust: async (...args) => calls.push(['untrust', ...args]),
    restartVerification: async (...args) => { calls.push(['restart', ...args]); return { restarted: true }; },
    approveVerification: async (...args) => { calls.push(['approve', ...args]); return { verified: true }; },
    purgeUser: async (...args) => { calls.push(['delete', ...args]); return { deleted: true }; },
    createError: (status, message) => Object.assign(new Error(message), { status }),
    json: (body) => body,
    ...overrides,
  };
  return { calls, handlers };
}

test('admin users route returns structured pagination data', async () => {
  const { calls, handlers } = createHandlers();
  const result = await handleAdminUserRoute({
    request: createRequest(),
    url: new URL('https://example.com/admin/api/users?limit=20&offset=40'),
  }, handlers);
  assert.equal(result.ok, true);
  assert.deepEqual(result.users, [{ userId: 7 }]);
  assert.equal(result.limit, 20);
  assert.equal(result.offset, 40);
  assert.equal(result.source, 'kv');
  assert.deepEqual(calls.find((call) => call[0] === 'users')[1], { limit: 20, offset: 40 });
});

test('admin history route normalizes all filters', async () => {
  const { calls, handlers } = createHandlers();
  await handleAdminUserRoute({
    request: createRequest(),
    url: new URL('https://example.com/admin/api/history?userId=7&limit=25&beforeId=9&q=%20hello%20&direction=%20USER_TO_ADMIN%20&messageType=%20PHOTO%20'),
  }, handlers);
  assert.deepEqual(calls.find((call) => call[0] === 'history')[1], {
    userId: 7,
    limit: 25,
    beforeId: 9,
    query: 'hello',
    direction: 'user_to_admin',
    messageType: 'photo',
  });
});

test('admin avatar route returns the proxy response unchanged', async () => {
  const { handlers } = createHandlers();
  assert.deepEqual(await handleAdminUserRoute({
    request: createRequest(),
    url: new URL('https://example.com/admin/api/avatar'),
  }, handlers), { avatar: true });
});

test('welcome media upload rejects missing files', async () => {
  const { handlers } = createHandlers();
  await assert.rejects(handleAdminUserRoute({
    request: createRequest('POST', { type: 'photo' }),
    url: new URL('https://example.com/admin/api/welcome-media/upload'),
  }, handlers), (error) => error.status === 400 && /选择/.test(error.message));
});

test('admin user actions dispatch every supported operation', async (t) => {
  const cases = [
    ['ban', 'ban'], ['unban', 'unban'], ['trust', 'trust'], ['untrust', 'untrust'],
    ['restart', 'restart'], ['verifypass', 'approve'], ['delete', 'delete'],
  ];
  for (const [action, callName] of cases) {
    await t.test(action, async () => {
      const { calls, handlers } = createHandlers({ readJsonBody: async () => ({ action, userId: 7 }) });
      const result = await handleAdminUserRoute({
        request: createRequest('POST'),
        url: new URL('https://example.com/admin/api/users/action'),
      }, handlers);
      assert.equal(result.action, action);
      assert.equal(calls.some((call) => call[0] === callName), true);
      if (action === 'verifypass') {
        assert.deepEqual(calls.find((call) => call[0] === 'approve').slice(1), [7, 'admin:10', { notifyUser: true }]);
      }
    });
  }
});

test('admin user action rejects unknown operations and unrelated routes fall through', async () => {
  const { handlers } = createHandlers({ readJsonBody: async () => ({ action: 'unknown', userId: 7 }) });
  await assert.rejects(handleAdminUserRoute({
    request: createRequest('POST'),
    url: new URL('https://example.com/admin/api/users/action'),
  }, handlers), (error) => error.status === 400 && /action/.test(error.message));
  assert.equal(await handleAdminUserRoute({
    request: createRequest(),
    url: new URL('https://example.com/other'),
  }, handlers), null);
});
