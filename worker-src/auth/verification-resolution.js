import { parseIsoTimeMs } from '../utils/time.js';

export async function isVerificationStateInvalidatedByD1State(context = {}, handlers = {}) {
  const { userId, state } = context;
  if (!state?.verified) return false;
  const record = await handlers.getD1Status(userId);
  if (!record) return false;

  const status = String(record.status || '').toLowerCase();
  const verifiedMs = parseIsoTimeMs(state.verifiedAt)
    || parseIsoTimeMs(state.answeredAt)
    || parseIsoTimeMs(state.updatedAt);
  const clearedMs = parseIsoTimeMs(record.clearedAt);
  if (status !== 'verified' && clearedMs && (!verifiedMs || clearedMs >= verifiedMs)) {
    handlers.writeLocalCleared(userId, record.clearedAt);
    return true;
  }
  return false;
}

export async function isVerificationStateActiveState(context = {}, handlers = {}) {
  const { userId, state, profile = null } = context;
  if (!state?.verified) return false;
  if (handlers.isInvalidatedByProfile(state, profile)) return false;
  if (await handlers.isInvalidatedByD1(userId, state)) return false;
  handlers.writeLocalPassed(userId, state.verifiedAt || state.answeredAt || state.updatedAt);
  return true;
}

export async function resolveVerificationPassedAtState(context = {}, handlers = {}) {
  const { userId, profile = null } = context;
  const profilePassedAt = handlers.getProfilePassedAt(profile);
  if (profilePassedAt && !handlers.isPassedAtCleared(userId, profilePassedAt, profile)) {
    handlers.writeLocalPassed(userId, profilePassedAt);
    return profilePassedAt;
  }

  const localPassedAt = handlers.getLocalPassedAt(userId, profile);
  if (localPassedAt) return localPassedAt;
  return handlers.getD1PassedAt(userId, profile);
}

export async function applyResolvedVerificationStatusToProfileState(context = {}, handlers = {}) {
  const { userId, profile } = context;
  if (!profile || typeof profile !== 'object' || !handlers.isVerificationEnabled()) return profile;

  const passedAt = await handlers.resolvePassedAt(userId, profile);
  if (passedAt) {
    profile.verificationStatus = 'verified';
    profile.verificationPassedAt = passedAt;
    profile.verificationClearedAt = null;
    profile.verificationUpdatedAt = profile.verificationUpdatedAt || await handlers.nowIso();
    return profile;
  }

  const clearedAt = handlers.getLocalClearedAt(userId);
  if (clearedAt) {
    profile.verificationStatus = 'pending';
    profile.verificationPassedAt = null;
    profile.verificationClearedAt = clearedAt;
    profile.verificationUpdatedAt = profile.verificationUpdatedAt || await handlers.nowIso();
  }
  return profile;
}
