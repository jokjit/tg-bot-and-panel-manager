import assert from 'node:assert/strict';
import test from 'node:test';

import { handleVerificationText } from '../worker-src/telegram/verification-text.js';

function createHandlers(result, state = { challenge: { correct: '2' }, promptMessageId: 70 }) {
  const calls = [];
  return {
    calls,
    handlers: {
      getVerificationState: async () => state,
      processAnswer: async (...args) => { calls.push(['process', ...args]); return result; },
      clearPrompt: async (...args) => { calls.push(['clear', ...args]); },
      sendWelcome: async (...args) => { calls.push(['welcome', ...args]); },
      sendMessage: async (...args) => { calls.push(['message', ...args]); },
    },
  };
}

test('verification text ignores messages without an active challenge', async () => {
  const { calls, handlers } = createHandlers({ status: 'verified' }, { verified: true });
  assert.equal(await handleVerificationText({ chat: { id: 7 }, text: '2' }, handlers), false);
  assert.deepEqual(calls, []);
});

test('verification text clears successful prompts and sends welcome content', async () => {
  const { calls, handlers } = createHandlers({ status: 'verified' });
  assert.equal(await handleVerificationText({ chat: { id: 7 }, text: '2' }, handlers), true);
  assert.deepEqual(calls[0], ['process', 7, '2']);
  assert.equal(calls.some((call) => call[0] === 'clear' && call[2] === 70), true);
  assert.equal(calls.some((call) => call[0] === 'welcome'), true);
});

test('verification text handles blocked, expired, and repeated submissions', async () => {
  for (const result of [{ status: 'blocked', leftSec: 12 }, { status: 'expired' }, { status: 'already-answered' }]) {
    const { calls, handlers } = createHandlers(result);
    assert.equal(await handleVerificationText({ chat: { id: 7 }, text: '2' }, handlers), true);
    assert.equal(calls.some((call) => call[0] === 'message'), true);
  }
});

test('verification text includes failure counts in incorrect and banned prompt updates', async () => {
  for (const result of [
    { status: 'incorrect', correctAnswer: '3', failureCount: 2, maxFailures: 3, blockedUntil: 'later' },
    { status: 'banned', failureCount: 3, maxFailures: 3 },
  ]) {
    const { calls, handlers } = createHandlers(result);
    await handleVerificationText({ chat: { id: 7 }, text: '2' }, handlers);
    assert.match(calls.find((call) => call[0] === 'clear')[3], new RegExp(`连续失败次数：${result.failureCount}/${result.maxFailures}`));
  }
});
