export function normalizeVerificationBaseUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && !/^https?:\/\//i.test(text)) return '';
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch (error) {
    return '';
  }
}

export function buildVerificationWebUrl(state, userId, publicBaseUrl = '', verifyPath = '/verify') {
  const base = normalizeVerificationBaseUrl(publicBaseUrl);
  if (!base || !state?.sessionToken) return '';
  const params = new URLSearchParams({
    uid: String(userId),
    token: String(state.sessionToken),
  });
  return `${base}${verifyPath}?${params.toString()}`;
}

export async function sendVerificationWebPromptRequest(context = {}, handlers = {}) {
  const { userId, state } = context;
  const verifyUrl = buildVerificationWebUrl(
    state,
    userId,
    context.publicBaseUrl,
    context.verifyPath,
  );
  const maxAttempts = handlers.getMaxAttempts();
  const retryMinutes = Math.round(handlers.getRetryBlockMs() / 60000);
  const isNumericChoice = state?.flowMode === 'numeric-choice';
  const lines = isNumericChoice
    ? [
        '🔐 首次私聊验证（数字图片验证）',
        '打开验证页后识别图片中的 4 位数字，并从四个选项中选择正确答案。',
        `最多 ${maxAttempts} 次，失败超过次数后会锁定 ${retryMinutes} 分钟`,
      ]
    : [
        '🔐 首次私聊验证（图形双重挑战）',
        `1) 旋转验证：最多 ${maxAttempts} 次`,
        `2) 九宫格点选（九选二）：最多 ${maxAttempts} 次`,
        `失败超过次数后会锁定 ${retryMinutes} 分钟`,
      ];

  if (!verifyUrl) {
    lines.push('未找到可用验证链接，请联系管理员配置 VERIFY_PUBLIC_BASE_URL 或 PUBLIC_BASE_URL。');
  } else {
    lines.push('点击下方按钮打开验证页面。本链接一次一码，新消息会使旧链接立即失效。');
    await handlers.persistLatest(userId, state);
  }

  const payload = {
    chat_id: userId,
    text: lines.join('\n'),
    reply_markup: verifyUrl
      ? { inline_keyboard: [[{ text: '打开验证页面', url: verifyUrl }]] }
      : undefined,
  };

  const promptMessageId = context.forceNewMessage ? 0 : Number(state?.promptMessageId || 0);
  if (promptMessageId) {
    try {
      await handlers.editMessage({ ...payload, message_id: promptMessageId });
      return { delivery: 'edited', messageId: promptMessageId, verifyUrl };
    } catch (error) {
      // Fall back to a new message when Telegram can no longer edit the old prompt.
    }
  }

  const sent = await handlers.sendMessage(payload);
  if (sent?.message_id) {
    await handlers.setPromptMessageId(userId, sent.message_id);
  }
  return { delivery: 'sent', messageId: Number(sent?.message_id || 0) || null, verifyUrl };
}
