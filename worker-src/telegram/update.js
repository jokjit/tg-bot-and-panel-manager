export async function handleTelegramUpdate(context = {}, handlers = {}) {
  const {
    update,
    env,
    publicBaseUrl = '',
    ctx = null,
    defaultBlockedText = '',
  } = context;
  if (update.callback_query) {
    await handlers.handleCallbackQuery(update.callback_query, env, publicBaseUrl, ctx);
    return;
  }

  const message = update.message || update.edited_message;
  if (!message || !message.chat) return;

  const adminChatId = handlers.toChatId(env.ADMIN_CHAT_ID);
  const senderId = message.from?.id ? Number(message.from.id) : null;
  const authorizedAdmin = senderId ? await handlers.isAuthorizedAdmin(env, senderId) : false;
  const isAdminChat = Number(message.chat.id) === adminChatId;
  const topicModeEnabled = handlers.isTopicModeEnabled(env);
  const configuredPrivateRelayAdminIds = topicModeEnabled
    ? []
    : String(env.ADMIN_IDS || env.ADMIN_ID || '')
      .split(/[\s,;]+/)
      .map((value) => Number(value))
      .filter((value) => Number.isSafeInteger(value) && value > 0);
  const isPrivateRelayAdminChat = !topicModeEnabled
    && configuredPrivateRelayAdminIds.includes(Number(message.chat.id));
  const isPrivateChat = message.chat.type === 'private';
  const isAdminPrivateInteraction = isPrivateChat && (
    handlers.isUserPrivateCommand(message)
    || Boolean(message.reply_to_message)
    || Boolean(await handlers.hasPendingAdminInteraction?.(message, env))
  );

  if (isAdminChat || isPrivateRelayAdminChat || (authorizedAdmin && (!isPrivateChat || isAdminPrivateInteraction))) {
    await handlers.handleAdminMessage(message, env, adminChatId, authorizedAdmin, publicBaseUrl, ctx);
    return;
  }

  if (!isPrivateChat) return;

  const verificationEnabled = handlers.isUserVerificationEnabled(env) && !authorizedAdmin;
  if (topicModeEnabled || verificationEnabled) handlers.ensureKv(env);

  await handlers.upsertUserProfile(env, message, {
    recordMessageActivity: !verificationEnabled,
  });

  const blacklistEntry = await handlers.getBlacklistEntry(env, message.chat.id);
  if (blacklistEntry) {
    await handlers.sendBlockedMessage(
      env,
      message.chat.id,
      env.BLOCKED_TEXT || defaultBlockedText,
    );
    return;
  }

  if (handlers.isUserPrivateCommand(message)) {
    await handlers.handleUserPrivateCommand(message, env, publicBaseUrl);
    return;
  }

  const verificationStateRef = { value: null };
  const verified = authorizedAdmin || await handlers.ensureUserVerifiedOrPrompt(message, env, publicBaseUrl, {
    stateRef: verificationStateRef,
  });
  if (!verified) return;

  if (verificationEnabled) await handlers.upsertUserProfile(env, message);

  const observationAllowed = await handlers.applyPostVerifyObservationLayer(
    message,
    env,
    adminChatId,
    verificationStateRef.value,
  );
  if (!observationAllowed) return;

  await handlers.handleUserMessage(message, env, adminChatId, ctx);
}

export async function handleTelegramCallbackQuery(context = {}, handlers = {}) {
  const {
    callbackQuery,
    env,
    publicBaseUrl = '',
    ctx = null,
  } = context;
  const data = String(callbackQuery.data || '');
  if (!data) {
    await handlers.answerCallback(env, callbackQuery.id, '未识别的操作');
    return;
  }

  if (data.startsWith('verify:')) {
    await handlers.answerCallback(env, callbackQuery.id, '旧版验证已下线，请重新打开新的网页验证入口。', true);
    return;
  }

  if (data.startsWith('adm:') || handlers.isAdminCommandPanelCallback(data)) {
    await handlers.handleAdminActionCallback(callbackQuery, env, publicBaseUrl, ctx);
    return;
  }

  await handlers.answerCallback(env, callbackQuery.id, '未识别的操作');
}
