export async function handleAdminActionCallbackCommand(context = {}, handlers = {}) {
  const parts = String(context.data || '').split(':');
  const action = parts[1];
  const userId = Number(parts[2]);
  if (!Number.isFinite(userId)) {
    await handlers.answer('无效的目标用户');
    return;
  }

  const sourceMessage = context.sourceMessage || { chat: { id: context.senderId } };
  const operator = context.operator;
  if (action === 'reply') {
    const tip = context.topicModeEnabled
      ? '请直接在当前话题中回复用户消息。'
      : '请在机器人私聊中回复包含 #UID 的转发消息，或使用 /reply userId 内容。';
    await handlers.answer(tip, true);
    return;
  }

  if (action === 'user') {
    const [profile, blacklist, trust, topic, verifyState] = await Promise.all([
      handlers.getUserProfile(userId),
      handlers.getBlacklist(userId),
      handlers.getTrust(userId),
      handlers.getTopic(userId),
      handlers.getVerificationState(userId),
    ]);
    await handlers.sendNotice(sourceMessage, handlers.formatUserDetail(userId, profile, blacklist, trust, topic, verifyState));
    await handlers.answer('已发送用户资料');
    return;
  }

  if (action === 'ban') {
    const entry = await handlers.setBlacklist(userId, {
      reason: '通过按钮封禁',
      createdAt: typeof context.now === 'function' ? context.now() : new Date().toISOString(),
      createdBy: operator,
    });
    await handlers.sendNotice(sourceMessage, `已通过按钮加入黑名单：${userId}\n原因：${entry.reason}`);
    try {
      await handlers.sendBlockedMessage(userId, context.blockedText);
    } catch {}
    await handlers.answer('已拉黑该用户');
    return;
  }

  if (action === 'unban') {
    await handlers.deleteBlacklist(userId);
    await handlers.sendNotice(sourceMessage, `已通过按钮解除黑名单：${userId}`);
    await handlers.answer('已解除黑名单');
    return;
  }

  if (action === 'trust') {
    const entry = await handlers.setTrust(userId, {
      note: '通过按钮加入白名单',
      createdAt: typeof context.now === 'function' ? context.now() : new Date().toISOString(),
      createdBy: operator,
    });
    await handlers.sendNotice(sourceMessage, `已通过按钮设为信任用户：${userId}${entry.note ? `\n备注：${entry.note}` : ''}`);
    await handlers.answer('已设为信任用户');
    return;
  }

  if (action === 'untrust') {
    await handlers.deleteTrust(userId);
    await handlers.sendNotice(sourceMessage, `已通过按钮移出信任用户：${userId}`);
    await handlers.answer('已移出信任用户');
    return;
  }

  if (action === 'restart') {
    await handlers.restartVerification(userId, operator);
    await handlers.sendNotice(sourceMessage, `已通过按钮重置用户验证：${userId}\n用户下一条消息将触发新的验证入口。`);
    await handlers.answer('已重置，等待用户发新消息触发验证');
    return;
  }

  if (action === 'verifypass') {
    await handlers.approveVerification(userId, operator, { notifyUser: true });
    await handlers.sendNotice(sourceMessage, `已通过按钮手动放行验证：${userId}`);
    await handlers.answer('已手动放行验证');
    return;
  }

  await handlers.answer('未识别的管理员操作');
}
