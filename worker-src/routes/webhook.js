export async function handleWebhookRequest(context = {}, handlers = {}) {
  const {
    request,
    env,
    publicBaseUrl = '',
    ctx = null,
  } = context;
  handlers.ensureEnv(env, ['BOT_TOKEN', 'ADMIN_CHAT_ID']);
  if (env.WEBHOOK_SECRET) {
    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secret !== env.WEBHOOK_SECRET) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  const startedAt = handlers.nowMs?.() ?? Date.now();
  const requestId = handlers.getRequestId(request);
  const update = await request.json();
  const updateContext = handlers.getTelegramUpdateContext(update);
  try {
    await handlers.handleUpdate(update, env, publicBaseUrl, ctx);
    handlers.writeStructuredLog('info', 'telegram_update_completed', {
      requestId,
      ...updateContext,
      stage: 'handle_update',
    }, {
      durationMs: (handlers.nowMs?.() ?? Date.now()) - startedAt,
      status: 'ok',
    });
  } catch (error) {
    await handlers.runNonCriticalTask(ctx, async () => {
      await handlers.recordWebhookError(env, error, update, {
        requestId,
        ...updateContext,
        stage: 'handle_update',
        durationMs: (handlers.nowMs?.() ?? Date.now()) - startedAt,
      });
      await handlers.notifyWebhookError(env, error, update);
    });
  }
  return new Response('ok', { headers: handlers.corsHeaders(request, env) });
}
