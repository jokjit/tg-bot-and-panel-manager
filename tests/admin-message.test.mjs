import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAuthorizedAdminMessage } from '../worker-src/telegram/admin-message.js';

function createMessage(overrides = {}) {
  return {
    from: { id: 10, first_name: 'Admin' },
    chat: { id: -100, type: 'supergroup' },
    message_id: 50,
    text: 'hello',
    ...overrides,
  };
}

function createHandlers(overrides = {}) {
  const calls = [];
  const handlers = {
    isAuthorizedAdmin: async (...args) => { calls.push(['authorized', ...args]); return true; },
    isAnonymousAdminMessage: () => false,
    isTelegramGroupAdmin: async (...args) => { calls.push(['groupAdmin', ...args]); return false; },
    sendAdminNotice: async (...args) => calls.push(['notice', ...args]),
    runNonCriticalTask: async (_ctx, task) => { calls.push(['nonCritical']); return task(); },
    syncTelegramProfile: async (...args) => calls.push(['sync', ...args]),
    isTopicModeEnabled: () => true,
    getPrivateRelayAdminUserIds: async () => [],
    tryConsumePendingWelcomeSetup: async () => false,
    tryConsumePendingImageUpload: async () => false,
    resolveAdminTargetUserId: async (...args) => { calls.push(['target', ...args]); return 7; },
    handleAdminCommand: async (...args) => { calls.push(['command', ...args]); return false; },
    sendUserMessage: async (...args) => calls.push(['send', ...args]),
    saveMessageHistory: async (...args) => calls.push(['history', ...args]),
    relayAdminMessageToUser: async (...args) => calls.push(['relay', ...args]),
    formatError: (error) => error.message,
    ...overrides,
  };
  return { calls, handlers };
}

test('admin message rejects unauthorized commands with guidance', async () => {
  const { calls, handlers } = createHandlers({ isAuthorizedAdmin: async () => false });
  await handleAuthorizedAdminMessage({
    message: createMessage({ text: '/users', chat: { id: 10, type: 'private' } }),
    adminChatId: -100,
  }, handlers);
  assert.equal(calls.some((call) => call[0] === 'notice'), true);
  assert.match(calls.find((call) => call[0] === 'notice')[2], /未识别到管理员权限/);
  assert.equal(calls.some((call) => call[0] === 'command'), false);
});

test('admin command handling short-circuits reply and relay paths', async () => {
  const { calls, handlers } = createHandlers({
    handleAdminCommand: async (...args) => { calls.push(['command', ...args]); return true; },
  });
  await handleAuthorizedAdminMessage({
    message: createMessage({ text: '/users' }),
    adminChatId: -100,
    publicBaseUrl: 'https://example.com',
  }, handlers);
  assert.equal(calls.some((call) => call[0] === 'command'), true);
  assert.equal(calls.some((call) => call[0] === 'send' || call[0] === 'relay'), false);
});

test('pending image upload short-circuits reply and relay paths', async () => {
  const { calls, handlers } = createHandlers({
    tryConsumePendingImageUpload: async (...args) => { calls.push(['upload', ...args]); return true; },
  });
  await handleAuthorizedAdminMessage({
    message: createMessage({ text: undefined, photo: [{ file_id: 'image' }] }),
    adminChatId: -100,
  }, handlers);
  assert.equal(calls.some((call) => call[0] === 'upload'), true);
  assert.equal(calls.some((call) => call[0] === 'command' || call[0] === 'relay'), false);
});

test('admin reply command sends normalized text and records history', async () => {
  const { calls, handlers } = createHandlers();
  const message = createMessage({ text: '/reply 7   hello user  ', message_thread_id: 33 });
  await handleAuthorizedAdminMessage({ message, adminChatId: -100 }, handlers);
  assert.deepEqual(calls.find((call) => call[0] === 'send'), ['send', 7, 'hello user']);
  const history = calls.find((call) => call[0] === 'history')[1];
  assert.equal(history.userId, 7);
  assert.equal(history.topicId, 33);
  assert.equal(history.messageType, 'text');
  assert.equal(history.textContent, 'hello user');
});

test('admin reply failure reports the error without recording history', async () => {
  const { calls, handlers } = createHandlers({
    sendUserMessage: async () => { throw new Error('Telegram unavailable'); },
  });
  await handleAuthorizedAdminMessage({
    message: createMessage({ text: '/reply 7 hello' }),
    adminChatId: -100,
  }, handlers);
  assert.match(calls.find((call) => call[0] === 'notice')[2], /Telegram unavailable/);
  assert.equal(calls.some((call) => call[0] === 'history'), false);
});

test('admin media relay records detected message metadata', async () => {
  const { calls, handlers } = createHandlers();
  const message = createMessage({
    text: undefined,
    caption: 'photo caption',
    photo: [{ file_id: 'small' }, { file_id: 'large' }],
  });
  await handleAuthorizedAdminMessage({ message, adminChatId: -100 }, handlers);
  assert.deepEqual(calls.find((call) => call[0] === 'relay').slice(1), [message, 7]);
  const history = calls.find((call) => call[0] === 'history')[1];
  assert.equal(history.messageType, 'photo');
  assert.equal(history.textContent, 'photo caption');
  assert.equal(history.mediaFileId, 'large');
});

test('admin messages outside authorized chat contexts stop before commands', async () => {
  const { calls, handlers } = createHandlers();
  await handleAuthorizedAdminMessage({
    message: createMessage({ chat: { id: -200, type: 'supergroup' } }),
    adminChatId: -100,
  }, handlers);
  assert.equal(calls.some((call) => call[0] === 'sync'), true);
  assert.equal(calls.some((call) => call[0] === 'command' || call[0] === 'relay'), false);
});
