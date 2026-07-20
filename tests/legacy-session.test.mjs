import assert from 'node:assert/strict';
import test from 'node:test';

import { createOrRefreshLegacyVerificationState } from '../worker-src/auth/legacy-session.js';

function createHandlers(initialState, overrides = {}) {
  const calls = [];
  const handlers = {
    getState: async (...args) => { calls.push(['getState', ...args]); return initialState; },
    getProfile: async (...args) => { calls.push(['getProfile', ...args]); return { passed: false }; },
    isStateActive: async (...args) => { calls.push(['active', ...args]); return false; },
    isProfilePassed: (profile) => profile?.passed === true,
    markProfilePassed: async (...args) => calls.push(['markPassed', ...args]),
    resetAfterRevocation: async (...args) => {
      calls.push(['reset', ...args]);
      return { ...args[1], verified: false };
    },
    repairFromProfile: async (...args) => { calls.push(['repair', ...args]); return null; },
    isChallengeExpired: () => false,
    createChallenge: async () => ({ question: '1 + 1', answer: '2' }),
    nowIso: async () => '2026-07-20T00:00:00.000Z',
    saveState: async (...args) => calls.push(['save', ...args]),
    clearLatest: async (...args) => calls.push(['clear', ...args]),
    ...overrides,
  };
  return { calls, handlers };
}

test('legacy session returns active verification and repairs profile status', async () => {
  const existing = { verified: true, verifiedAt: 'passed-at' };
  const { calls, handlers } = createHandlers(existing, {
    isStateActive: async (...args) => { calls.push(['active', ...args]); return true; },
  });
  const result = await createOrRefreshLegacyVerificationState({ userId: 7 }, handlers);

  assert.equal(result, existing);
  assert.deepEqual(calls.find((call) => call[0] === 'markPassed'), ['markPassed', 7, 'passed-at']);
  assert.equal(calls.some((call) => call[0] === 'repair' || call[0] === 'save'), false);
});

test('legacy session resets revoked verification and accepts profile repair', async () => {
  const existing = { verified: true, updatedAt: 'old' };
  const repaired = { verified: true, verifiedAt: 'profile-pass' };
  const { calls, handlers } = createHandlers(existing, {
    repairFromProfile: async (...args) => { calls.push(['repair', ...args]); return repaired; },
  });
  const result = await createOrRefreshLegacyVerificationState({ userId: 7 }, handlers);

  assert.equal(result, repaired);
  assert.equal(calls.some((call) => call[0] === 'reset'), true);
  assert.equal(calls.filter((call) => call[0] === 'getProfile').length, 2);
  assert.equal(calls.some((call) => call[0] === 'save'), false);
});

test('legacy session reuses an unexpired challenge unless refresh is forced', async () => {
  const existing = { challenge: { token: 'active' }, failureCount: 2 };
  const reusable = createHandlers(existing);
  assert.equal(
    await createOrRefreshLegacyVerificationState({ userId: 7 }, reusable.handlers),
    existing,
  );
  assert.equal(reusable.calls.some((call) => call[0] === 'save'), false);

  const forced = createHandlers(existing);
  const result = await createOrRefreshLegacyVerificationState({ userId: '7', forceNew: true }, forced.handlers);
  assert.equal(result.userId, 7);
  assert.equal(result.failureCount, 2);
  assert.deepEqual(result.challenge, { question: '1 + 1', answer: '2' });
  assert.deepEqual(forced.calls.map((call) => call[0]), ['getState', 'getProfile', 'repair', 'save', 'clear']);
  assert.equal(forced.calls.find((call) => call[0] === 'save')[3], existing);
});

test('legacy session replaces an expired challenge and preserves the prompt ID', async () => {
  const existing = { challenge: { token: 'expired' }, promptMessageId: 44 };
  const { calls, handlers } = createHandlers(existing, {
    isChallengeExpired: () => true,
  });
  const result = await createOrRefreshLegacyVerificationState({ userId: 8 }, handlers);

  assert.equal(result.promptMessageId, 44);
  assert.equal(result.updatedAt, '2026-07-20T00:00:00.000Z');
  assert.deepEqual(calls.slice(-2).map((call) => call[0]), ['save', 'clear']);
});
