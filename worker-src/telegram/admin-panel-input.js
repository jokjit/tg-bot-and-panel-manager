export const ADMIN_PANEL_INPUT_TTL_SECONDS = 10 * 60;

const ID_ACTIONS = Object.freeze({
  user: '/user',
  actions: '/actions',
  restart: '/restart',
  verifypass: '/verifypass',
  unban: '/unban',
  untrust: '/untrust',
  admindel: '/admindel',
});

const CONTENT_ACTIONS = Object.freeze({
  reply: { command: '', prompt: '现在请发送回复内容。', optional: false },
  ban: { command: '/ban', prompt: '现在请发送封禁原因；发送 /skip 使用默认原因。', optional: true },
  trust: { command: '/trust', prompt: '现在请发送信任备注；发送 /skip 使用默认备注。', optional: true },
  adminadd: { command: '/adminadd', prompt: '现在请发送授权备注；发送 /skip 可不填写备注。', optional: true },
});

const TEXT_ACTIONS = Object.freeze({
  keywords: {
    command: '/setkeywords',
    label: '关键词屏蔽规则',
    prompt: '请发送关键词列表，支持每行一个或使用英文逗号分隔。',
  },
  blockedtext: {
    command: '/setblockedtext',
    label: '封禁提示',
    prompt: '请发送用户被封禁时看到的提示文字。',
  },
});

const VALUE_ACTIONS = Object.freeze({
  users: { command: '/users', label: '最近用户数量', min: 1, max: 100 },
  blacklist: { command: '/blacklist', label: '黑名单显示数量', min: 1, max: 100 },
  trustlist: { command: '/trustlist', label: '信任用户显示数量', min: 1, max: 100 },
  admins: { command: '/admins', label: '管理员显示数量', min: 1, max: 100 },
  cleanup: { command: '/cleanup', label: '数据保留天数', min: 1, max: 3650 },
  sweepdeleted: { command: '/sweepdeleted', label: '单批巡检数量', min: 1, max: 1000 },
  verifyexpire: { command: '/verifyexpire', label: '验证有效分钟数', min: 1, max: 120 },
  verifyfailblock: { command: '/verifyfailblock', label: '验证失败冷却秒数', min: 10, max: 3600 },
  verifytimeoutblock: { command: '/verifytimeoutblock', label: '验证超时冷却秒数', min: 10, max: 3600 },
  verifymaxfailures: { command: '/verifymaxfailures', label: '最大验证失败次数', min: 1, max: 10 },
  verifyobserve: { command: '/verifyobserve', label: '验证后观察消息数', min: 0, max: 20 },
  cleanupbatch: { command: '/cleanupbatch', label: '自动清理批量', min: 20, max: 1000 },
  sweepbatch: { command: '/sweepbatch', label: '注销巡检批量', min: 20, max: 1000 },
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
  return normalized === 'deleteuser'
    || Object.hasOwn(CONTENT_ACTIONS, normalized)
    || Object.hasOwn(TEXT_ACTIONS, normalized)
    || Object.hasOwn(ID_ACTIONS, normalized)
    || Object.hasOwn(VALUE_ACTIONS, normalized);
}

function buildSession(message, action, now) {
  return {
    action,
    stage: Object.hasOwn(VALUE_ACTIONS, action)
      ? 'value'
      : Object.hasOwn(TEXT_ACTIONS, action)
        ? 'text'
        : 'id',
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
    adminadd: '授权管理员', admindel: '移除管理员', users: '查看最近用户',
    blacklist: '查看黑名单', trustlist: '查看信任用户', admins: '查看管理员',
    cleanup: '自定义清理历史数据', sweepdeleted: '自定义巡检已注销账户',
    keywords: '设置关键词屏蔽规则', blockedtext: '设置封禁提示',
    verifyexpire: '设置验证有效期', verifyfailblock: '设置验证失败冷却',
    verifytimeoutblock: '设置验证超时冷却', verifymaxfailures: '设置最大验证失败次数',
    verifyobserve: '设置验证后观察消息数', cleanupbatch: '设置自动清理批量',
    sweepbatch: '设置注销巡检批量',
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
  const valueAction = VALUE_ACTIONS[action];
  const textAction = TEXT_ACTIONS[action];
  await handlers.sendNotice?.([
    `已开始：${getActionLabel(action)}`,
    valueAction
      ? `请只发送${valueAction.label}（${valueAction.min}-${valueAction.max} 的整数）。`
      : textAction?.prompt || '请只发送目标用户 ID（仅数字）。',
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

  if (pending.stage === 'confirm') {
    await handlers.sendNotice?.('请点击删除确认按钮，或发送 /cancel 取消。');
    return true;
  }

  if (pending.stage === 'content') {
    const contentAction = CONTENT_ACTIONS[pending.action];
    if (!text) {
      await handlers.sendNotice?.(`${contentAction?.prompt || '请发送操作内容。'}\n发送 /cancel 可取消。`);
      return true;
    }
    if (text === '/skip' && !contentAction?.optional) {
      await handlers.sendNotice?.('当前内容不可跳过，请发送回复内容，或发送 /cancel 取消。');
      return true;
    }
    await handlers.clearSession?.(scopeKey);
    if (pending.action === 'reply') {
      await handlers.sendReply?.(pending.userId, text);
      await handlers.sendNotice?.(`已回复用户：${pending.userId}`);
      return true;
    }
    const suffix = text === '/skip' ? '' : ` ${text}`;
    await handlers.runAdminCommand?.(`${contentAction.command} ${pending.userId}${suffix}`);
    return true;
  }

  if (pending.stage === 'text') {
    const textAction = TEXT_ACTIONS[pending.action];
    if (!textAction || !text) {
      await handlers.sendNotice?.(`${textAction?.prompt || '请输入有效文字。'}\n发送 /cancel 可取消。`);
      return true;
    }
    await handlers.clearSession?.(scopeKey);
    await handlers.runAdminCommand?.(`${textAction.command} ${text}`);
    return true;
  }

  if (pending.stage === 'value') {
    const valueAction = VALUE_ACTIONS[pending.action];
    const value = /^\d+$/.test(text) ? Number(text) : null;
    if (!valueAction || !Number.isInteger(value) || value < valueAction.min || value > valueAction.max) {
      await handlers.sendNotice?.(
        `请输入 ${valueAction?.min || 1}-${valueAction?.max || 100} 的整数；发送 /cancel 可取消。`,
      );
      return true;
    }
    await handlers.clearSession?.(scopeKey);
    await handlers.runAdminCommand?.(`${valueAction.command} ${value}`);
    return true;
  }

  const userId = getId(text);
  if (!userId) {
    await handlers.sendNotice?.('请输入纯数字用户 ID；发送 /cancel 可取消。');
    return true;
  }

  const contentAction = CONTENT_ACTIONS[pending.action];
  if (contentAction) {
    await handlers.setSession?.(scopeKey, {
      ...pending,
      stage: 'content',
      userId,
    });
    await handlers.sendNotice?.(`已选择用户 ${userId}。${contentAction.prompt}`);
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
