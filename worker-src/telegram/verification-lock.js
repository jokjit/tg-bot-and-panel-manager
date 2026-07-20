export function formatVerificationStageText(stage) {
  const normalized = String(stage || '').toLowerCase();
  if (normalized === 'slider') return '旋转验证';
  if (normalized === 'grid') return '九宫格点选';
  if (normalized === 'choice') return '数字四选一';
  if (normalized === 'blocked') return '锁定状态';
  return '未知阶段';
}

export function formatVerificationReasonText(reason) {
  const normalized = String(reason || '').toLowerCase();
  const labels = {
    slider_position_mismatch: '滑块位置不匹配',
    slider_value_invalid: '滑块值无效',
    slider_missing: '滑块题目缺失',
    rotation_angle_mismatch: '旋转角度未对齐',
    rotation_value_invalid: '旋转角度无效',
    trace_too_short: '滑动轨迹过短',
    trace_too_fast: '滑动速度过快',
    trace_not_enough_segments: '滑动轨迹分段不足',
    trace_direction_invalid: '轨迹方向异常',
    trace_distance_invalid: '轨迹位移异常',
    interaction_risk_high: '交互行为风险较高',
    trace_too_linear: '轨迹过于线性',
    trace_variance_too_low: '轨迹波动不足',
    trace_time_invalid: 'trace timestamp invalid',
    trace_range_invalid: 'trace range invalid',
    trace_jump_invalid: 'trace jump invalid',
    trace_end_mismatch: 'trace endpoint mismatch',
    proof_missing: 'proof missing',
    proof_nonce_mismatch: 'proof nonce mismatch',
    proof_signature_mismatch: 'proof signature mismatch',
    proof_expired: 'proof expired',
    grid_selection_mismatch: '九宫格选择错误',
    choice_selection_mismatch: '数字选择错误',
    verification_failed: '验证失败',
  };
  return labels[normalized] || '未知原因';
}

export function buildVerificationFailureAdminKeyboard(userId) {
  return {
    inline_keyboard: [
      [{ text: '✅ 验证放行', callback_data: `adm:verifypass:${userId}` }],
      [
        { text: '💔 重置验证', callback_data: `adm:restart:${userId}` },
        { text: '🚫 拉黑', callback_data: `adm:ban:${userId}` },
      ],
      [{ text: '👁 用户资料', callback_data: `adm:user:${userId}` }],
    ],
  };
}

export function buildVerificationFailureReportText(context = {}) {
  const { userId, state, profile, maxAttempts } = context;
  const stage = String(state?.lastLockStage || state?.stage || 'unknown');
  const reason = String(state?.lastLockReason || 'verification_failed');
  return [
    '🚨 验证失败并已锁定',
    `用户：${profile?.displayName || '未知用户'}${profile?.username ? ` @${profile.username}` : ''}`,
    `用户ID：${userId}`,
    `阶段：${formatVerificationStageText(stage)} (${stage})`,
    `原因：${formatVerificationReasonText(reason)} (${reason})`,
    `锁定至：${state?.blockedUntil || '未知'}`,
    `旋转尝试：${Number(state?.slider?.attempts || 0)}/${maxAttempts}`,
    `九宫格尝试：${Number(state?.grid?.attempts || 0)}/${maxAttempts}`,
    `数字选择尝试：${Number(state?.choice?.attempts || 0)}/${maxAttempts}`,
  ].join('\n');
}

export async function reportVerificationFailureToAdmin(context = {}, handlers = {}) {
  try {
    const profile = await handlers.getProfile(context.userId);
    await handlers.sendMessage({
      chat_id: handlers.getAdminChatId(),
      message_thread_id: handlers.getTopicId() || undefined,
      text: buildVerificationFailureReportText({
        userId: context.userId,
        state: context.state,
        profile,
        maxAttempts: handlers.getMaxAttempts(),
      }),
      reply_markup: buildVerificationFailureAdminKeyboard(context.userId),
    });
  } catch (error) {
    // Notification failure must not undo a persisted lock.
  }
}

export async function lockVerificationAndReportState(context = {}, handlers = {}) {
  const { userId, state, detail = {} } = context;
  const now = handlers.nowMs();
  const blockedUntil = new Date(now + handlers.getRetryBlockMs()).toISOString();
  const nextState = {
    ...(state || {}),
    userId: Number(userId),
    verified: false,
    verifiedAt: null,
    blockedUntil,
    stage: 'blocked',
    sessionExpiresAt: null,
    lastLockReason: detail?.reason || 'verification_failed',
    lastLockStage: detail?.stage || null,
    lastLockAt: new Date(now).toISOString(),
    lastLockDetail: detail || {},
    updatedAt: new Date(now).toISOString(),
  };

  await handlers.saveState(userId, nextState, state || null);
  await handlers.clearLatest(userId);
  try {
    await handlers.notifyUser(userId, blockedUntil);
  } catch (error) {
    // Ignore user notification failure.
  }
  await handlers.reportFailure(userId, nextState);
  return nextState;
}
