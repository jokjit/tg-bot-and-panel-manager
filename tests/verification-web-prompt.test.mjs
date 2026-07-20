import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildVerificationWebUrl,
  normalizeVerificationBaseUrl,
  sendVerificationWebPromptRequest,
} from '../worker-src/telegram/verification-web-prompt.js';

function createHandlers(options = {}) {
  const calls = [];
  return {
    calls,
    handlers: {
      getMaxAttempts: () => 3,
      getRetryBlockMs: () => 60 * 60 * 1000,
      persistLatest: async (...args) => { calls.push(['persist', ...args]); },
      editMessage: async (...args) => {
        calls.push(['edit', ...args]);
        if (options.editError) throw new Error('edit failed');
      },
      sendMessage: async (...args) => {
        calls.push(['send', ...args]);
        return { message_id: options.messageId ?? 90 };
      },
      setPromptMessageId: async (...args) => { calls.push(['setPrompt', ...args]); },
    },
  };
}

test('verification prompt URLs normalize hosts and encode session identity', () => {
  assert.equal(
    normalizeVerificationBaseUrl(' example.com/path/?query=1#hash '),
    'https://example.com/path',
  );
  assert.equal(normalizeVerificationBaseUrl('ftp://example.com'), '');
  assert.equal(normalizeVerificationBaseUrl(''), '');
  assert.equal(
    buildVerificationWebUrl(
      { sessionToken: 'token with/slash' },
      7,
      'https://worker.example.com/',
      '/verify',
    ),
    'https://worker.example.com/verify?uid=7&token=token+with%2Fslash',
  );
  assert.equal(buildVerificationWebUrl({}, 7, 'https://worker.example.com'), '');
});

test('verification prompt sends configuration guidance when no URL is available', async () => {
  const { calls, handlers } = createHandlers();
  const result = await sendVerificationWebPromptRequest({
    userId: 7,
    state: { flowMode: 'numeric-choice', sessionToken: 'token' },
    publicBaseUrl: '',
    verifyPath: '/verify',
  }, handlers);

  assert.equal(result.delivery, 'sent');
  assert.equal(result.verifyUrl, '');
  assert.equal(calls.some((call) => call[0] === 'persist'), false);
  const payload = calls.find((call) => call[0] === 'send')[1];
  assert.match(payload.text, /数字图片验证/);
  assert.match(payload.text, /未找到可用验证链接/);
  assert.equal(payload.reply_markup, undefined);
});

test('verification prompt persists and edits an existing graphic challenge message', async () => {
  const state = {
    flowMode: 'graphic-two-step',
    sessionToken: 'token',
    promptMessageId: 70,
  };
  const { calls, handlers } = createHandlers();
  const result = await sendVerificationWebPromptRequest({
    userId: 7,
    state,
    publicBaseUrl: 'https://worker.example.com',
    verifyPath: '/verify',
  }, handlers);

  assert.deepEqual(result, {
    delivery: 'edited',
    messageId: 70,
    verifyUrl: 'https://worker.example.com/verify?uid=7&token=token',
  });
  assert.deepEqual(calls[0], ['persist', 7, state]);
  const payload = calls.find((call) => call[0] === 'edit')[1];
  assert.equal(payload.message_id, 70);
  assert.match(payload.text, /图形双重挑战/);
  assert.match(payload.text, /锁定 60 分钟/);
  assert.equal(payload.reply_markup.inline_keyboard[0][0].url, result.verifyUrl);
  assert.equal(calls.some((call) => call[0] === 'send'), false);
});

test('verification prompt falls back to a new message when editing fails', async () => {
  const { calls, handlers } = createHandlers({ editError: true, messageId: 91 });
  const result = await sendVerificationWebPromptRequest({
    userId: 7,
    state: { sessionToken: 'token', promptMessageId: 70 },
    publicBaseUrl: 'https://worker.example.com',
    verifyPath: '/verify',
  }, handlers);

  assert.equal(result.delivery, 'sent');
  assert.equal(result.messageId, 91);
  assert.equal(calls.some((call) => call[0] === 'edit'), true);
  assert.equal(calls.some((call) => call[0] === 'send'), true);
  assert.deepEqual(calls.find((call) => call[0] === 'setPrompt'), ['setPrompt', 7, 91]);
});

test('forced verification prompt skips editing and records the new message', async () => {
  const { calls, handlers } = createHandlers({ messageId: 92 });
  const result = await sendVerificationWebPromptRequest({
    userId: 7,
    state: { sessionToken: 'token', promptMessageId: 70 },
    publicBaseUrl: 'https://worker.example.com',
    verifyPath: '/verify',
    forceNewMessage: true,
  }, handlers);

  assert.equal(result.delivery, 'sent');
  assert.equal(calls.some((call) => call[0] === 'edit'), false);
  assert.deepEqual(calls.find((call) => call[0] === 'setPrompt'), ['setPrompt', 7, 92]);
});
