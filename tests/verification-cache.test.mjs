import assert from 'node:assert/strict';
import test from 'node:test';

import { createVerificationCache } from '../worker-src/auth/verification-cache.js';

test('verification cache keeps status, session, and local timestamps isolated by user', () => {
  const cache = createVerificationCache({ statusTtlMs: 100, passedTtlMs: 100, sessionTtlMs: 100 });
  const passed = cache.writePassed(1, '2026-07-20T00:00:00.000Z');
  assert.equal(passed, '2026-07-20T00:00:00.000Z');
  assert.equal(cache.getPassedAt(1), passed);
  assert.equal(cache.getClearedAt(1), null);

  const cleared = cache.writeCleared(1, '2026-07-20T01:00:00.000Z');
  assert.equal(cache.getPassedAt(1), null);
  assert.equal(cache.getClearedAt(1), cleared);
  assert.equal(cache.getClearedAt(2), null);

  const state = { sessionToken: 'token-1', sessionExpiresAt: '2999-01-01T00:00:00.000Z', stage: 'choice' };
  assert.deepEqual(cache.writeSession(1, state), { ...state });
  assert.equal(cache.readSession(1, 'token-1').sessionToken, 'token-1');
  assert.equal(cache.readSession(1, 'wrong-token'), null);
  cache.clearSession(1);
  assert.equal(cache.readSession(1, 'token-1'), null);
});

test('verification cache distinguishes D1 cache miss, cached null, and equal status', () => {
  const cache = createVerificationCache({ statusTtlMs: 100 });
  assert.deepEqual(cache.readD1Status(7), { hit: false, value: null });
  cache.writeD1Status(7, null);
  assert.deepEqual(cache.readD1Status(7), { hit: true, value: null });
  const status = { userId: 7, status: 'verified', passedAt: '2026-07-20T00:00:00.000Z', clearedAt: null };
  assert.equal(cache.isSameD1Status(status, { ...status, updatedAt: '2026-07-20T01:00:00.000Z' }), true);
  cache.writeD1Status(7, status);
  assert.deepEqual(cache.readD1Status(7).value, status);
  cache.invalidateD1Status(7);
  assert.deepEqual(cache.readD1Status(7), { hit: false, value: null });
});
