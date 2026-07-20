export function buildVerificationAutoBanReason(failedState = {}, maxFailures = 0) {
  return `首次私聊验证连续失败 ${failedState.failureCount}/${maxFailures} 次，系统自动拉黑`;
}

export function buildVerificationAutoBanReportText(context = {}) {
  const { userId, failedState = {}, maxFailures = 0, entry = {}, profile = {} } = context;
  return [
    '🚫 用户验证失败次数过多，已自动拉黑',
    `用户：${profile?.displayName || '未知'}${profile?.username ? ` @${profile.username}` : ''}`,
    `ID：${userId}`,
    `失败次数：${failedState.failureCount}/${maxFailures}`,
    `最后选择：${failedState.selectedAnswer || '无'}`,
    `正确答案：${failedState.correctAnswer || '未知'}`,
    `原因：${entry.reason}`,
  ].join('\n');
}

export async function reportVerificationAutoBan(context = {}, handlers = {}) {
  try {
    const profile = await handlers.getProfile(context.userId);
    await handlers.sendMessage({
      chat_id: handlers.getAdminChatId(),
      text: buildVerificationAutoBanReportText({ ...context, profile }),
    });
  } catch (error) {
    // The blacklist entry remains authoritative when reporting fails.
  }
}

export async function banUserForVerificationFailuresState(context = {}, handlers = {}) {
  const { userId, failedState = {}, maxFailures = 0 } = context;
  const entry = await handlers.setBlacklist(userId, {
    reason: buildVerificationAutoBanReason(failedState, maxFailures),
    createdAt: await handlers.nowIso(),
    createdBy: 'verification-guard',
  });
  await reportVerificationAutoBan({ userId, failedState, maxFailures, entry }, handlers);
  return entry;
}
