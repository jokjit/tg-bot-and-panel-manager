function resolveTarget(match, defaultTargetUserId) {
  return match[1] ? Number(match[1]) : defaultTargetUserId;
}

export async function handleAdminUserCommand(context = {}, handlers = {}) {
  const { trimmed, defaultTargetUserId, operator } = context;

  const restartMatch = trimmed.match(/^\/(?:restart|reverify)\s*(\-?\d+)?\s*$/i);
  if (restartMatch) {
    const userId = resolveTarget(restartMatch, defaultTargetUserId);
    if (!userId) {
      await handlers.sendNotice('请使用 /restart 用户ID，或在回复/话题上下文中直接发送 /restart');
      return true;
    }
    await handlers.restartVerification(userId, operator);
    await handlers.sendNotice(`已重置用户验证：${userId}\n用户下一条消息将触发新的验证入口。`);
    return true;
  }

  const passMatch = trimmed.match(/^\/(?:verifypass|passverify|approveverify)\s*(\-?\d+)?\s*$/i);
  if (passMatch) {
    const userId = resolveTarget(passMatch, defaultTargetUserId);
    if (!userId) {
      await handlers.sendNotice('请使用 /verifypass 用户ID，或在回复/话题上下文中直接发送 /verifypass');
      return true;
    }
    await handlers.approveVerification(userId, operator, { notifyUser: true });
    await handlers.sendNotice(`已手动通过验证：${userId}`);
    return true;
  }

  const userMatch = trimmed.match(/^\/user\s*(\-?\d+)?\s*$/i);
  if (userMatch) {
    const userId = resolveTarget(userMatch, defaultTargetUserId);
    if (!userId) {
      await handlers.sendNotice('请使用 /user 用户ID，或在回复/话题上下文中直接发送 /user');
      return true;
    }
    const [profile, blacklist, trust, topic, verifyState] = await Promise.all([
      handlers.getUserProfile(userId),
      handlers.getBlacklist(userId),
      handlers.getTrust(userId),
      handlers.getTopic(userId),
      handlers.getVerificationState(userId),
    ]);
    await handlers.sendNotice(handlers.formatUserDetail(userId, profile, blacklist, trust, topic, verifyState));
    return true;
  }

  const actionsMatch = trimmed.match(/^\/(?:actions|action|buttons|controls)\s*(\-?\d+)?\s*$/i);
  if (actionsMatch) {
    const userId = resolveTarget(actionsMatch, defaultTargetUserId);
    if (!userId) {
      await handlers.sendNotice('请使用 /actions 用户ID，或在用户话题/回复上下文中直接发送 /actions');
      return true;
    }
    await handlers.sendUserActions(userId);
    return true;
  }

  const usersMatch = trimmed.match(/^\/users(?:\s+(\d+))?\s*$/i);
  if (usersMatch) {
    const users = await handlers.listUsers(handlers.parseLimit(usersMatch[1], 20));
    if (users.length === 0) {
      await handlers.sendNotice('暂无用户记录，请先配置 BOT_KV 并让用户与机器人互动。');
      return true;
    }
    const text = [
      `最近活跃用户（最多 ${users.length} 条）：`,
      ...users.map((item) => `- ${item.userId} | ${item.displayName || '未命名'} | ${item.lastSeenAt || '未知时间'}`),
    ].join('\n');
    await handlers.sendNotice(text);
    return true;
  }

  return false;
}
