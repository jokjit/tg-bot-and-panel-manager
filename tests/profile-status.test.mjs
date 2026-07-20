import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearProfileVerificationPassedState,
  markProfileVerificationPassedState,
} from '../worker-src/auth/profile-status.js';

const nowIso = '2026-07-20T00:00:00.000Z';

function createHandlers(overrides = {}) {
  const calls = [];
  const handlers = {
    hasKv: () => true,
    nowIso: async () => nowIso,
    writeLocalPassed: async (...args) => { calls.push(['localPassed', ...args]); return args[1]; },
    writeD1Passed: async (...args) => calls.push(['d1Passed', ...args]),
    writeLocalCleared: async (...args) => calls.push(['localCleared', ...args]),
    writeD1Cleared: async (...args) => calls.push(['d1Cleared', ...args]),
    getProfile: async (...args) => { calls.push(['getProfile', ...args]); return { displayName: 'User' }; },
    saveProfile: async (...args) => calls.push(['save', ...args]),
    ...overrides,
  };
  return { calls, handlers };
}

test('marking profile verification passed is a no-op without KV', async () => {
  const { calls, handlers } = createHandlers({ hasKv: () => false });
  assert.equal(await markProfileVerificationPassedState({ userId: 7 }, handlers), null);
  assert.deepEqual(calls, []);
});

test('marking profile verification passed writes local, D1, then KV state', async () => {
  const existing = { userId: 7, displayName: 'User', verificationClearedAt: 'old' };
  const { calls, handlers } = createHandlers({
    getProfile: async (...args) => { calls.push(['getProfile', ...args]); return existing; },
  });
  const result = await markProfileVerificationPassedState({
    userId: '7',
    verifiedAt: '2026-07-19T00:00:00.000Z',
  }, handlers);

  assert.equal(result.userId, 7);
  assert.equal(result.verificationStatus, 'verified');
  assert.equal(result.verificationPassedAt, '2026-07-19T00:00:00.000Z');
  assert.equal(result.verificationClearedAt, null);
  assert.deepEqual(calls.map((call) => call[0]), ['localPassed', 'd1Passed', 'getProfile', 'save']);
  assert.deepEqual(calls[1].slice(1), ['7', '2026-07-19T00:00:00.000Z', nowIso]);
  assert.equal(calls[3][3], existing);
});

test('marking profile verification passed creates a minimal missing profile', async () => {
  const { calls, handlers } = createHandlers({
    getProfile: async () => null,
  });
  const result = await markProfileVerificationPassedState({ userId: '8' }, handlers);
  assert.equal(result.userId, 8);
  assert.equal(result.verificationPassedAt, nowIso);
  assert.equal(calls.find((call) => call[0] === 'save')[3].userId, 8);
});

test('clearing profile verification writes revocation state even without KV', async () => {
  const { calls, handlers } = createHandlers({ hasKv: () => false });
  assert.equal(await clearProfileVerificationPassedState({ userId: 7 }, handlers), null);
  assert.deepEqual(calls.map((call) => call[0]), ['localCleared', 'd1Cleared']);
});

test('clearing profile verification updates an existing KV profile', async () => {
  const existing = { userId: 9, verificationStatus: 'verified', verificationPassedAt: 'passed' };
  const { calls, handlers } = createHandlers({
    getProfile: async (...args) => { calls.push(['getProfile', ...args]); return existing; },
  });
  const result = await clearProfileVerificationPassedState({ userId: 9 }, handlers);

  assert.equal(result.verificationStatus, 'pending');
  assert.equal(result.verificationPassedAt, null);
  assert.equal(result.verificationClearedAt, nowIso);
  assert.deepEqual(calls.map((call) => call[0]), ['localCleared', 'd1Cleared', 'getProfile', 'save']);
  assert.equal(calls[3][3], existing);
});
