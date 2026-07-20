import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAdminActionCallbackCommand } from '../worker-src/telegram/admin-action-callback.js';

function createHandlers() {
  const calls = [];
  return {
    calls,
    handlers: {
      answer: async (...args) => { calls.push(['answer', ...args]); },
      sendNotice: async (...args) => { calls.push(['notice', ...args]); },
      setBlacklist: async () => ({ reason: 'button reason' }),
      deleteBlacklist: async (id) => { calls.push(['deleteBlacklist', id]); },
      setTrust: async () => ({ note: 'button note' }),
      deleteTrust: async (id) => { calls.push(['deleteTrust', id]); },
      restartVerification: async (id, operator) => { calls.push(['restart', id, operator]); },
      approveVerification: async (...args) => { calls.push(['approve', ...args]); },
      sendBlockedMessage: async (id) => { calls.push(['blocked', id]); },
      getUserProfile: async () => ({ displayName: 'Ada' }),
      getBlacklist: async () => null,
      getTrust: async () => null,
      getTopic: async () => null,
      getVerificationState: async () => null,
      formatUserDetail: (id) => `detail:${id}`,
    },
  };
}

test('admin callback parses target and executes user detail/restart actions', async () => {
  const { calls, handlers } = createHandlers();
  await handleAdminActionCallbackCommand({ data: 'adm:user:7', sourceMessage: { chat: { id: -1 } } }, handlers);
  assert.deepEqual(calls[0], ['notice', { chat: { id: -1 } }, 'detail:7']);
  await handleAdminActionCallbackCommand({ data: 'adm:restart:8', operator: 'admin:1' }, handlers);
  assert.deepEqual(calls.find((call) => call[0] === 'restart'), ['restart', 8, 'admin:1']);
});

test('admin callback handles moderation and verification actions with acknowledgements', async () => {
  const { calls, handlers } = createHandlers();
  await handleAdminActionCallbackCommand({ data: 'adm:ban:9', blockedText: 'blocked', operator: 'admin:1' }, handlers);
  await handleAdminActionCallbackCommand({ data: 'adm:trust:9', operator: 'admin:1' }, handlers);
  await handleAdminActionCallbackCommand({ data: 'adm:verifypass:9', operator: 'admin:1' }, handlers);
  assert.equal(calls.some((call) => call[0] === 'blocked' && call[1] === 9), true);
  assert.equal(calls.some((call) => call[0] === 'answer' && call[1] === '已拉黑该用户'), true);
  assert.equal(calls.some((call) => call[0] === 'answer' && call[1] === '已设为信任用户'), true);
  assert.equal(calls.some((call) => call[0] === 'approve'), true);
});

test('admin callback rejects malformed and unknown actions', async () => {
  const { calls, handlers } = createHandlers();
  await handleAdminActionCallbackCommand({ data: 'adm:ban:not-a-user' }, handlers);
  await handleAdminActionCallbackCommand({ data: 'adm:unknown:3' }, handlers);
  assert.deepEqual(calls.map((call) => call.slice(0, 2)), [
    ['answer', '无效的目标用户'],
    ['answer', '未识别的管理员操作'],
  ]);
});
