import { isSameD1VerificationMeaning } from '../storage/d1.js';
import { verificationCacheKey } from '../storage/keys.js';
import { readTimedCacheValue, writeTimedCacheValue } from '../storage/cache.js';
import { normalizeIsoTime } from '../utils/time.js';
import { isVerificationSessionUsable, sanitizeVerificationSessionState } from './verification-status.js';

const NULL_STATUS = Symbol('verification-cache-null-status');

export function createVerificationCache(options = {}) {
  const d1Status = new Map();
  const passed = new Map();
  const cleared = new Map();
  const sessions = new Map();
  const statusTtlMs = Number(options.statusTtlMs) || 60 * 1000;
  const passedTtlMs = Number(options.passedTtlMs) || 10 * 60 * 1000;
  const sessionTtlMs = Number(options.sessionTtlMs) || 20 * 60 * 1000;

  return {
    readD1Status(userId) {
      const cached = readTimedCacheValue(d1Status, verificationCacheKey(userId));
      if (cached === null) return { hit: false, value: null };
      return { hit: true, value: cached === NULL_STATUS ? null : cached };
    },
    writeD1Status(userId, value) {
      writeTimedCacheValue(
        d1Status,
        verificationCacheKey(userId),
        value === null ? NULL_STATUS : value,
        statusTtlMs,
      );
    },
    invalidateD1Status(userId) {
      d1Status.delete(verificationCacheKey(userId));
    },
    isSameD1Status(left, right) {
      return isSameD1VerificationMeaning(left, right);
    },
    writeSession(userId, state) {
      const snapshot = sanitizeVerificationSessionState(state);
      if (!snapshot?.sessionToken) return null;
      writeTimedCacheValue(sessions, verificationCacheKey(userId), snapshot, sessionTtlMs);
      return snapshot;
    },
    readSession(userId, token = '') {
      const snapshot = readTimedCacheValue(sessions, verificationCacheKey(userId));
      if (!isVerificationSessionUsable(snapshot, token)) return null;
      return sanitizeVerificationSessionState(snapshot);
    },
    clearSession(userId) {
      sessions.delete(verificationCacheKey(userId));
    },
    getClearedAt(userId) {
      const cached = readTimedCacheValue(cleared, verificationCacheKey(userId));
      return normalizeIsoTime(cached?.clearedAt);
    },
    getPassedAt(userId) {
      const cached = readTimedCacheValue(passed, verificationCacheKey(userId));
      return normalizeIsoTime(cached?.passedAt);
    },
    writePassed(userId, passedAt = null) {
      const normalized = normalizeIsoTime(passedAt) || new Date().toISOString();
      const key = verificationCacheKey(userId);
      cleared.delete(key);
      writeTimedCacheValue(passed, key, { passedAt: normalized }, passedTtlMs);
      return normalized;
    },
    writeCleared(userId, clearedAt = null) {
      const normalized = normalizeIsoTime(clearedAt) || new Date().toISOString();
      const key = verificationCacheKey(userId);
      passed.delete(key);
      writeTimedCacheValue(cleared, key, { clearedAt: normalized }, passedTtlMs);
      return normalized;
    },
  };
}
