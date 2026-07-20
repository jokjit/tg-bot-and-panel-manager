export async function handleAdminModerationCommand(context = {}, handlers = {}) {
  const { trimmed, defaultTargetUserId, blockedText, operator } = context;
  const nowIso = () => (typeof context.now === 'function' ? context.now() : new Date().toISOString());

  const trustMatch = trimmed.match(/^\/(?:trust|whitelist)\s*(\-?\d+)?(?:\s+([\s\S]+))?$/i);
  if (trustMatch) {
    const userId = trustMatch[1] ? Number(trustMatch[1]) : defaultTargetUserId;
    const note = (trustMatch[2] || '').trim() || '管理员加入白名单';
    if (!userId) {
      await handlers.sendNotice('请使用 /trust 用户ID 备注，或在回复/话题上下文中直接发送 /trust');
      return true;
    }
    const entry = await handlers.setTrust(userId, {
      note,
      createdAt: nowIso(),
      createdBy: operator,
    });
    await handlers.sendNotice(`已设为信任用户：${userId}${entry.note ? `\n备注：${entry.note}` : ''}`);
    return true;
  }

  const untrustMatch = trimmed.match(/^\/(?:untrust|unwhitelist)\s*(\-?\d+)?\s*$/i);
  if (untrustMatch) {
    const userId = untrustMatch[1] ? Number(untrustMatch[1]) : defaultTargetUserId;
    if (!userId) {
      await handlers.sendNotice('请使用 /untrust 用户ID，或在回复/话题上下文中直接发送 /untrust');
      return true;
    }
    await handlers.deleteTrust(userId);
    await handlers.sendNotice(`已移出信任用户：${userId}`);
    return true;
  }

  const banMatch = trimmed.match(/^\/(?:ban|block)\s*(\-?\d+)?(?:\s+([\s\S]+))?$/i);
  if (banMatch) {
    const userId = banMatch[1] ? Number(banMatch[1]) : defaultTargetUserId;
    const reason = (banMatch[2] || '').trim() || '管理员封禁';
    if (!userId) {
      await handlers.sendNotice('请使用 /ban 用户ID 原因，或在回复/话题上下文中直接发送 /ban 原因');
      return true;
    }
    const entry = await handlers.setBlacklist(userId, {
      reason,
      createdAt: nowIso(),
      createdBy: operator,
    });
    await handlers.sendNotice(`已加入黑名单：${userId}\n原因：${entry.reason}`);
    try {
      await handlers.sendBlockedMessage(userId, blockedText);
    } catch {}
    return true;
  }

  const unbanMatch = trimmed.match(/^\/unban\s*(\-?\d+)?\s*$/i);
  if (unbanMatch) {
    const userId = unbanMatch[1] ? Number(unbanMatch[1]) : defaultTargetUserId;
    if (!userId) {
      await handlers.sendNotice('请使用 /unban 用户ID，或在回复/话题上下文中直接发送 /unban');
      return true;
    }
    await handlers.deleteBlacklist(userId);
    await handlers.sendNotice(`已解除黑名单：${userId}`);
    return true;
  }

  const blacklistMatch = trimmed.match(/^\/blacklist(?:\s+(\d+))?\s*$/i);
  if (blacklistMatch) {
    const entries = await handlers.listBlacklist(handlers.parseLimit(blacklistMatch[1], 20));
    if (entries.length === 0) {
      await handlers.sendNotice('黑名单为空。');
      return true;
    }
    const text = [
      `黑名单列表（最多 ${entries.length} 条）：`,
      ...entries.map((item) => `- ${item.userId}${item.reason ? ` | ${item.reason}` : ''}`),
    ].join('\n');
    await handlers.sendNotice(text);
    return true;
  }

  return false;
}
