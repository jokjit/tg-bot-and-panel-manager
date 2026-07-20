import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getRotationAngleDelta,
  scoreTraceShapeRisk,
  validateSliderAttemptHuman,
} from '../worker-src/auth/slider-human.js';

const options = {
  minSliderTimeMs: 250,
  sliderTolerance: 18,
  rotationTolerance: 12,
};

function handlers(proof = { ok: true, reason: 'ok' }) {
  return { validateProof: async () => proof };
}

test('human slider validation rejects missing challenges and proof failures first', async () => {
  assert.deepEqual(await validateSliderAttemptHuman({ state: {}, body: {}, ...options }, handlers()), {
    ok: false,
    reason: 'slider_missing',
  });
  assert.deepEqual(await validateSliderAttemptHuman({
    state: { slider: { targetX: 60 } },
    body: { value: 60 },
    ...options,
  }, handlers({ ok: false, reason: 'proof_expired' })), {
    ok: false,
    reason: 'proof_expired',
  });
});

test('human slider validation accepts a plausible drag and rejects position mismatches', async () => {
  const trace = [
    { x: 0, t: 0 },
    { x: 8, t: 70 },
    { x: 18, t: 140 },
    { x: 31, t: 220 },
    { x: 45, t: 310 },
    { x: 60, t: 420 },
  ];
  const body = {
    value: 60,
    trace,
    interaction: {
      dragStarted: true,
      eventCount: 6,
      durationMs: 420,
      startX: 0,
      endX: 60,
      averageIntervalMs: 84,
      pointerType: 'mouse',
    },
  };
  assert.deepEqual(await validateSliderAttemptHuman({
    state: { slider: { type: 'puzzle', targetX: 60 } },
    body,
    ...options,
  }, handlers()), { ok: true, reason: 'ok' });
  assert.deepEqual(await validateSliderAttemptHuman({
    state: { slider: { type: 'puzzle', targetX: 100 } },
    body,
    ...options,
  }, handlers()), { ok: false, reason: 'slider_position_mismatch' });
});

test('trace scoring rejects mechanically linear high-sample movement', () => {
  const trace = Array.from({ length: 8 }, (_, index) => ({ x: index * 10, t: index * 50 }));
  assert.deepEqual(scoreTraceShapeRisk(trace, 70), { ok: false, reason: 'trace_too_linear' });
});

test('rotation validation handles wrapped angles and plausible pointer movement', async () => {
  assert.equal(getRotationAngleDelta(-5, 355), 0);
  assert.equal(getRotationAngleDelta(5, 355), 10);
  const trace = [
    { x: 0, t: 0 },
    { x: 60, t: 80 },
    { x: 130, t: 170 },
    { x: 210, t: 260 },
    { x: 290, t: 350 },
    { x: 365, t: 460 },
  ];
  const body = {
    value: 365,
    trace,
    interaction: {
      dragStarted: true,
      eventCount: 6,
      durationMs: 460,
      endX: 365,
      averageIntervalMs: 92,
      pointerType: 'touch',
    },
  };
  assert.deepEqual(await validateSliderAttemptHuman({
    state: { slider: { type: 'rotation', targetAngle: 5 } },
    body,
    ...options,
  }, handlers()), { ok: true, reason: 'ok' });
  assert.deepEqual(await validateSliderAttemptHuman({
    state: { slider: { type: 'rotation', targetAngle: 40 } },
    body,
    ...options,
  }, handlers()), { ok: false, reason: 'rotation_angle_mismatch', delta: 35 });
});
