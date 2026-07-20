import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyResolvedVerificationStatusToProfileState,
  isVerificationStateActiveState,
  isVerificationStateInvalidatedByD1State,
  resolveVerificationPassedAtState,
} from '../worker-src/auth/verification-resolution.js';

test('D1 revocation invalidates only older verified state', async () => {
  const calls = [];
  const handlers = {
    getD1Status: async () => ({ status: 'pending', clearedAt: '2026-07-20T00:00:00.000Z' }),
    writeLocalCleared: (...args) => calls.push(args),
  };
  assert.equal(await isVerificationStateInvalidatedByD1State({
    userId: 7,
    state: { verified: true, verifiedAt: '2026-07-19T00:00:00.000Z' },
  }, handlers), true);
  assert.deepEqual(calls, [[7, '2026-07-20T00:00:00.000Z']]);

  calls.length = 0;
  assert.equal(await isVerificationStateInvalidatedByD1State({
    userId: 7,
    state: { verified: true, verifiedAt: '2026-07-21T00:00:00.000Z' },
  }, handlers), false);
  assert.deepEqual(calls, []);
});

test('active verification checks profile then D1 before caching the pass', async () => {
  const calls = [];
  const state = { verified: true, verifiedAt: 'passed' };
  const handlers = {
    isInvalidatedByProfile: () => false,
    isInvalidatedByD1: async (...args) => { calls.push(['d1', ...args]); return false; },
    writeLocalPassed: (...args) => calls.push(['passed', ...args]),
  };
  assert.equal(await isVerificationStateActiveState({ userId: 8, state }, handlers), true);
  assert.deepEqual(calls.map((call) => call[0]), ['d1', 'passed']);

  assert.equal(await isVerificationStateActiveState({ userId: 8, state }, {
    ...handlers,
    isInvalidatedByProfile: () => true,
  }), false);
});

test('verification resolution prefers profile, then local cache, then D1', async () => {
  const calls = [];
  const base = {
    getProfilePassedAt: () => null,
    isPassedAtCleared: () => false,
    writeLocalPassed: (...args) => calls.push(['passed', ...args]),
    getLocalPassedAt: () => null,
    getD1PassedAt: async (...args) => { calls.push(['d1', ...args]); return 'd1-pass'; },
  };
  assert.equal(await resolveVerificationPassedAtState({ userId: 7, profile: {} }, {
    ...base,
    getProfilePassedAt: () => 'profile-pass',
  }), 'profile-pass');
  assert.deepEqual(calls, [['passed', 7, 'profile-pass']]);

  calls.length = 0;
  assert.equal(await resolveVerificationPassedAtState({ userId: 7 }, {
    ...base,
    getLocalPassedAt: () => 'local-pass',
  }), 'local-pass');
  assert.deepEqual(calls, []);

  assert.equal(await resolveVerificationPassedAtState({ userId: 7 }, base), 'd1-pass');
  assert.deepEqual(calls, [['d1', 7, null]]);
});

test('resolved pass and revocation metadata are applied to profiles', async () => {
  const nowIso = '2026-07-20T00:00:00.000Z';
  const verified = { displayName: 'User' };
  const verifiedResult = await applyResolvedVerificationStatusToProfileState({ userId: 7, profile: verified }, {
    isVerificationEnabled: () => true,
    resolvePassedAt: async () => 'passed-at',
    getLocalClearedAt: () => null,
    nowIso: async () => nowIso,
  });
  assert.equal(verifiedResult, verified);
  assert.equal(verified.verificationStatus, 'verified');
  assert.equal(verified.verificationPassedAt, 'passed-at');
  assert.equal(verified.verificationUpdatedAt, nowIso);

  const cleared = { verificationPassedAt: 'old' };
  await applyResolvedVerificationStatusToProfileState({ userId: 8, profile: cleared }, {
    isVerificationEnabled: () => true,
    resolvePassedAt: async () => null,
    getLocalClearedAt: () => 'cleared-at',
    nowIso: async () => nowIso,
  });
  assert.equal(cleared.verificationStatus, 'pending');
  assert.equal(cleared.verificationPassedAt, null);
  assert.equal(cleared.verificationClearedAt, 'cleared-at');
});

test('profile resolution is a no-op when verification is disabled', async () => {
  const profile = { displayName: 'User' };
  assert.equal(await applyResolvedVerificationStatusToProfileState({ userId: 9, profile }, {
    isVerificationEnabled: () => false,
    resolvePassedAt: async () => { throw new Error('must not resolve'); },
    getLocalClearedAt: () => null,
    nowIso: async () => 'unused',
  }), profile);
  assert.deepEqual(profile, { displayName: 'User' });
});
