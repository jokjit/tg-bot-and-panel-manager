import assert from 'node:assert/strict';
import test from 'node:test';

import { handleVerificationCallback } from '../worker-src/telegram/verification-callback.js';

function createHandlers(result) {
  const calls = [];
  return {
    calls,
    handlers: {
      answer: async (...args) => { calls.push(['answer', ...args]); },
      processAnswer: async (...args) => { calls.push(['process', ...args]); return result; },
      clearPrompt: async (...args) => { calls.push(['clear', ...args]); },
      sendWelcome: async (...args) => { calls.push(['welcome', ...args]); },
      refreshVerification: async (...args) => { calls.push(['refresh', ...args]); return { token: 'new' }; },
      updatePrompt: async (...args) => { calls.push(['update', ...args]); },
    },
  };
}

function callback(data = 'verify:7:token:answer') {
  return { id: 'cb', data, from: { id: 7 }, message: { message_id: 70, chat: { id: 7 } } };
}

test('verification callback rejects mismatched owners before processing answers', async () => {
  const { calls, handlers } = createHandlers({ status: 'verified' });
  const value = callback();
  value.from.id = 8;
  assert.equal(await handleVerificationCallback({ callbackQuery: value }, handlers), 'invalid-owner');
  assert.deepEqual(calls, [['answer', '这不是你的验证题目。', true]]);
});

test('verification callback completes verified sessions and sends welcome content', async () => {
  const { calls, handlers } = createHandlers({ status: 'verified' });
  assert.equal(await handleVerificationCallback({ callbackQuery: callback() }, handlers), 'verified');
  assert.deepEqual(calls[0], ['process', 7, 'answer', { expectedToken: 'token' }]);
  assert.equal(calls.some((call) => call[0] === 'clear' && call[1] === 7 && call[2] === 70), true);
  assert.equal(calls.some((call) => call[0] === 'welcome'), true);
  assert.equal(calls.some((call) => call[0] === 'answer' && call[1] === '验证通过'), true);
});

test('verification callback refreshes token mismatches with the public URL', async () => {
  const { calls, handlers } = createHandlers({ status: 'token-mismatch' });
  await handleVerificationCallback({ callbackQuery: callback(), publicBaseUrl: 'https://worker.example.com' }, handlers);
  assert.deepEqual(calls.find((call) => call[0] === 'refresh'), ['refresh', 7, true]);
  assert.equal(calls.find((call) => call[0] === 'update')[3], 'https://worker.example.com');
});

test('verification callback renders failure counts for banned and incorrect answers', async () => {
  for (const result of [
    { status: 'banned', failureCount: 3, maxFailures: 3 },
    { status: 'incorrect', failureCount: 2, maxFailures: 3, correctAnswer: 'right', blockedUntil: 'later' },
  ]) {
    const { calls, handlers } = createHandlers(result);
    await handleVerificationCallback({ callbackQuery: callback() }, handlers);
    const clearText = calls.find((call) => call[0] === 'clear')[3];
    assert.match(clearText, new RegExp(`连续失败次数：${result.failureCount}/${result.maxFailures}`));
  }
});
