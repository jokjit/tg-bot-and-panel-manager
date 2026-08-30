import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAdminSystemCommand } from '../worker-src/telegram/admin-system-commands.js';

function createHandlers(overrides = {}) {
  const calls = [];
  return {
    calls,
    handlers: {
      sendNotice: async (text) => { calls.push(['notice', text]); },
      syncCommands: async () => ({ adminCommandChats: [], adminCommandTargets: [], failedScopes: [] }),
      clearWelcomeSetup: async (scope) => { calls.push(['clearWelcome', scope]); },
      setWelcomeSetup: async (scope, payload) => { calls.push(['setWelcome', scope, payload]); },
      normalizeWelcomeType: (value) => value,
      resolvePanelUrl: async () => 'https://panel.example.com',
      resendPanelPassword: async () => ({ message: 'resent' }),
      resetPanelPassword: async () => ({ message: 'reset' }),
      ...overrides,
    },
  };
}

test('system help reflects topic mode and command sync reports failed scopes', async () => {
  const { calls, handlers } = createHandlers({
    syncCommands: async () => ({ adminCommandChats: [-100], adminCommandTargets: [7], failedScopes: [{ scope: 'chat' }] }),
  });
  assert.equal(await handleAdminSystemCommand({ trimmed: '/help', topicModeEnabled: true }, handlers), true);
  assert.match(calls[0][1], /当前默认是话题模式/);
  await handleAdminSystemCommand({ trimmed: '/setcommands' }, handlers);
  assert.match(calls[1][1], /管理聊天：-100/);
  assert.match(calls[1][1], /失败 scope：1/);
});

test('welcome setup commands persist scope, media type, and operator metadata', async () => {
  const { calls, handlers } = createHandlers();
  await handleAdminSystemCommand({
    trimmed: '/setwelcome photo', pendingScope: 'chat:1', operator: 'admin:7', chatId: 1, threadId: 2,
  }, handlers);
  assert.deepEqual(calls[0], ['setWelcome', 'chat:1', {
    requestedType: 'photo', createdBy: 'admin:7', chatId: 1, threadId: 2,
  }]);
  assert.match(calls[1][1], /未附带时保留原文案/);
  await handleAdminSystemCommand({
    trimmed: '/setwelcometext', pendingScope: 'chat:1', operator: 'admin:7', chatId: 1, threadId: 2,
  }, handlers);
  assert.deepEqual(calls.find((call) => call[0] === 'setWelcome' && call[2].requestedType === 'text-only'), [
    'setWelcome', 'chat:1', {
      requestedType: 'text-only', createdBy: 'admin:7', chatId: 1, threadId: 2,
    },
  ]);
  assert.equal(calls.some((call) => call[0] === 'notice' && /贴纸不支持 caption/.test(call[1])), true);
  await handleAdminSystemCommand({ trimmed: '/cancelwelcome', pendingScope: 'chat:1' }, handlers);
  assert.equal(calls.some((call) => call[0] === 'clearWelcome' && call[1] === 'chat:1'), true);
});

test('panel commands use URL and password adapters while unrelated commands fall through', async () => {
  const { calls, handlers } = createHandlers();
  await handleAdminSystemCommand({ trimmed: '/panel' }, handlers);
  assert.match(calls[0][1], /https:\/\/panel\.example\.com/);
  await handleAdminSystemCommand({ trimmed: '/panelpass' }, handlers);
  await handleAdminSystemCommand({ trimmed: '/panelreset' }, handlers);
  assert.equal(calls.some((call) => call[1] === 'resent'), true);
  assert.equal(calls.some((call) => call[1] === 'reset'), true);
  assert.equal(await handleAdminSystemCommand({ trimmed: '/users' }, handlers), false);
});
