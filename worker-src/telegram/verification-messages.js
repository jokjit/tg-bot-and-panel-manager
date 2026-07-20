export const VERIFICATION_SUCCESS_PROMPT_TEXT = '✅ 验证通过，已解除限制。';
export const VERIFICATION_WELCOME_EXTRA_TEXT = '你已完成首次验证，现在可以正常发送消息了。';

export function buildExpiredVerificationPromptText() {
  return [
    '⏰ 验证已过期',
    '本次验证题目已失效。',
    '请等待 1 分钟后重新发送消息获取新题目。',
  ].join('\n');
}

export function buildBannedVerificationPromptText(result = {}) {
  return [
    '🚫 验证失败次数过多',
    `连续失败次数：${result.failureCount}/${result.maxFailures}`,
    '你已被自动加入黑名单，请等待管理员处理。',
  ].join('\n');
}

export function buildIncorrectVerificationPromptText(answer, result = {}) {
  return [
    '❌ 验证失败',
    `你的答案：${answer}，正确答案：${result.correctAnswer}`,
    `连续失败次数：${result.failureCount}/${result.maxFailures}`,
    '请等待 1 分钟后重新发送消息获取新题目。',
    `解封时间：${result.blockedUntil}`,
  ].join('\n');
}
