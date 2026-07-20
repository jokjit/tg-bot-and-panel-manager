import assert from 'node:assert/strict';
import test from 'node:test';

import { processUserVerificationAnswerState } from '../worker-src/telegram/verification-answer.js';

const nowMs = Date.parse('2026-07-20T00:00:00.000Z');

function createHandlers(state, overrides = {}) {
  const calls = [];
  const handlers = {
    getState: async (...args) => { calls.push(['getState', ...args]); return state; },
    nowMs: () => nowMs,
    isChallengeExpired: () => false,
    markFailed: async (...args) => {
      calls.push(['failed', ...args]);
      return { failureCount: 1, blockedUntil: 'later' };
    },
    getTimeoutBlockMs: () => 30_000,
    getFailBlockMs: () => 60_000,
    getMaxFailures: () => 3,
    ban: async (...args) => { calls.push(['ban', ...args]); return { reason: 'auto-ban' }; },
    markVerified: async (...args) => calls.push(['verified', ...args]),
    ...overrides,
  };
  return { calls, handlers };
}

test('verification answer returns terminal and unavailable states without mutation', async () => {
  const verified = createHandlers({ verified: true });
  assert.deepEqual(await processUserVerificationAnswerState({ userId: 7, answer: '1' }, verified.handlers), {
    status: 'already-verified',
  });

  const blocked = createHandlers({ blockedUntil: new Date(nowMs + 1500).toISOString() });
  assert.deepEqual(await processUserVerificationAnswerState({ userId: 7 }, blocked.handlers), {
    status: 'blocked',
    leftSec: 2,
  });

  const missing = createHandlers({ verified: false });
  assert.deepEqual(await processUserVerificationAnswerState({ userId: 7 }, missing.handlers), {
    status: 'no-challenge',
  });
  assert.equal(missing.calls.some((call) => call[0] === 'failed' || call[0] === 'verified'), false);
});

test('verification answer rejects mismatched tokens before expiry checks', async () => {
  const { calls, handlers } = createHandlers({ challenge: { token: 'expected', correct: 2 } }, {
    isChallengeExpired: () => { calls.push(['expired']); return true; },
  });
  const result = await processUserVerificationAnswerState({
    userId: 7,
    answer: 2,
    options: { expectedToken: 'other' },
  }, handlers);
  assert.deepEqual(result, { status: 'token-mismatch' });
  assert.equal(calls.some((call) => call[0] === 'expired'), false);
});

test('expired verification applies a timeout block without increasing the ban count', async () => {
  const { calls, handlers } = createHandlers({ challenge: { token: 'token', correct: 4 } }, {
    isChallengeExpired: () => true,
  });
  const result = await processUserVerificationAnswerState({ userId: 7, answer: 4 }, handlers);
  assert.deepEqual(result, { status: 'expired' });
  assert.deepEqual(calls.find((call) => call[0] === 'failed'), ['failed', 7, {
    selectedAnswer: '',
    correctAnswer: '4',
    blockMs: 30_000,
    countForBan: false,
  }]);
});

test('verification answer rejects a repeated submission after expiry validation', async () => {
  const { calls, handlers } = createHandlers({
    challenge: { token: 'token', correct: 4 },
    answeredAt: 'already',
  });
  assert.deepEqual(await processUserVerificationAnswerState({ userId: 7, answer: 4 }, handlers), {
    status: 'already-answered',
  });
  assert.equal(calls.some((call) => call[0] === 'failed' || call[0] === 'verified'), false);
});

test('incorrect verification reports counters before the auto-ban threshold', async () => {
  const { calls, handlers } = createHandlers({ challenge: { correct: 3 } }, {
    markFailed: async (...args) => {
      calls.push(['failed', ...args]);
      return { failureCount: 2, blockedUntil: 'later' };
    },
  });
  const result = await processUserVerificationAnswerState({ userId: 8, answer: 1 }, handlers);
  assert.deepEqual(result, {
    status: 'incorrect',
    correctAnswer: '3',
    blockedUntil: 'later',
    failureCount: 2,
    maxFailures: 3,
  });
  assert.equal(calls.some((call) => call[0] === 'ban'), false);
});

test('incorrect verification auto-bans at the configured threshold', async () => {
  const failedState = { failureCount: 3, blockedUntil: 'later' };
  const { calls, handlers } = createHandlers({ challenge: { correct: 3 } }, {
    markFailed: async (...args) => { calls.push(['failed', ...args]); return failedState; },
  });
  const result = await processUserVerificationAnswerState({ userId: 8, answer: 1 }, handlers);
  assert.equal(result.status, 'banned');
  assert.equal(result.blacklist.reason, 'auto-ban');
  assert.deepEqual(calls.find((call) => call[0] === 'ban'), ['ban', 8, failedState, 3]);
});

test('correct verification marks the user as passed', async () => {
  const { calls, handlers } = createHandlers({ challenge: { correct: 3 } });
  assert.deepEqual(await processUserVerificationAnswerState({ userId: 9, answer: '3' }, handlers), {
    status: 'verified',
  });
  assert.deepEqual(calls.find((call) => call[0] === 'verified'), ['verified', 9]);
});
