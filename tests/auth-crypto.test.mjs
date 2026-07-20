import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createChallengeToken,
  createRandomToken,
  createSessionToken,
  hmacSha256Hex,
  timingSafeEqualText,
} from '../worker-src/auth/crypto.js';

test('auth tokens have the expected shape and are not repeated', () => {
  const session = createSessionToken();
  const challenge = createChallengeToken();
  const random = createRandomToken(4);

  assert.match(session, /^[0-9a-f]{48}$/);
  assert.match(challenge, /^[a-z0-9]+[0-9a-f]{16}$/);
  assert.match(random, /^[0-9a-f]{8}$/);
  assert.notEqual(createSessionToken(), session);
});

test('auth HMAC and constant-time comparison are deterministic', async () => {
  const signature = await hmacSha256Hex('secret', 'payload');
  assert.equal(signature, 'b82fcb791acec57859b989b430a826488ce2e479fdf92326bd0a2e8375a42ba4');
  assert.equal(timingSafeEqualText(signature, signature), true);
  assert.equal(timingSafeEqualText(signature, `${signature}x`), false);
  assert.equal(timingSafeEqualText('', ''), false);
});
