import assert from 'node:assert/strict';
import test from 'node:test';

import {
  repairVerificationStateFromProfileState,
  resetVerificationStateAfterProfileRevocationState,
} from '../worker-src/auth/profile-state.js';

const nowIso = '2026-07-20T00:00:00.000Z';

test('profile repair returns null when no verified timestamp can be resolved', async () => {
  const calls = [];
  const result = await repairVerificationStateFromProfileState({ userId: 7 }, {
    resolvePassedAt: async () => null,
    nowIso: async () => nowIso,
    saveState: async () => calls.push('save'),
    clearLatest: async () => calls.push('clear'),
    markProfilePassed: async () => calls.push('profile'),
    clearPrompt: async () => calls.push('prompt'),
  });
  assert.equal(result, null);
  assert.deepEqual(calls, []);
});

test('profile repair persists against the supplied old state before clearing sessions', async () => {
  const calls = [];
  const oldState = {
    verified: false,
    promptMessageId: 44,
    postVerifyRemaining: 3,
    sessionToken: 'old',
    slider: { attempts: 1 },
    customField: 'preserved',
  };
  const result = await repairVerificationStateFromProfileState({
    userId: '7',
    state: oldState,
    profile: { verificationStatus: 'verified' },
  }, {
    resolvePassedAt: async () => '2026-07-19T00:00:00.000Z',
    nowIso: async () => nowIso,
    saveState: async (...args) => calls.push(['save', ...args]),
    clearLatest: async (...args) => calls.push(['clear', ...args]),
    markProfilePassed: async (...args) => calls.push(['profile', ...args]),
    clearPrompt: async (...args) => calls.push(['prompt', ...args]),
  });

  assert.equal(result.userId, 7);
  assert.equal(result.verified, true);
  assert.equal(result.verifiedAt, '2026-07-19T00:00:00.000Z');
  assert.equal(result.promptMessageId, null);
  assert.equal(result.sessionToken, null);
  assert.equal(result.slider, null);
  assert.equal(result.postVerifyRemaining, 3);
  assert.equal(result.customField, 'preserved');
  assert.deepEqual(calls.map((call) => call[0]), ['save', 'clear', 'profile', 'prompt']);
  assert.equal(calls[0][3], oldState);
  assert.deepEqual(calls[3].slice(1), ['7', 44]);
});

test('profile revocation resets all verification state and clears the latest session', async () => {
  const calls = [];
  const oldState = {
    verified: true,
    promptMessageId: 44,
    flowMode: 'graphic-two-step',
    sessionToken: 'old',
    grid: { attempts: 2 },
    failureCount: 4,
    customField: 'preserved',
  };
  const result = await resetVerificationStateAfterProfileRevocationState({
    userId: 8,
    state: oldState,
  }, {
    nowIso: async () => nowIso,
    saveState: async (...args) => calls.push(['save', ...args]),
    clearLatest: async (...args) => calls.push(['clear', ...args]),
  });

  assert.equal(result.verified, false);
  assert.equal(result.promptMessageId, null);
  assert.equal(result.flowMode, null);
  assert.equal(result.sessionToken, null);
  assert.equal(result.grid, null);
  assert.equal(result.failureCount, 0);
  assert.equal(result.customField, 'preserved');
  assert.equal(result.resetFromProfileAt, nowIso);
  assert.deepEqual(calls.map((call) => call[0]), ['save', 'clear']);
  assert.equal(calls[0][3], oldState);
});
