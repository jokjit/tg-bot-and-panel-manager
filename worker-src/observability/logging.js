export function getRequestId(request) {
  const headerId = String(
    request?.headers?.get?.('cf-ray') || request?.headers?.get?.('x-request-id') || '',
  ).trim();
  if (headerId) return headerId;
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `req_${Date.now().toString(36)}`;
}

export function getTelegramUpdateContext(update) {
  const message = update?.message || update?.edited_message || update?.callback_query?.message || null;
  return {
    updateId: update?.update_id ?? null,
    userId: update?.callback_query?.from?.id ?? message?.from?.id ?? null,
    chatId: message?.chat?.id ?? null,
    messageId: message?.message_id ?? null,
  };
}

export function buildStructuredLogRecord(event, context = {}, detail = {}, now = new Date()) {
  return {
    timestamp: now.toISOString(),
    event: String(event || 'unknown'),
    requestId: context.requestId || null,
    updateId: context.updateId ?? null,
    userId: context.userId ?? null,
    chatId: context.chatId ?? null,
    stage: context.stage || null,
    ...detail,
  };
}

export function writeStructuredLog(level, event, context = {}, detail = {}) {
  const record = buildStructuredLogRecord(event, context, detail);
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  console[method](JSON.stringify(record));
  return record;
}
