import assert from 'node:assert/strict';
import test from 'node:test';

import { randomInt, shuffleArray } from '../worker-src/auth/random.js';

test('randomInt stays within inclusive bounds and handles inverted ranges', () => {
  for (let index = 0; index < 50; index += 1) {
    const value = randomInt(3, 7);
    assert.equal(value >= 3 && value <= 7, true);
  }
  assert.equal(randomInt(7, 3), 7);
});

test('shuffleArray preserves every item without mutating the input', () => {
  const input = ['a', 'b', 'c', 'd'];
  const shuffled = shuffleArray(input);
  assert.deepEqual(input, ['a', 'b', 'c', 'd']);
  assert.deepEqual([...shuffled].sort(), input);
});
