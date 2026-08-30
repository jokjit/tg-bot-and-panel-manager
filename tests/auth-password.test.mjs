import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hashPassword,
  isPasswordHash,
  isPasswordHashSupported,
  passwordHashNeedsUpgrade,
  verifyPassword,
} from '../worker-src/auth/password.js';
import {
  ADMIN_LOGIN_BLOCK_MS,
  ADMIN_LOGIN_MAX_FAILURES,
  isLoginRateBlocked,
  normalizeLoginRateState,
  recordLoginFailure,
} from '../worker-src/auth/login-rate-limit.js';

test('admin passwords use deterministic salted PBKDF2 records', async () => {
  const options = { saltHex: '00112233445566778899aabbccddeeff', iterations: 100000 };
  const encoded = await hashPassword('correct horse battery staple', options);
  assert.equal(isPasswordHash(encoded), true);
  assert.equal(isPasswordHashSupported(encoded), true);
  assert.equal(await verifyPassword('correct horse battery staple', encoded), true);
  assert.equal(await verifyPassword('wrong password', encoded), false);
  assert.equal(await verifyPassword('', encoded), false);
  assert.equal(passwordHashNeedsUpgrade(encoded), false);

  const incompatible = `pbkdf2-sha256$210000$${options.saltHex}$${'00'.repeat(32)}`;
  assert.equal(isPasswordHash(incompatible), true);
  assert.equal(isPasswordHashSupported(incompatible), false);
  await assert.rejects(
    () => verifyPassword('legacy', incompatible),
    /password_hash_iterations_unsupported/,
  );
  await assert.rejects(
    () => hashPassword('legacy', { ...options, iterations: 210000 }),
    /password_hash_options_invalid/,
  );
});

test('admin login rate state blocks after repeated failures and resets stale windows', () => {
  const now = Date.parse('2026-08-30T00:00:00.000Z');
  let state = null;
  for (let index = 0; index < ADMIN_LOGIN_MAX_FAILURES; index += 1) {
    state = recordLoginFailure(state, now + index);
  }
  assert.equal(isLoginRateBlocked(state, now + 100), true);
  assert.equal(state.blockedUntil, now + ADMIN_LOGIN_MAX_FAILURES - 1 + ADMIN_LOGIN_BLOCK_MS);
  assert.equal(isLoginRateBlocked(state, state.blockedUntil), false);
  assert.equal(normalizeLoginRateState(state, state.blockedUntil).failures, 0);
});
