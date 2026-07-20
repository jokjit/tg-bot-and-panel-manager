import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOrRefreshVerificationWebSessionState,
  isReusableVerificationWebSession,
} from '../worker-src/auth/web-session.js';

const nowMs = Date.parse('2026-07-20T00:00:00.000Z');

function createHandlers(initialState, overrides = {}) {
  const calls = [];
  const handlers = {
    getState: async (userId) => { calls.push(['getState', userId]); return initialState; },
    getFlowMode: () => 'graphic-two-step',
    getProfile: async (userId) => { calls.push(['getProfile', userId]); return { passed: false }; },
    isStateActive: async (...args) => { calls.push(['active', ...args]); return false; },
    isProfilePassed: (profile) => profile?.passed === true,
    markProfilePassed: async (...args) => { calls.push(['markPassed', ...args]); },
    resetAfterRevocation: async (...args) => {
      calls.push(['reset', ...args]);
      return { ...args[1], verified: false };
    },
    repairFromProfile: async (...args) => { calls.push(['repair', ...args]); return null; },
    nowMs: () => nowMs,
    ensureProof: async (...args) => {
      calls.push(['proof', ...args]);
      return { ...args[1], proofEnsured: true };
    },
    deletePrompt: async (...args) => { calls.push(['deletePrompt', ...args]); },
    createSessionToken: () => 'new-session-token',
    getSessionExpireMs: () => 15 * 60 * 1000,
    createSliderChallenge: () => ({ type: 'rotation', attempts: 0 }),
    createGridChallenge: () => ({ cells: [], attempts: 0 }),
    createChoiceChallenge: () => ({ question: 'pick', options: ['1'], attempts: 0 }),
    saveState: async (...args) => { calls.push(['save', ...args]); },
    persistLatest: async (...args) => { calls.push(['persist', ...args]); },
    ...overrides,
  };
  return { calls, handlers };
}

test('web session reuse recognizes numeric and graphic challenge state', () => {
  const future = new Date(nowMs + 1000).toISOString();
  assert.equal(isReusableVerificationWebSession({
    sessionToken: 'token',
    sessionExpiresAt: future,
    flowMode: 'numeric-choice',
    stage: 'choice',
    choice: {},
  }, 'numeric-choice', nowMs), true);
  assert.equal(isReusableVerificationWebSession({
    sessionToken: 'token',
    sessionExpiresAt: future,
    flowMode: 'graphic-two-step',
    stage: 'grid',
    slider: {},
    grid: {},
  }, 'graphic-two-step', nowMs), true);
  assert.equal(isReusableVerificationWebSession({
    sessionToken: 'token',
    sessionExpiresAt: new Date(nowMs - 1).toISOString(),
    flowMode: 'graphic-two-step',
    stage: 'slider',
    slider: {},
    grid: {},
  }, 'graphic-two-step', nowMs), false);
});

test('web session returns active verification and repairs missing profile status', async () => {
  const existing = { verified: true, verifiedAt: 'passed-at' };
  const { calls, handlers } = createHandlers(existing, {
    isStateActive: async (...args) => { calls.push(['active', ...args]); return true; },
  });
  const result = await createOrRefreshVerificationWebSessionState({ userId: 7 }, handlers);
  assert.equal(result, existing);
  assert.deepEqual(calls.find((call) => call[0] === 'markPassed'), ['markPassed', 7, 'passed-at']);
  assert.equal(calls.some((call) => call[0] === 'repair' || call[0] === 'save'), false);
});

test('web session resets revoked verification and returns profile-repaired state', async () => {
  const existing = { verified: true, updatedAt: 'old' };
  const repaired = { verified: true, verifiedAt: 'profile-pass' };
  const { calls, handlers } = createHandlers(existing, {
    repairFromProfile: async (...args) => { calls.push(['repair', ...args]); return repaired; },
  });
  const result = await createOrRefreshVerificationWebSessionState({ userId: 7 }, handlers);
  assert.equal(result, repaired);
  assert.equal(calls.some((call) => call[0] === 'reset'), true);
  assert.equal(calls.filter((call) => call[0] === 'getProfile').length, 2);
  assert.equal(calls.some((call) => call[0] === 'save'), false);
});

test('web session preserves active blocks and reusable graphic sessions', async () => {
  const blocked = { blockedUntil: new Date(nowMs + 5000).toISOString() };
  const blockedSetup = createHandlers(blocked);
  assert.equal(await createOrRefreshVerificationWebSessionState({ userId: 7 }, blockedSetup.handlers), blocked);
  assert.equal(blockedSetup.calls.some((call) => call[0] === 'proof' || call[0] === 'save'), false);

  const reusable = {
    sessionToken: 'token',
    sessionExpiresAt: new Date(nowMs + 5000).toISOString(),
    flowMode: 'graphic-two-step',
    stage: 'slider',
    slider: { submitNonce: 'nonce' },
    grid: { cells: [] },
  };
  const reusableSetup = createHandlers(reusable);
  const result = await createOrRefreshVerificationWebSessionState({ userId: 7 }, reusableSetup.handlers);
  assert.equal(result.proofEnsured, true);
  assert.equal(reusableSetup.calls.some((call) => call[0] === 'proof'), true);
  assert.equal(reusableSetup.calls.some((call) => call[0] === 'save'), false);
});

test('forced numeric session deletes the old prompt and resets challenge state', async () => {
  const existing = {
    promptMessageId: 70,
    failureCount: 2,
    selectedAnswer: 'old',
    customField: 'preserved',
  };
  const { calls, handlers } = createHandlers(existing, {
    getFlowMode: () => 'numeric-choice',
  });
  const result = await createOrRefreshVerificationWebSessionState({ userId: 7, forceNew: true }, handlers);
  assert.deepEqual(calls.find((call) => call[0] === 'deletePrompt'), ['deletePrompt', 7, 70]);
  assert.equal(result.userId, 7);
  assert.equal(result.verificationVersion, 'web-v2');
  assert.equal(result.flowMode, 'numeric-choice');
  assert.equal(result.stage, 'choice');
  assert.equal(result.promptMessageId, null);
  assert.equal(result.failureCount, 0);
  assert.equal(result.selectedAnswer, null);
  assert.equal(result.customField, 'preserved');
  assert.equal(result.sessionToken, 'new-session-token');
  assert.equal(result.sessionIssuedAt, '2026-07-20T00:00:00.000Z');
  assert.equal(result.sessionExpiresAt, '2026-07-20T00:15:00.000Z');
  assert.equal(result.slider, null);
  assert.equal(result.grid, null);
  assert.equal(result.choice.question, 'pick');
  assert.equal(calls.find((call) => call[0] === 'save')[3], existing);
  assert.deepEqual(calls.find((call) => call[0] === 'persist').slice(0, 2), ['persist', 7]);
});

test('new graphic session keeps an existing prompt when refresh is not forced', async () => {
  const existing = { promptMessageId: 70, sessionToken: 'expired' };
  const { calls, handlers } = createHandlers(existing);
  const result = await createOrRefreshVerificationWebSessionState({ userId: 7 }, handlers);
  assert.equal(result.flowMode, 'graphic-two-step');
  assert.equal(result.stage, 'slider');
  assert.equal(result.promptMessageId, 70);
  assert.equal(result.slider.type, 'rotation');
  assert.deepEqual(result.grid.cells, []);
  assert.equal(result.choice, null);
  assert.equal(calls.some((call) => call[0] === 'deletePrompt'), false);
});
