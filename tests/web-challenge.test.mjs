import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGridChallengeForWebVerification,
  createSliderChallengeForWebVerification,
} from '../worker-src/auth/web-challenge.js';

test('web slider challenge creates a signed rotation target with fresh timestamps', () => {
  const challenge = createSliderChallengeForWebVerification();
  assert.equal(challenge.type, 'rotation');
  assert.equal(challenge.size, 240);
  assert.equal(challenge.maxAngle, 360);
  assert.equal(challenge.startAngle >= 35 && challenge.startAngle <= 325, true);
  assert.equal(challenge.targetAngle, (360 - challenge.startAngle) % 360);
  assert.match(challenge.seed, /^[a-z0-9]+[0-9a-f]{16}$/);
  assert.match(challenge.submitNonce, /^[a-z0-9]+[0-9a-f]{16}$/);
  assert.equal(challenge.attempts, 0);
  assert.equal(Number.isNaN(Date.parse(challenge.submitNonceIssuedAt)), false);
  assert.equal(Number.isNaN(Date.parse(challenge.createdAt)), false);
});

test('web grid challenge creates nine unique cells and two matching targets', () => {
  const challenge = createGridChallengeForWebVerification();
  assert.equal(challenge.cells.length, 9);
  assert.equal(new Set(challenge.cells.map((cell) => cell.symbol)).size, 9);
  assert.equal(new Set(challenge.cells.map((cell) => cell.token)).size, 9);
  assert.deepEqual(challenge.cells.map((cell) => cell.index), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(challenge.targetIndices.length, 2);
  assert.equal(challenge.targetIndices[0] < challenge.targetIndices[1], true);
  assert.deepEqual(
    challenge.targetSymbols,
    challenge.targetIndices.map((index) => challenge.cells[index].symbol),
  );
  assert.equal(challenge.cells.every((cell) => /^[0-9a-f]{8}$/.test(cell.token)), true);
});
