import { normalizeRotationAngle, normalizeSliderTrace } from './verification.js';

export async function validateSliderAttemptHuman(context = {}, handlers = {}) {
  const { state, body } = context;
  const slider = state?.slider;
  if (!slider) {
    return { ok: false, reason: 'slider_missing' };
  }

  const proof = await handlers.validateProof(state, slider, body);
  if (!proof.ok) return proof;

  if (slider?.type === 'rotation') {
    return validateRotationAttemptHuman(slider, body, context);
  }

  const value = Number(body?.value);
  if (!Number.isFinite(value)) {
    return { ok: false, reason: 'slider_value_invalid' };
  }
  const targetX = Number(slider.targetX || 0);
  if (Math.abs(value - targetX) > Number(context.sliderTolerance)) {
    return { ok: false, reason: 'slider_position_mismatch' };
  }

  const trace = normalizeSliderTrace(body?.trace);
  if (trace.length < 5) {
    return { ok: false, reason: 'trace_too_short' };
  }
  const durationMs = trace[trace.length - 1].t - trace[0].t;
  if (durationMs < Number(context.minSliderTimeMs)) {
    return { ok: false, reason: 'trace_too_fast' };
  }

  let forwardMoves = 0;
  let backwardMoves = 0;
  let totalDistance = 0;
  for (let index = 1; index < trace.length; index += 1) {
    const dx = trace[index].x - trace[index - 1].x;
    const dt = trace[index].t - trace[index - 1].t;
    if (dt <= 0) continue;
    if (dx >= 0) forwardMoves += 1;
    else backwardMoves += 1;
    totalDistance += Math.abs(dx);
  }

  const totalMoves = forwardMoves + backwardMoves;
  if (totalMoves < 4) {
    return { ok: false, reason: 'trace_not_enough_segments' };
  }
  if (forwardMoves / totalMoves < 0.55) {
    return { ok: false, reason: 'trace_direction_invalid' };
  }
  const expectedDistance = Math.max(20, Math.abs(value - trace[0].x));
  if (totalDistance < expectedDistance * 0.55) {
    return { ok: false, reason: 'trace_distance_invalid' };
  }

  const shape = scoreTraceShapeRisk(trace, value, { allowSingleDirection: false });
  if (!shape.ok) return { ok: false, reason: shape.reason };
  const risk = scoreSliderInteractionRisk(trace, body?.interaction, value);
  if (!risk.ok) return { ok: false, reason: risk.reason };
  return { ok: true, reason: 'ok' };
}

export function validateRotationAttemptHuman(slider, body, options = {}) {
  const value = Number(body?.value);
  if (!Number.isFinite(value)) {
    return { ok: false, reason: 'rotation_value_invalid' };
  }

  const targetAngle = normalizeRotationAngle(slider?.targetAngle || 0);
  const delta = getRotationAngleDelta(value, targetAngle);
  if (delta > Number(options.rotationTolerance)) {
    return { ok: false, reason: 'rotation_angle_mismatch', delta: Math.round(delta) };
  }

  const trace = normalizeSliderTrace(body?.trace);
  if (trace.length < 6) {
    return { ok: false, reason: 'trace_too_short' };
  }
  const durationMs = trace[trace.length - 1].t - trace[0].t;
  if (durationMs < Number(options.minSliderTimeMs)) {
    return { ok: false, reason: 'trace_too_fast' };
  }

  const shape = scoreTraceShapeRisk(trace, value, {
    allowSingleDirection: true,
    stationaryRatioLimit: 0.88,
    stationaryDelta: 0.35,
  });
  if (!shape.ok) return { ok: false, reason: shape.reason };
  const risk = scoreRotationInteractionRisk(trace, body?.interaction, value);
  if (!risk.ok) return { ok: false, reason: risk.reason };
  return { ok: true, reason: 'ok' };
}

export function getRotationAngleDelta(left, right) {
  const diff = Math.abs(normalizeRotationAngle(left) - normalizeRotationAngle(right));
  return Math.min(diff, 360 - diff);
}

export function scoreRotationInteractionRisk(trace, interaction, value) {
  const eventCount = Number(interaction?.eventCount || trace.length || 0);
  const pointerType = String(interaction?.pointerType || '').toLowerCase();
  const durationMs = Number(interaction?.durationMs || (trace[trace.length - 1]?.t - trace[0]?.t) || 0);
  const endX = Number(interaction?.endX ?? value);
  const averageIntervalMs = Number(interaction?.averageIntervalMs || 0);
  const dragStarted = interaction?.dragStarted === true;
  let risk = 0;

  if (!dragStarted) risk += 3;
  if (eventCount < 5) risk += 3;
  else if (eventCount < 8) risk += 1;
  if (durationMs < 260) risk += 4;
  else if (durationMs < 420) risk += 1;
  if (getRotationAngleDelta(endX, value) > 2) risk += 2;
  if (averageIntervalMs > 0 && averageIntervalMs < 8 && eventCount > 10) risk += 1;
  if (averageIntervalMs > 180 && eventCount < 8) risk += 1;
  if (pointerType && !['mouse', 'touch', 'pen'].includes(pointerType)) risk += 1;

  if (risk >= 5) return { ok: false, reason: 'interaction_risk_high', risk };
  return { ok: true, reason: 'ok', risk };
}

export function scoreSliderInteractionRisk(trace, interaction, value) {
  const eventCount = Number(interaction?.eventCount || trace.length || 0);
  const dragStarted = interaction?.dragStarted === true;
  const pointerType = String(interaction?.pointerType || '').toLowerCase();
  const durationMs = Number(interaction?.durationMs || (trace[trace.length - 1]?.t - trace[0]?.t) || 0);
  const startX = Number(interaction?.startX ?? trace[0]?.x ?? 0);
  const endX = Number(interaction?.endX ?? value);
  const averageIntervalMs = Number(interaction?.averageIntervalMs || 0);
  let risk = 0;

  if (!dragStarted) risk += 4;
  if (eventCount < 5) risk += 3;
  else if (eventCount < 8) risk += 1;
  if (durationMs < 320) risk += 4;
  else if (durationMs < 480) risk += 1;
  if (Math.abs(startX) > 18) risk += 1;
  if (Math.abs(endX - value) > 2) risk += 2;
  if (averageIntervalMs > 0 && averageIntervalMs < 10 && eventCount > 8) risk += 1;
  if (averageIntervalMs > 180 && eventCount < 8) risk += 1;
  if (pointerType && !['mouse', 'touch', 'pen'].includes(pointerType)) risk += 1;

  if (risk >= 5) return { ok: false, reason: 'interaction_risk_high', risk };
  return { ok: true, reason: 'ok', risk };
}

export function scoreTraceShapeRisk(trace, value, options = {}) {
  if (!Array.isArray(trace) || trace.length < 5) {
    return { ok: false, reason: 'trace_too_short' };
  }

  const allowSingleDirection = options?.allowSingleDirection !== false;
  const stationaryDelta = Number.isFinite(Number(options?.stationaryDelta)) ? Number(options.stationaryDelta) : 0.8;
  const stationaryRatioLimit = Number.isFinite(Number(options?.stationaryRatioLimit))
    ? Number(options.stationaryRatioLimit)
    : 0.72;
  const maxValue = Math.max(Number(value || 0), ...trace.map((item) => Number(item.x || 0)), 1);
  const deltas = [];
  const intervals = [];
  const speeds = [];
  let reversals = 0;
  let stationary = 0;
  let previousDirection = 0;
  let maxStep = 0;

  for (let index = 1; index < trace.length; index += 1) {
    const dx = Number(trace[index].x - trace[index - 1].x);
    const dt = Number(trace[index].t - trace[index - 1].t);
    if (dt <= 0) return { ok: false, reason: 'trace_time_invalid' };
    if (trace[index].x < -2 || trace[index].x > maxValue + 12) {
      return { ok: false, reason: 'trace_range_invalid' };
    }
    const absDx = Math.abs(dx);
    if (absDx < stationaryDelta) stationary += 1;
    maxStep = Math.max(maxStep, absDx);
    deltas.push(dx);
    intervals.push(dt);
    speeds.push(absDx / dt);
    const direction = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    if (direction && previousDirection && direction !== previousDirection) reversals += 1;
    if (direction) previousDirection = direction;
  }

  if (stationary / Math.max(1, deltas.length) > stationaryRatioLimit) {
    return { ok: false, reason: 'trace_distance_invalid' };
  }
  if (maxStep > Math.max(42, maxValue * 0.45)) {
    return { ok: false, reason: 'trace_jump_invalid' };
  }

  const intervalVariance = computeVariance(intervals);
  const speedVariance = computeVariance(speeds);
  const deltaVariance = computeVariance(deltas.map((item) => Math.abs(item)));
  const mostlySyntheticCadence = intervalVariance < 9 && trace.length >= 8;
  const mostlySyntheticMotion = speedVariance < 0.00012 && deltaVariance < 4 && trace.length >= 8;
  if (mostlySyntheticCadence && mostlySyntheticMotion) {
    return { ok: false, reason: 'trace_too_linear' };
  }
  if (!allowSingleDirection && reversals === 0 && trace.length >= 9 && deltaVariance < 7) {
    return { ok: false, reason: 'trace_variance_too_low' };
  }

  const durationMs = trace[trace.length - 1].t - trace[0].t;
  if (durationMs > 0 && Math.abs(value - trace[trace.length - 1].x) > Math.max(3, maxValue * 0.015)) {
    return { ok: false, reason: 'trace_end_mismatch' };
  }
  return { ok: true, reason: 'ok' };
}

export function computeVariance(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squareSum = values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0);
  return squareSum / values.length;
}
