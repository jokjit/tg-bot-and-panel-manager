import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSeededRandom,
  drawFilledCircle,
  encodePngRgb,
  setPixel,
} from '../worker-src/auth/image-codec.js';

test('image codec produces deterministic seeded values and valid PNG dimensions', () => {
  const left = createSeededRandom('captcha-seed');
  const right = createSeededRandom('captcha-seed');
  const different = createSeededRandom('other-seed');
  assert.deepEqual(
    [left(), left(), left()],
    [right(), right(), right()],
  );
  assert.notEqual(left(), different());

  const pixels = new Uint8Array(2 * 1 * 3);
  setPixel(pixels, 2, 1, 1, 0, [1, 2, 3]);
  const png = encodePngRgb(2, 1, pixels);
  assert.deepEqual(Array.from(png.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(new DataView(png.buffer).getUint32(16), 2);
  assert.equal(new DataView(png.buffer).getUint32(20), 1);
});

test('image codec clips drawing outside the canvas', () => {
  const pixels = new Uint8Array(3 * 3 * 3);
  drawFilledCircle(pixels, 3, 3, -1, -1, 4, [255, 0, 0], 1);
  assert.equal(pixels.some((value) => value !== 0), true);
  assert.doesNotThrow(() => drawFilledCircle(pixels, 3, 3, 99, 99, 4, [255, 0, 0], 1));
});
