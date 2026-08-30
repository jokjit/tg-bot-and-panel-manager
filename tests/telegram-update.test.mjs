import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handleTelegramCallbackQuery,
  handleTelegramUpdate,
} from '../worker-src/telegram/update.js';

function createUpdateHandlers(options = {}) {
  const calls = [];
  const handlers = {
    handleCallbackQuery: async () => calls.push('callback'),
    toChatId: (value) => Number(value),
    isAuthorizedAdmin: async () => Boolean(options.authorizedAdmin),
    isTopicModeEnabled: () => Boolean(options.topicMode),
    getPrivateRelayAdminUserIds: async () => options.privateRelayAdminUserIds || [],
    hasPendingAdminInteraction: async () => Boolean(options.pendingAdminInteraction),
    handleAdminMessage: async () => calls.push('admin'),
    isUserVerificationEnabled: () => Boolean(options.verificationEnabled),
    ensureKv: () => calls.push('ensureKv'),
    upsertUserProfile: async (_env, _message, upsertOptions) => {
      calls.push(upsertOptions ? `profile:${String(upsertOptions.recordMessageActivity)}` : 'profile:verified');
    },
    getBlacklistEntry: async () => options.blacklisted ? { reason: 'blocked' } : null,
    sendBlockedMessage: async (_env, _chatId, text) => calls.push(`blocked:${text}`),
    isUserPrivateCommand: (message) => options.privateCommand ?? /^\/\S+/.test(String(message?.text || '').trim()),
    handleUserPrivateCommand: async () => calls.push('command'),
    ensureUserVerifiedOrPrompt: async (_message, _env, _baseUrl, verifyOptions) => {
      calls.push('verify');
      verifyOptions.stateRef.value = { stage: 'verified' };
      return options.verified !== false;
    },
    applyPostVerifyObservationLayer: async (_message, _env, _adminChatId, state) => {
      calls.push(`observe:${state?.stage || 'none'}`);
      return options.observationAllowed !== false;
    },
    handleUserMessage: async () => calls.push('relay'),
  };
  return { handlers, calls };
}

function messageUpdate(overrides = {}) {
  return {
    message: {
      message_id: 1,
      from: { id: 7 },
      chat: { id: 7, type: 'private' },
      text: 'hello',
      ...overrides,
    },
  };
}

test('Telegram update delegates callback queries before message handling', async () => {
  const { handlers, calls } = createUpdateHandlers();
  await handleTelegramUpdate(
    { update: { callback_query: { id: 'cb-1', data: 'adm:home' } }, env: {} },
    handlers,
  );
  assert.deepEqual(calls, ['callback']);
});

test('Telegram update routes authorized private commands to admin handling', async () => {
  const { handlers, calls } = createUpdateHandlers({ authorizedAdmin: true });
  await handleTelegramUpdate(
    { update: messageUpdate({ text: '/users' }), env: { ADMIN_CHAT_ID: '-100' } },
    handlers,
  );
  assert.deepEqual(calls, ['admin']);
});

test('Telegram update routes authorized private ordinary messages through user relay', async () => {
  const { handlers, calls } = createUpdateHandlers({ authorizedAdmin: true });
  await handleTelegramUpdate(
    { update: messageUpdate(), env: { ADMIN_CHAT_ID: '-100' } },
    handlers,
  );
  assert.deepEqual(calls, ['profile:true', 'verify', 'observe:verified', 'relay']);
});

test('Telegram update preserves admin handling for private pending panel input', async () => {
  const { handlers, calls } = createUpdateHandlers({ authorizedAdmin: true, pendingAdminInteraction: true });
  await handleTelegramUpdate(
    { update: messageUpdate({ text: '123' }), env: { ADMIN_CHAT_ID: '-100' } },
    handlers,
  );
  assert.deepEqual(calls, ['admin']);
});

test('Telegram update keeps configured private relay admins in admin handling', async () => {
  const { handlers, calls } = createUpdateHandlers({ authorizedAdmin: true });
  await handleTelegramUpdate(
    { update: messageUpdate(), env: { ADMIN_CHAT_ID: '-100', ADMIN_IDS: '7' } },
    handlers,
  );
  assert.deepEqual(calls, ['admin']);
});

test('Telegram update blocks blacklisted users before commands and verification', async () => {
  const { handlers, calls } = createUpdateHandlers({ blacklisted: true });
  await handleTelegramUpdate(
    {
      update: messageUpdate(),
      env: { ADMIN_CHAT_ID: '-100', BLOCKED_TEXT: 'Access blocked' },
      defaultBlockedText: 'Default blocked',
    },
    handlers,
  );
  assert.deepEqual(calls, ['profile:true', 'blocked:Access blocked']);
});

test('Telegram update preserves verification, observation, and relay order', async () => {
  const { handlers, calls } = createUpdateHandlers({ verificationEnabled: true });
  await handleTelegramUpdate(
    { update: messageUpdate(), env: { ADMIN_CHAT_ID: '-100' } },
    handlers,
  );
  assert.deepEqual(calls, [
    'ensureKv',
    'profile:false',
    'verify',
    'profile:verified',
    'observe:verified',
    'relay',
  ]);
});

test('Telegram callback query rejects legacy verification and dispatches admin actions', async () => {
  const calls = [];
  const handlers = {
    answerCallback: async (...args) => calls.push(['answer', ...args]),
    isAdminCommandPanelCallback: (data) => data === 'panel:home',
    handleAdminActionCallback: async (...args) => calls.push(['admin', ...args]),
  };
  const env = {};

  await handleTelegramCallbackQuery(
    { callbackQuery: { id: 'old', data: 'verify:7:token:1' }, env },
    handlers,
  );
  await handleTelegramCallbackQuery(
    { callbackQuery: { id: 'admin', data: 'panel:home' }, env, publicBaseUrl: 'https://bot.example.com' },
    handlers,
  );

  assert.equal(calls[0][0], 'answer');
  assert.equal(calls[0][4], true);
  assert.equal(calls[1][0], 'admin');
});
