export async function handleAdminReplyRoute(context = {}, handlers = {}) {
  const { request, url } = context;
  if (request.method !== 'POST' || url.pathname !== `${handlers.getAdminApiPrefix()}/reply`) {
    return null;
  }

  await handlers.requireAdmin(request);
  handlers.ensureBotToken();
  const body = await handlers.readJsonBody(request);
  const userId = handlers.toChatId(body.userId);
  const text = String(body.text || '').trim();
  if (!text) throw handlers.createError(400, 'text 不能为空');

  const result = await handlers.sendMessage(userId, text);
  await handlers.saveMessageHistory({
    userId: Number(userId),
    chatType: 'private',
    topicId: null,
    telegramMessageId: Number(result?.message_id) || null,
    direction: 'admin_to_user',
    senderRole: 'admin',
    messageType: 'text',
    textContent: text,
    mediaFileId: null,
    rawPayload: {
      source: 'admin-api',
      operator: handlers.getOperator(request),
      telegram: result,
    },
  });
  return handlers.json({ ok: true, result }, 200, {}, request);
}
