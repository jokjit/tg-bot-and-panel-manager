import { timingSafeEqualText } from './crypto.js';
import { parseIsoTimeMs } from '../utils/time.js';

export function sanitizeVerificationSessionState(state) {
  if (!state || typeof state !== 'object') return null;
  return JSON.parse(JSON.stringify(state));
}

export function isVerificationSessionExpired(state, nowMs = Date.now()) {
  const expiresMs = parseIsoTimeMs(state?.sessionExpiresAt);
  return !expiresMs || expiresMs <= nowMs;
}

export function isVerificationSessionUsable(state, token = '', nowMs = Date.now()) {
  if (!state || state.verified || !state.sessionToken) return false;
  if (token && !timingSafeEqualText(String(token), String(state.sessionToken))) return false;
  return !isVerificationSessionExpired(state, nowMs);
}

export function isVerificationPassedAtCleared(passedAt, options = {}) {
  const passedMs = parseIsoTimeMs(passedAt);
  if (!passedMs) return true;
  const profileClearedMs = parseIsoTimeMs(options.profileClearedAt);
  if (profileClearedMs && profileClearedMs >= passedMs) return true;
  const localClearedMs = parseIsoTimeMs(options.localClearedAt);
  return Boolean(localClearedMs && localClearedMs >= passedMs);
}

export function getProfileVerificationPassedAt(profile) {
  const passedMs = parseIsoTimeMs(profile?.verificationPassedAt);
  if (!passedMs) return null;
  const clearedMs = parseIsoTimeMs(profile?.verificationClearedAt);
  if (clearedMs && clearedMs >= passedMs) return null;
  const status = String(profile?.verificationStatus || '').toLowerCase();
  if (['pending', 'reset', 'revoked', 'deleted'].includes(status)) return null;
  return new Date(passedMs).toISOString();
}

export function isProfileVerificationPassed(profile) {
  return Boolean(getProfileVerificationPassedAt(profile));
}

export function isVerificationStateInvalidatedByProfile(state, profile) {
  if (!state?.verified) return false;
  const verifiedMs =
    parseIsoTimeMs(state.verifiedAt) || parseIsoTimeMs(state.answeredAt) || parseIsoTimeMs(state.updatedAt);
  const clearedMs = parseIsoTimeMs(profile?.verificationClearedAt);
  if (clearedMs && (!verifiedMs || clearedMs >= verifiedMs)) return true;
  const firstSeenMs = parseIsoTimeMs(profile?.firstSeenAt);
  return Boolean(firstSeenMs && verifiedMs && firstSeenMs > verifiedMs + 1000);
}
