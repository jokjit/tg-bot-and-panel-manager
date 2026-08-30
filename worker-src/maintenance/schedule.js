export function createIntervalGate(intervalMs) {
  const interval = Math.max(0, Number(intervalMs) || 0);
  let lastRunAt = 0;
  return function shouldRun(nowMs = Date.now()) {
    if (nowMs - lastRunAt < interval) return false;
    lastRunAt = nowMs;
    return true;
  };
}

export async function runMaintenanceIfDue(context = {}, handlers = {}) {
  const {
    env,
    intervalMs = 0,
    missingBindingReason = 'missing_binding',
  } = context;
  if (!handlers.hasRequiredBindings(env)) {
    return { ok: false, skipped: missingBindingReason };
  }

  const nowMs = handlers.nowMs?.() ?? Date.now();
  const lastState = (await handlers.readLastState(env)) || {};
  const lastRunMs = lastState?.finishedAt ? new Date(lastState.finishedAt).getTime() : 0;
  if (lastRunMs && nowMs - lastRunMs < intervalMs) {
    return { ok: false, skipped: 'not_due', lastFinishedAt: lastState.finishedAt || null };
  }
  return handlers.run(env, { source: 'auto' });
}

export async function runScheduledMaintenance(env, handlers = {}) {
  const tasks = [];
  if (handlers.isDataCleanupAutoEnabled(env)) {
    tasks.push(handlers.runDataCleanupIfDue(env));
  }
  if (handlers.isDeletedAccountSweepAutoEnabled(env)) {
    tasks.push(handlers.runDeletedAccountSweepIfDue(env));
  }
  const directoryReady = Boolean(env?.BOT_KV && env?.DB);
  if (tasks.length === 0 && !directoryReady) {
    return { ok: true, skipped: 'disabled' };
  }

  const results = await Promise.allSettled(tasks);
  if (directoryReady) {
    results.push(await Promise.resolve()
      .then(() => handlers.runDirectoryIndexBackfill(env, { source: 'scheduled' }))
      .then((value) => ({ status: 'fulfilled', value }))
      .catch((reason) => ({ status: 'rejected', reason })));
  }
  return { ok: true, results };
}
