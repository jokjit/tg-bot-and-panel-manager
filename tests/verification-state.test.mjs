import assert from 'node:assert/strict';
import test from 'node:test';

import {
  markUserVerificationFailedState,
  markUserVerifiedState,
} from '../worker-src/telegram/verification-state.js';

test('marking a user verified resets challenge state and clears the latest session', async () => {
  const calls = [];
  const existing = {
    userId: 7,
    verified: false,
    sessionToken: 'old',
    slider: { attempts: 2 },
    grid: { attempts: 1 },
    failureCount: 4,
  };
  const result = await markUserVerifiedState({ userId: '7' }, {
    getState: async () => existing,
    nowIso: async () => '2026-07-20T00:00:00.000Z',
    markProfilePassed: async (...args) => calls.push(['profile', ...args]),
    getObserveMessageCount: async () => 3,
    saveState: async (...args) => calls.push(['save', ...args]),
    clearLatest: async (...args) => calls.push(['clear', ...args]),
  });

  assert.equal(result.verified, true);
  assert.equal(result.stage, 'passed');
  assert.equal(result.sessionToken, null);
  assert.equal(result.slider, null);
  assert.equal(result.grid, null);
  assert.equal(result.failureCount, 0);
  assert.equal(result.postVerifyRemaining, 3);
  assert.deepEqual(calls.map((call) => call[0]), ['profile', 'save', 'clear']);
  assert.equal(calls[1][3], existing);
});

test('failed verification increments the ban counter and applies a timed block', async () => {
  const calls = [];
  const result = await markUserVerificationFailedState({
    userId: 8,
    payload: { blockMs: 60_000, selectedAnswer: 2, correctAnswer: 3 },
  }, {
    getState: async () => ({ failureCount: 2, challenge: { stale: true } }),
    getDefaultBlockMs: async () => 999,
    nowMs: async () => Date.parse('2026-07-20T00:00:00.000Z'),
    saveState: async (...args) => calls.push(['save', ...args]),
    clearLatest: async (...args) => calls.push(['clear', ...args]),
  });

  assert.equal(result.failureCount, 3);
  assert.equal(result.answeredAt, '2026-07-20T00:00:00.000Z');
  assert.equal(result.blockedUntil, '2026-07-20T00:01:00.000Z');
  assert.equal(result.selectedAnswer, '2');
  assert.equal(result.correctAnswer, '3');
  assert.equal(result.challenge, null);
  assert.deepEqual(calls.map((call) => call[0]), ['save', 'clear']);
});

test('failed verification can preserve the existing counter for non-ban failures', async () => {
  const result = await markUserVerificationFailedState({
    userId: 9,
    payload: { countForBan: false },
  }, {
    getState: async () => ({ failureCount: 5 }),
    getDefaultBlockMs: async () => 1000,
    nowMs: async () => 0,
    saveState: async () => {},
    clearLatest: async () => {},
  });

  assert.equal(result.failureCount, 5);
  assert.equal(result.blockedUntil, '1970-01-01T00:00:01.000Z');
});
