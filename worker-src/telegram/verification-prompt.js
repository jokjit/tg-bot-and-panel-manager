export async function sendVerificationPromptMessageRequest(context = {}, handlers = {}) {
  const { userId, state } = context;
  const challenge = state?.challenge;
  const imageUrl = handlers.buildImage(challenge, context.publicBaseUrl);
  try {
    if (!imageUrl) throw new Error('verification_image_url_not_ready');
    return await handlers.sendPhoto({
      chat_id: userId,
      photo: imageUrl,
      caption: handlers.buildCaption(challenge),
      reply_markup: handlers.buildKeyboard(userId, challenge),
    });
  } catch (error) {
    return handlers.sendMessage({
      chat_id: userId,
      text: handlers.buildText(challenge),
      reply_markup: handlers.buildKeyboard(userId, challenge),
    });
  }
}

export async function updateVerificationPromptMessageRequest(context = {}, handlers = {}) {
  const { message, state } = context;
  const userId = Number(message?.chat?.id);
  const imageUrl = handlers.buildImage(state?.challenge, context.publicBaseUrl);
  try {
    if (!imageUrl) throw new Error('verification_image_url_not_ready');
    await handlers.editMedia({
      chat_id: message.chat.id,
      message_id: message.message_id,
      media: {
        type: 'photo',
        media: imageUrl,
        caption: handlers.buildCaption(state.challenge),
      },
      reply_markup: handlers.buildKeyboard(userId, state.challenge),
    });
    await handlers.setPromptMessageId(userId, message.message_id);
    return { delivery: 'edited', messageId: Number(message.message_id) };
  } catch (error) {
    const sent = await sendVerificationPromptMessageRequest({
      userId,
      state,
      publicBaseUrl: context.publicBaseUrl,
    }, handlers);
    await handlers.setPromptMessageId(userId, sent.message_id);
    return { delivery: 'sent', messageId: Number(sent.message_id) };
  }
}

export async function sendUserVerificationPromptRequest(context = {}, handlers = {}) {
  const sent = await sendVerificationPromptMessageRequest(context, handlers);
  await handlers.setPromptMessageId(context.userId, sent.message_id);
  return sent;
}

export async function clearVerificationPromptMessageRequest(context = {}, handlers = {}) {
  const { chatId, messageId, text } = context;
  if (!messageId) return false;
  const replyMarkup = { inline_keyboard: [] };
  try {
    await handlers.editCaption({
      chat_id: chatId,
      message_id: messageId,
      caption: text,
      reply_markup: replyMarkup,
    });
    return true;
  } catch (error) {
    // Text fallback prompts have no caption.
  }

  try {
    await handlers.editText({
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: replyMarkup,
    });
    return true;
  } catch (error) {
    return false;
  }
}

export async function deleteVerificationPromptMessageRequest(context = {}, handlers = {}) {
  const id = Number(context.messageId || 0);
  if (!id) return false;
  try {
    await handlers.deleteMessage({ chat_id: context.chatId, message_id: id });
    return true;
  } catch (error) {
    // Older or already changed Telegram messages may no longer be deletable.
  }

  try {
    await clearVerificationPromptMessageRequest({
      chatId: context.chatId,
      messageId: id,
      text: context.staleText,
    }, handlers);
  } catch (error) {
    // The stale entry is already harmless when both Telegram edits fail.
  }
  return false;
}

export async function setVerificationPromptMessageIdState(context = {}, handlers = {}) {
  const userId = Number(context.userId);
  const messageId = Number(context.messageId);
  let state = (await handlers.getState(userId)) || {
    userId,
    verified: false,
    challenge: null,
  };
  const profile = await handlers.getProfile(userId);
  if (state?.verified) {
    if (await handlers.isStateActive(userId, state, profile)) {
      if (!handlers.isProfilePassed(profile)) {
        await handlers.markProfilePassed(
          userId,
          state.verifiedAt || state.answeredAt || state.updatedAt,
        );
      }
      return { status: 'verified-active', state };
    }
    state = await handlers.resetAfterRevocation(userId, state);
  }

  const repairedState = await handlers.repairFromProfile(userId, state, profile);
  if (repairedState?.verified) {
    await handlers.clearPrompt(
      userId,
      messageId,
      '✅ 验证已通过，当前验证入口已自动失效。',
    );
    return { status: 'verified-repaired', state: repairedState };
  }

  const previousState = state;
  const nextState = {
    ...state,
    promptMessageId: messageId,
    updatedAt: handlers.nowIso(),
  };
  await handlers.saveState(userId, nextState, previousState);
  return { status: 'saved', state: nextState };
}
