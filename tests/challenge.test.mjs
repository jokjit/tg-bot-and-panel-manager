import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generateCaptchaChallenge,
  generateMathChallenge,
  generateNumericChoiceChallenge,
} from '../worker-src/auth/challenge.js';

function assertChallenge(challenge, mode) {
  assert.equal(challenge.mode, mode);
  assert.equal(challenge.options.length, 4);
  assert.equal(new Set(challenge.options.map(String)).size, 4);
  assert.equal(challenge.options.map(String).includes(String(challenge.correct)), true);
  assert.equal(Number.isNaN(new Date(challenge.createdAt).getTime()), false);
}

test('choice challenges contain four unique options including the answer', () => {
  const captcha = generateCaptchaChallenge();
  const numeric = generateNumericChoiceChallenge();
  assertChallenge(captcha, 'captcha');
  assertChallenge(numeric, 'numeric');
  assert.match(captcha.correct, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
  assert.match(numeric.correct, /^\d{4}$/);
  assert.equal(numeric.attempts, 0);
});

test('math challenges produce a valid advertised answer', () => {
  for (let index = 0; index < 20; index += 1) {
    const challenge = generateMathChallenge();
    assertChallenge(challenge, 'math');
    assert.equal(challenge.correct >= 0 && challenge.correct <= 10, true);
  }
});
