import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAuthorizedAdminRoute } from '../worker-src/routes/admin-access.js';

function createHandlers(overrides = {}) {
  const calls = [];
  const handlers = {
    getAdminApiPrefix: () => '/admin/api',
    requireAdmin: async (...args) => calls.push(['auth', ...args]),
    parseLimit: (value, fallback) => Number(value) || fallback,
    listAdmins: async (...args) => { calls.push(['list', ...args]); return [{ userId: 7 }]; },
    readJsonBody: async () => ({}),
    toChatId: (value) => Number(value),
    getOperator: () => 'admin:1',
    nowIso: async () => '2026-07-20T00:00:00.000Z',
    setAdmin: async (...args) => { calls.push(['add', ...args]); return args[1]; },
    deleteAdmin: async (...args) => calls.push(['remove', ...args]),
    createError: (status, message) => Object.assign(new Error(message), { status }),
    json: (body) => body,
    ...overrides,
  };
  return { calls, handlers };
}

test('authorized admin route lists with parsed limits', async () => {
  const { calls, handlers } = createHandlers();
  const result = await handleAuthorizedAdminRoute({
    request: { method: 'GET' },
    url: new URL('https://example.com/admin/api/admins?limit=20'),
  }, handlers);
  assert.deepEqual(result.admins, [{ userId: 7 }]);
  assert.deepEqual(calls.find((call) => call[0] === 'list'), ['list', 20]);
});

test('authorized admin add and remove preserve audit details', async () => {
  const added = createHandlers({
    readJsonBody: async () => ({ action: 'add', userId: '7', note: ' support ' }),
  });
  await handleAuthorizedAdminRoute({
    request: { method: 'POST' },
    url: new URL('https://example.com/admin/api/admins'),
  }, added.handlers);
  assert.deepEqual(added.calls.find((call) => call[0] === 'add').slice(1), [7, {
    note: 'support',
    createdAt: '2026-07-20T00:00:00.000Z',
    createdBy: 'admin:1',
  }]);

  const removed = createHandlers({ readJsonBody: async () => ({ action: 'remove', userId: 8 }) });
  const result = await handleAuthorizedAdminRoute({
    request: { method: 'POST' },
    url: new URL('https://example.com/admin/api/admins'),
  }, removed.handlers);
  assert.equal(result.userId, 8);
  assert.deepEqual(removed.calls.find((call) => call[0] === 'remove'), ['remove', 8]);
});

test('authorized admin route rejects unknown actions and ignores other paths', async () => {
  const { handlers } = createHandlers({ readJsonBody: async () => ({ action: 'unknown', userId: 7 }) });
  await assert.rejects(handleAuthorizedAdminRoute({
    request: { method: 'POST' },
    url: new URL('https://example.com/admin/api/admins'),
  }, handlers), (error) => error.status === 400);
  assert.equal(await handleAuthorizedAdminRoute({
    request: { method: 'GET' },
    url: new URL('https://example.com/other'),
  }, handlers), null);
});
