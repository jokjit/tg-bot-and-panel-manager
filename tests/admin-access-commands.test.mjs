import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAdminAccessCommand } from '../worker-src/telegram/admin-access-commands.js';

function createHandlers(overrides = {}) {
  const calls = [];
  return {
    calls,
    handlers: {
      sendNotice: async (text) => { calls.push(['notice', text]); },
      setAuthorizedAdmin: async (userId, payload) => { calls.push(['set', userId, payload]); return payload; },
      deleteAuthorizedAdmin: async (userId) => { calls.push(['delete', userId]); },
      listAuthorizedAdmins: async () => [],
      parseLimit: (value, fallback) => Number(value) || fallback,
      ...overrides,
    },
  };
}

test('admin access commands require root or configured group-owner permission for grants and removals', async () => {
  const { calls, handlers } = createHandlers();
  assert.equal(await handleAdminAccessCommand({ trimmed: '/adminadd 7 helper', rootAdmin: false }, handlers), true);
  assert.equal(calls.length, 1);
  assert.match(calls[0][1], /根管理员或配置管理群的群主/);
  assert.equal(await handleAdminAccessCommand({ trimmed: '/admindel 7', rootAdmin: false }, handlers), true);
  assert.equal(calls.some((call) => call[0] === 'set' || call[0] === 'delete'), false);
});

test('admin grant persists audit metadata and removal targets the requested user', async () => {
  const { calls, handlers } = createHandlers();
  await handleAdminAccessCommand({
    trimmed: '/adminadd 7 support', rootAdmin: true, operator: 'admin:1',
    now: () => '2026-07-20T00:00:00.000Z',
  }, handlers);
  assert.deepEqual(calls[0], ['set', 7, {
    note: 'support', createdAt: '2026-07-20T00:00:00.000Z', createdBy: 'admin:1',
  }]);
  await handleAdminAccessCommand({ trimmed: '/admindel 7', rootAdmin: true }, handlers);
  assert.equal(calls.some((call) => call[0] === 'delete' && call[1] === 7), true);
});

test('admin list formats source and note while unrelated commands fall through', async () => {
  const { calls, handlers } = createHandlers({
    listAuthorizedAdmins: async (limit) => [{ userId: 2, source: 'kv', note: `limit:${limit}` }],
  });
  assert.equal(await handleAdminAccessCommand({ trimmed: '/admins 5' }, handlers), true);
  assert.match(calls[0][1], /2 \| kv \| limit:5/);
  assert.equal(await handleAdminAccessCommand({ trimmed: '/users 5' }, handlers), false);
});
