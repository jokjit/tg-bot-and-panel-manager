export async function handleAdminMaintenanceCommand(context = {}, handlers = {}) {
  const { trimmed, defaultTargetUserId } = context;

  const cleanupMatch = trimmed.match(/^\/cleanup(?:\s+(\d+))?\s*$/i);
  if (cleanupMatch) {
    const retentionDays = cleanupMatch[1] ? Number(cleanupMatch[1]) : undefined;
    const result = await handlers.runDataCleanup({
      retentionDays,
      source: 'telegram-admin',
      force: true,
    });
    const lines = [
      '清理完成：',
      `保留天数：${result.retentionDays}`,
      `扫描用户：${result.kv.scannedUsers}`,
      `删除用户档案：${result.kv.deletedUsers}`,
      `删除验证状态：${result.kv.deletedVerifyStates}`,
      `删除话题映射：${result.kv.deletedTopicMappings}`,
      `删除历史消息：${result.d1.deletedMessages}`,
      `删除空会话：${result.d1.deletedConversations}`,
      result.kv.protectedUsers > 0 ? `保护跳过：${result.kv.protectedUsers}` : '',
      result.kv.errors > 0 ? `异常条数：${result.kv.errors}` : '',
    ].filter(Boolean);
    await handlers.sendNotice(lines.join('\n'));
    return true;
  }

  const sweepMatch = trimmed.match(/^\/(?:sweepdeleted|deletedsweep|sweepdeleteds)\s*(\d+)?\s*$/i);
  if (sweepMatch) {
    const batchSize = sweepMatch[1] ? Number(sweepMatch[1]) : undefined;
    const result = await handlers.runDeletedAccountSweep({
      batchSize,
      source: 'telegram-admin',
      force: true,
    });
    const lines = [
      '注销账户巡检完成：',
      `扫描用户：${result.kv.scannedUsers}`,
      `命中：${result.detections.length}`,
      `删除用户档案：${result.kv.deletedUsers}`,
      `删除验证状态：${result.kv.deletedVerifyStates}`,
      `删除话题映射：${result.kv.deletedTopicMappings}`,
      `删除黑名单：${result.kv.deletedBlacklistEntries}`,
      `删除信任：${result.kv.deletedTrustEntries}`,
      `删除管理员：${result.kv.deletedAdminEntries}`,
      `删除历史消息：${result.d1.deletedMessages}`,
      `删除空会话：${result.d1.deletedConversations}`,
      result.kv.protectedUsers > 0 ? `保护跳过：${result.kv.protectedUsers}` : '',
      result.kv.probeErrors > 0 ? `探测失败：${result.kv.probeErrors}` : '',
    ].filter(Boolean);
    await handlers.sendNotice(lines.join('\n'));
    return true;
  }

  const deleteMatch = trimmed.match(/^\/(?:deleteuser|deluser|removeuser|purgeuser)\s*(\-?\d+)?\s*$/i);
  if (deleteMatch) {
    const userId = deleteMatch[1] ? Number(deleteMatch[1]) : defaultTargetUserId;
    if (!userId) {
      await handlers.sendNotice('请使用 /deleteuser 用户ID，或在回复/话题上下文中直接发送 /deleteuser');
      return true;
    }
    const result = await handlers.purgeDeletedUser(userId);
    const lines = [
      `已删除用户：${userId}`,
      `删除档案：${result.kv.deletedUsers}`,
      `删除验证状态：${result.kv.deletedVerifyStates}`,
      `删除话题映射：${result.kv.deletedTopicMappings}`,
      `删除黑名单：${result.kv.deletedBlacklistEntries}`,
      `删除信任：${result.kv.deletedTrustEntries}`,
      `删除管理员：${result.kv.deletedAdminEntries}`,
      `删除历史消息：${result.d1.deletedMessages}`,
      `删除会话：${result.d1.deletedConversations}`,
      result.kv.errors > 0 ? `KV 异常：${result.kv.errors}` : '',
      result.d1.errors > 0 ? `D1 异常：${result.d1.errors}` : '',
    ].filter(Boolean);
    await handlers.sendNotice(lines.join('\n'));
    return true;
  }

  return false;
}
