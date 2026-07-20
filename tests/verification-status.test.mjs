import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getProfileVerificationPassedAt,
  isProfileVerificationPassed,
  isVerificationPassedAtCleared,
  isVerificationSessionExpired,
  isVerificationSessionUsable,
  isVerificationStateInvalidatedByProfile,
  sanitizeVerificationSessionState,
} from '../worker-src/auth/verification-status.js';

test('verification sessions are cloned and checked against token and expiry', () => {
  const now = Date.parse('2026-07-20T00:00:00.000Z');
  const state = {
    sessionToken: 'secret',
    sessionExpiresAt: '2026-07-20T00:01:00.000Z',
    nested: { attempts: 1 },
  };
  const clone = sanitizeVerificationSessionState(state);
  clone.nested.attempts = 2;
  assert.equal(state.nested.attempts, 1);
  assert.equal(isVerificationSessionUsable(state, 'secret', now), true);
  assert.equal(isVerificationSessionUsable(state, 'wrong', now), false);
  assert.equal(isVerificationSessionExpired(state, Date.parse('2026-07-20T00:02:00.000Z')), true);
  assert.equal(isVerificationSessionUsable({ ...state, verified: true }, 'secret', now), false);
});

test('verification pass status respects profile and local revocations', () => {
  const passedAt = '2026-07-20T00:00:00.000Z';
  assert.equal(isVerificationPassedAtCleared(passedAt, {}), false);
  assert.equal(isVerificationPassedAtCleared(passedAt, {
    profileClearedAt: '2026-07-20T00:00:01.000Z',
  }), true);
  assert.equal(isVerificationPassedAtCleared(passedAt, {
    localClearedAt: '2026-07-20T00:00:01.000Z',
  }), true);
  assert.equal(isVerificationPassedAtCleared('invalid', {}), true);
});

test('profile verification timestamps and invalidation rules are deterministic', () => {
  const profile = {
    verificationStatus: 'verified',
    verificationPassedAt: '2026-07-20T00:00:00.000Z',
  };
  assert.equal(getProfileVerificationPassedAt(profile), profile.verificationPassedAt);
  assert.equal(isProfileVerificationPassed(profile), true);
  assert.equal(isProfileVerificationPassed({ ...profile, verificationStatus: 'revoked' }), false);
  assert.equal(isVerificationStateInvalidatedByProfile(
    { verified: true, verifiedAt: '2026-07-20T00:00:00.000Z' },
    { verificationClearedAt: '2026-07-20T00:00:01.000Z' },
  ), true);
  assert.equal(isVerificationStateInvalidatedByProfile(
    { verified: true, verifiedAt: '2026-07-20T00:00:00.000Z' },
    { firstSeenAt: '2026-07-20T00:00:02.000Z' },
  ), true);
});
