import assert from 'node:assert/strict';
import test from 'node:test';

import { setPixel } from '../worker-src/auth/image-codec.js';
import {
  buildRotationCaptchaDataUrl,
  buildSliderBackgroundDataUrl,
  hslToRgb,
  renderRotationCaptchaPng,
  rotatePoint,
} from '../worker-src/auth/web-image.js';

function drawMarker(pixels, width, height, _char, x, y, _scale, color) {
  setPixel(pixels, width, height, x, y, color);
}

function readPngSize(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

test('rotation image rendering is deterministic and clamps minimum dimensions', () => {
  const slider = { size: 120, seed: 'fixed-seed', startAngle: 135 };
  const first = renderRotationCaptchaPng(slider, { drawChar: drawMarker });
  const second = renderRotationCaptchaPng(slider, { drawChar: drawMarker });
  assert.deepEqual(first, second);
  assert.deepEqual(Array.from(first.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(readPngSize(first), { width: 160, height: 160 });
  assert.equal(first.length > 160 * 160 * 3, true);
});

test('rotation image data URLs preserve PNG bytes and vary by seed', () => {
  const handlers = { drawChar: drawMarker };
  const first = buildRotationCaptchaDataUrl({ size: 160, seed: 'seed-a', startAngle: 35 }, handlers);
  const repeated = buildRotationCaptchaDataUrl({ size: 160, seed: 'seed-a', startAngle: 35 }, handlers);
  const second = buildRotationCaptchaDataUrl({ size: 160, seed: 'seed-b', startAngle: 35 }, handlers);
  assert.equal(first, repeated);
  assert.notEqual(first, second);
  assert.match(first, /^data:image\/png;base64,/);
  const bytes = Uint8Array.from(Buffer.from(first.split(',')[1], 'base64'));
  assert.deepEqual(readPngSize(bytes), { width: 160, height: 160 });
});

test('puzzle background SVG is seeded, dimensioned, and deterministic', () => {
  const slider = {
    width: 300,
    height: 160,
    piece: 40,
    targetX: 110,
    targetY: 50,
    seed: 'puzzle-seed',
  };
  const first = buildSliderBackgroundDataUrl(slider);
  const second = buildSliderBackgroundDataUrl(slider);
  const changed = buildSliderBackgroundDataUrl({ ...slider, seed: 'other-seed' });
  assert.equal(first, second);
  assert.notEqual(first, changed);
  assert.match(first, /^data:image\/svg\+xml;base64,/);
  const svg = Buffer.from(first.split(',')[1], 'base64').toString('utf8');
  assert.match(svg, /width="300" height="160"/);
  assert.match(svg, /linearGradient id="bg"/);
  assert.match(svg, /stroke-dasharray="3 2"/);
});

test('image color and rotation helpers preserve expected geometry', () => {
  assert.deepEqual(hslToRgb(0, 0, 0.5), [128, 128, 128]);
  const rotated = rotatePoint(1, 0, Math.PI / 2);
  assert.equal(Math.abs(rotated.x) < 1e-12, true);
  assert.equal(Math.abs(rotated.y - 1) < 1e-12, true);
});
