export const ADMIN_PANEL_INPUT_TTL_SECONDS = 10 * 60;

const ID_ACTIONS = Object.freeze({
  user: '/user',
  actions: '/actions',
  restart: '/restart',
  verifypass: '/verifypass',
  ban: '/ban',
  unban: '/unban',
  trust: '/trust',
  untrust: '/untrust',
  adminadd: '/adminadd',
  admindel: '/admindel',
});

export function getAdminPanelInputScopeKey(message = {}) {
  const chatId = Number(message?.chat?.id || 0);
  const adminId = Number(message?.from?.id || 0);
  const threadId = Number(message?.message_thread_id || 0) || 0;
  if (!(Number.isFinite(chatId) && chatId && Number.isFinite(adminId) && adminId > 0)) return '';
  return `${chatId}:${threadId}:${adminId}`;
}

export function isAdminPanelInputAction(action) {
  const normalized = String(action || '').trim();
  return normalized === 'reply' || normalized === 'deleteuser' || Object.hasOwn(ID_ACTIONS, normalized);
}

function buildSession(message, action, now) {
  return {
    action,
    stage: 'id',
    chatId: Number(message.chat?.id || 0),
    threadId: Number(message.message_thread_id || 0) || null,
    adminId: Number(message.from?.id || 0),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ADMIN_PANEL_INPUT_TTL_SECONDS * 1000).toISOString(),
  };
}

function getText(message = {}) {
  return typeof message.text === 'string' ? message.text.trim() : '';
}

function getId(value) {
  return /^-?\d+$/.test(value) ? Number(value) : null;
}

function getActionLabel(action) {
  const labels = {
    reply: '回复用户', user: '查询用户', actions: '打开用户操作卡', restart: '重置验证',
    verifypass: '人工通过验证', ban: '加入黑名单', unban: '解除黑名单',
    trust: '设为信任用户', untrust: '移出信任用户', deleteuser: '彻底删除用户',
    adminadd: '授权管理员', admindel: '移除管理员',
  };
  return labels[action] || '该操作';
}

export async function beginAdminPanelInput(message, action, handlers = {}) {
  if (!isAdminPanelInputAction(action)) return false;
  const scopeKey = getAdminPanelInputScopeKey(message);
  if (!scopeKey) {
    await handlers.sendNotice?.('无法识别管理员账号，无法开启输入。');
    return false;
  }
  const now = handlers.now ? handlers.now() : new Date();
  await handlers.setSession?.(scopeKey, buildSession(message, action, now));
  await handlers.sendNotice?.([
    `已开始：${getActionLabel(action)}`,
    '请只发送目标用户 ID（仅数字）。',
    '发送 /cancel 可取消本次输入。',
  ].join('\n'));
  return true;
}

export async function tryHandleAdminPanelInputMessage(message, handlers = {}) {
  const scopeKey = getAdminPanelInputScopeKey(message);
  if (!scopeKey) return false;
  const pending = await handlers.getSession?.(scopeKey);
  if (!pending) return false;

  const text = getText(message);
  if (text === '/cancel') {
    await handlers.clearSession?.(scopeKey);
    await handlers.sendNotice?.('已取消本次面板输入。');
    return true;
  }

  if (pending.stage === 'content') {
  if (pending.stage === 'confirm') {
    await handlers.sendNotice?.('请点击删除确认按钮，或发送 /cancel 取消。');
    return true;
  }

    if (!text) {
      await handlers.sendNotice?.('请发送要回复给用户的文字内容，或发送 /cancel 取消。');
      return true;
    }
    await handlers.clearSession?.(scopeKey);
    await handlers.sendReply?.(pending.userId, text);
    await handlers.sendNotice?.(`已回复用户：${pending.userId}`);
    return true;
  }

  const userId = getId(text);
  if (!userId) {
    await handlers.sendNotice?.('请输入纯数字用户 ID；发送 /cancel 可取消。');
    return true;
  }

  if (pending.action === 'reply') {
    await handlers.setSession?.(scopeKey, {
      ...pending,
      stage: 'content',
      userId,
    });
    await handlers.sendNotice?.(`已选择用户 ${userId}。现在请发送回复内容。`);
    return true;
  }

  if (pending.action === 'deleteuser') {
    await handlers.setSession?.(scopeKey, {
      ...pending,
      stage: 'confirm',
      userId,
    });
    await handlers.requestDeleteConfirmation?.(userId);
    return true;
  }

  await handlers.clearSession?.(scopeKey);
  const command = ID_ACTIONS[pending.action];
  if (!command) return false;
  await handlers.runAdminCommand?.(`${command} ${userId}`);
  return true;
}
