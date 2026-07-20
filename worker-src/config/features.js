export function isTopicModeEnabled(env = {}) {
  const raw = String(env.TOPIC_MODE ?? 'true').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function isDataCleanupAutoEnabled(env = {}) {
  return String(env.DATA_CLEANUP_AUTO ?? 'true').trim().toLowerCase() !== 'false';
}

export function isDeletedAccountSweepAutoEnabled(env = {}) {
  return String(env.DELETED_ACCOUNT_SWEEP_AUTO ?? 'true').trim().toLowerCase() !== 'false';
}

export function isUserVerificationEnabled(env = {}) {
  const raw = String(env.USER_VERIFICATION ?? 'true').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}
