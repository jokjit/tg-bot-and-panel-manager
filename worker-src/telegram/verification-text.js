import {
  VERIFICATION_SUCCESS_PROMPT_TEXT,
  VERIFICATION_WELCOME_EXTRA_TEXT,
  buildBannedVerificationPromptText,
  buildExpiredVerificationPromptText,
  buildIncorrectVerificationPromptText,
} from './verification-messages.js';

export async function handleVerificationText(message, handlers = {}) {
  const userId = Number(message?.chat?.id);
  const state = await handlers.getVerificationState(userId);
  if (!state || state.verified || !state.challenge) return false;

  const answer = String(message.text || '').trim();
  if (!answer) return false;
  const result = await handlers.processAnswer(userId, answer);
  const promptMessageId = Number(state.promptMessageId || 0);

  if (result.status === 'verified') {
    if (promptMessageId) await handlers.clearPrompt(userId, promptMessageId, VERIFICATION_SUCCESS_PROMPT_TEXT);
    await handlers.sendWelcome(userId, { extraText: VERIFICATION_WELCOME_EXTRA_TEXT });
    return true;
  }
  if (result.status === 'blocked') {
    await handlers.sendMessage(userId, `验证冷却中，请 ${result.leftSec} 秒后再试。`);
    return true;
  }
  if (result.status === 'expired') {
    if (promptMessageId) await handlers.clearPrompt(userId, promptMessageId, buildExpiredVerificationPromptText());
    await handlers.sendMessage(userId, '验证已过期，请等待 1 分钟后重新发送消息获取新题目。');
    return true;
  }
  if (result.status === 'incorrect') {
    if (promptMessageId) {
      await handlers.clearPrompt(userId, promptMessageId, buildIncorrectVerificationPromptText(answer, result));
    }
    await handlers.sendMessage(userId, '验证失败，请等待 1 分钟后重新发送消息获取新题目。');
    return true;
  }
  if (result.status === 'banned') {
    if (promptMessageId) await handlers.clearPrompt(userId, promptMessageId, buildBannedVerificationPromptText(result));
    await handlers.sendMessage(userId, '验证失败次数过多，已限制联系。如有需要请等待管理员处理。');
    return true;
  }
  if (result.status === 'already-answered') {
    await handlers.sendMessage(userId, '本题已处理，请勿重复提交。');
    return true;
  }
  return false;
}
