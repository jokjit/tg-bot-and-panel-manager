export function createIntervalGate(intervalMs) {
  const interval = Math.max(0, Number(intervalMs) || 0);
  let lastRunAt = 0;
  return function shouldRun(nowMs = Date.now()) {
    if (nowMs - lastRunAt < interval) return false;
    lastRunAt = nowMs;
    return true;
  };
}
