export async function handleAdminAccessCommand(context = {}, handlers = {}) {
  const { trimmed, rootAdmin, operator } = context;

  const addMatch = trimmed.match(/^\/(?:adminadd|grantadmin|authadmin)\s+(\-?\d+)(?:\s+([\s\S]+))?$/i);
  if (addMatch) {
    if (!rootAdmin) {
      await handlers.sendNotice('只有根管理员或配置管理群的群主才可以授权新的管理员。');
      return true;
    }
    const userId = Number(addMatch[1]);
    const note = (addMatch[2] || '').trim() || null;
    const entry = await handlers.setAuthorizedAdmin(userId, {
      note,
      createdAt: typeof context.now === 'function' ? context.now() : new Date().toISOString(),
      createdBy: operator,
    });
    await handlers.sendNotice(`已授权管理员：${userId}${entry.note ? `\n备注：${entry.note}` : ''}`);
    return true;
  }

  const removeMatch = trimmed.match(/^\/(?:admindel|revokeadmin|deauthadmin)\s+(\-?\d+)\s*$/i);
  if (removeMatch) {
    if (!rootAdmin) {
      await handlers.sendNotice('只有根管理员或配置管理群的群主才可以移除管理员授权。');
      return true;
    }
    const userId = Number(removeMatch[1]);
    await handlers.deleteAuthorizedAdmin(userId);
    await handlers.sendNotice(`已移除管理员授权：${userId}`);
    return true;
  }

  const listMatch = trimmed.match(/^\/admins(?:\s+(\d+))?\s*$/i);
  if (listMatch) {
    const admins = await handlers.listAuthorizedAdmins(handlers.parseLimit(listMatch[1], 20));
    if (admins.length === 0) {
      await handlers.sendNotice('当前没有可用管理员。');
      return true;
    }
    const text = [
      `已授权管理员（最多 ${admins.length} 条）：`,
      ...admins.map((item) => {
        const suffix = [item.source, item.note].filter(Boolean).join(' | ');
        return `- ${item.userId}${suffix ? ` | ${suffix}` : ''}`;
      }),
    ].join('\n');
    await handlers.sendNotice(text);
    return true;
  }

  return false;
}
