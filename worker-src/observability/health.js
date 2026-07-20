const WEBHOOK_ERROR_WINDOW_MS = 60 * 60 * 1000;

export function buildWebhookErrorStats(existing, errorRecord, nowMs = Date.now()) {
  const previous = existing && typeof existing === 'object' ? existing : {};
  const previousWindowMs = new Date(previous.windowStartedAt || '').getTime();
  const sameWindow = Number.isFinite(previousWindowMs) && nowMs - previousWindowMs < WEBHOOK_ERROR_WINDOW_MS;
  return {
    windowStartedAt: new Date(sameWindow ? previousWindowMs : nowMs).toISOString(),
    windowCount: (sameWindow ? Number(previous.windowCount || 0) : 0) + 1,
    totalCount: Number(previous.totalCount || 0) + 1,
    lastErrorAt: errorRecord?.at || new Date(nowMs).toISOString(),
    lastUpdateId: errorRecord?.updateId ?? null,
    lastStage: errorRecord?.stage || null,
  };
}

export function buildDeploymentHealthRecord(options = {}, now = new Date()) {
  return {
    status: options.ok ? 'healthy' : 'degraded',
    checkedAt: now.toISOString(),
    webhookUrl: options.webhookUrl || null,
    webhookReady: !options.webhookError,
    commandsReady: !options.commandsError,
    passwordReady: Boolean(options.passwordReady),
    bootstrapNotifyReady: !options.bootstrapNotifyError,
    lastError: options.ok
      ? null
      : options.webhookError || options.commandsError || options.bootstrapNotifyError || 'bootstrap_incomplete',
  };
}
