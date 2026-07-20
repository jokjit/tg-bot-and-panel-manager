import { parseIsoTimeMs } from '../utils/time.js';

const USER_PROFILE_WRITE_THROTTLE_MS = 5 * 60 * 1000;
const USER_PROFILE_VOLATILE_FIELDS = new Set(['lastSeenAt', 'lastMessageType', 'lastMessagePreview']);

export function serializeJsonForStorage(value) {
  return JSON.stringify(typeof value === 'undefined' ? null : value);
}

export function areJsonStorageValuesEqual(left, right) {
  return serializeJsonForStorage(left) === serializeJsonForStorage(right);
}

export function getJsonChangedKeys(left, right) {
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  return Array.from(keys).filter((key) => !areJsonStorageValuesEqual(left?.[key], right?.[key]));
}

export function shouldThrottleUserProfileWrite(existing, next, nowMs = Date.now()) {
  if (!existing || typeof existing !== 'object') return false;
  const changedKeys = getJsonChangedKeys(existing, next);
  if (changedKeys.length === 0) return false;
  if (!changedKeys.every((key) => USER_PROFILE_VOLATILE_FIELDS.has(key))) return false;
  const previousSeenMs = parseIsoTimeMs(existing.lastSeenAt) || parseIsoTimeMs(existing.firstSeenAt);
  if (!previousSeenMs) return false;
  return nowMs - previousSeenMs < USER_PROFILE_WRITE_THROTTLE_MS;
}
