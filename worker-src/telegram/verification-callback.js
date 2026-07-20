import {
  VERIFICATION_SUCCESS_PROMPT_TEXT,
  VERIFICATION_WELCOME_EXTRA_TEXT,
  buildBannedVerificationPromptText,
  buildExpiredVerificationPromptText,
  buildIncorrectVerificationPromptText,
} from './verification-messages.js';

export async function handleVerificationCallback(context = {}, handlers = {}) {
  const callbackQuery = context.callbackQuery || {};
  const parts = String(callbackQuery.data || '').split(':');
  const userId = Number(parts[1]);
  const token = parts[2];
  const answer = String(parts[3] || '');
  const chatId = callbackQuery.message?.chat?.id ? Number(callbackQuery.message.chat.id) : null;
  const senderId = callbackQuery.from?.id ? Number(callbackQuery.from.id) : null;

  if (!chatId || !senderId || senderId !== userId || chatId !== userId) {
    await handlers.answer('这不是你的验证题目。', true);
    return 'invalid-owner';
  }

  const result = await handlers.processAnswer(userId, answer, { expectedToken: token });
  if (result.status === 'verified') {
    await handlers.clearPrompt(userId, callbackQuery.message?.message_id, VERIFICATION_SUCCESS_PROMPT_TEXT);
    await handlers.sendWelcome(userId, { extraText: VERIFICATION_WELCOME_EXTRA_TEXT });
    await handlers.answer('验证通过');
    return result.status;
  }

  if (result.status === 'already-verified') {
    await handlers.answer('你已经通过验证了。');
    return result.status;
  }
  if (result.status === 'blocked') {
    await handlers.answer(`验证冷却中，请 ${result.leftSec} 秒后再试。`, true);
    return result.status;
  }
  if (result.status === 'token-mismatch') {
    const refreshed = await handlers.refreshVerification(userId, true);
    await handlers.updatePrompt(callbackQuery.message, refreshed, context.publicBaseUrl);
    await handlers.answer('题目已刷新，请重新验证。', true);
    return result.status;
  }
  if (result.status === 'expired') {
    await handlers.clearPrompt(userId, callbackQuery.message?.message_id, buildExpiredVerificationPromptText());
    await handlers.answer('验证已过期，请 1 分钟后重试。', true);
    return result.status;
  }
  if (result.status === 'already-answered') {
    await handlers.answer('本题已处理，请勿重复提交。', true);
    return result.status;
  }
  if (result.status === 'banned') {
    await handlers.clearPrompt(userId, callbackQuery.message?.message_id, buildBannedVerificationPromptText(result));
    await handlers.answer('验证失败次数过多，已限制联系。', true);
    return result.status;
  }
  if (result.status === 'incorrect') {
    await handlers.clearPrompt(userId, callbackQuery.message?.message_id, buildIncorrectVerificationPromptText(answer, result));
    await handlers.answer('验证失败，请 1 分钟后重试。', true);
    return result.status;
  }
  return result.status || null;
}
