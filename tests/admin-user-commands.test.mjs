import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAdminUserCommand } from '../worker-src/telegram/admin-user-commands.js';

function createHandlers(overrides = {}) {
  const calls = [];
  return {
    calls,
    handlers: {
      sendNotice: async (text) => { calls.push(['notice', text]); },
      restartVerification: async (...args) => { calls.push(['restart', ...args]); },
      approveVerification: async (...args) => { calls.push(['approve', ...args]); },
      getUserProfile: async () => ({ displayName: 'Ada' }),
      getBlacklist: async () => null,
      getTrust: async () => null,
      getTopic: async () => null,
      getVerificationState: async () => null,
      formatUserDetail: (userId, profile) => `detail:${userId}:${profile.displayName}`,
      sendUserActions: async (userId) => { calls.push(['actions', userId]); },
      listUsers: async () => [],
      parseLimit: (value, fallback) => Number(value) || fallback,
      ...overrides,
    },
  };
}

test('verification control commands resolve context targets and preserve operator data', async () => {
  const { calls, handlers } = createHandlers();
  assert.equal(await handleAdminUserCommand({ trimmed: '/restart', defaultTargetUserId: 7, operator: 'admin:1' }, handlers), true);
  assert.deepEqual(calls[0], ['restart', 7, 'admin:1']);
  assert.equal(await handleAdminUserCommand({ trimmed: '/verifypass 8', operator: 'admin:1' }, handlers), true);
  const approve = calls.find((call) => call[0] === 'approve');
  assert.deepEqual(approve, ['approve', 8, 'admin:1', { notifyUser: true }]);
});

test('user detail and action commands use the resolved user adapters', async () => {
  const { calls, handlers } = createHandlers();
  await handleAdminUserCommand({ trimmed: '/user 9' }, handlers);
  assert.deepEqual(calls[0], ['notice', 'detail:9:Ada']);
  await handleAdminUserCommand({ trimmed: '/actions', defaultTargetUserId: 10 }, handlers);
  assert.equal(calls.some((call) => call[0] === 'actions' && call[1] === 10), true);
});

test('users command formats list results and unrelated commands fall through', async () => {
  const { calls, handlers } = createHandlers({
    listUsers: async (limit) => [{ userId: 2, displayName: 'Ada', lastSeenAt: `limit:${limit}` }],
  });
  assert.equal(await handleAdminUserCommand({ trimmed: '/users 5' }, handlers), true);
  assert.match(calls[0][1], /2 \| Ada \| limit:5/);
  assert.equal(await handleAdminUserCommand({ trimmed: '/panel' }, handlers), false);
});
