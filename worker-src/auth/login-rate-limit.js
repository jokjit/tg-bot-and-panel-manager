export const ADMIN_LOGIN_MAX_FAILURES = 5;
export const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const ADMIN_LOGIN_BLOCK_MS = 15 * 60 * 1000;

export function normalizeLoginRateState(value, nowMs = Date.now()) {
  const source = value && typeof value === 'object' ? value : {};
  const windowStartedAt = Number(source.windowStartedAt || 0);
  const withinWindow = Number.isFinite(windowStartedAt)
    && windowStartedAt > 0
    && nowMs - windowStartedAt < ADMIN_LOGIN_WINDOW_MS;
  return {
    failures: withinWindow ? Math.max(0, Number(source.failures || 0)) : 0,
    windowStartedAt: withinWindow ? windowStartedAt : nowMs,
    blockedUntil: Math.max(0, Number(source.blockedUntil || 0)),
  };
}

export function isLoginRateBlocked(value, nowMs = Date.now()) {
  const state = normalizeLoginRateState(value, nowMs);
  return state.blockedUntil > nowMs;
}

export function recordLoginFailure(value, nowMs = Date.now()) {
  const state = normalizeLoginRateState(value, nowMs);
  const failures = state.failures + 1;
  return {
    failures,
    windowStartedAt: state.windowStartedAt,
    blockedUntil: failures >= ADMIN_LOGIN_MAX_FAILURES ? nowMs + ADMIN_LOGIN_BLOCK_MS : 0,
    updatedAt: new Date(nowMs).toISOString(),
  };
}
