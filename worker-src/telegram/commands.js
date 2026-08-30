import { telegram } from './api.js';

const USER_COMMANDS = Object.freeze([
  { command: 'start', description: '开始使用机器人 / 查看欢迎说明' },
]);

const ADMIN_COMMANDS = Object.freeze([
  { command: 'start', description: '开始使用机器人 / 查看欢迎说明' },
  { command: 'help', description: '查看管理员帮助' },
  { command: 'panel', description: '打开浏览器管理面板链接' },
  { command: 'reply', description: '回复用户：/reply 用户ID 内容' },
  { command: 'ban', description: '拉黑用户：/ban 用户ID 原因' },
  { command: 'unban', description: '解除拉黑：/unban 用户ID' },
  { command: 'trust', description: '设为信任用户：/trust 用户ID 备注' },
  { command: 'untrust', description: '取消信任用户：/untrust 用户ID' },
  { command: 'restart', description: '要求用户重新验证：/restart 用户ID' },
  { command: 'verifypass', description: '手动放行验证：/verifypass 用户ID' },
  { command: 'config', description: '查看验证、屏蔽和运行规则' },
  { command: 'verification', description: '首次验证开关：/verification on|off' },
  { command: 'verifyflow', description: '验证方式：/verifyflow captcha|math' },
  { command: 'user', description: '查看用户详情：/user 用户ID' },
  { command: 'actions', description: '发送用户快捷操作按钮：/actions 用户ID' },
  { command: 'users', description: '查看最近用户：/users 20' },
  { command: 'deleteuser', description: '彻底删除用户：/deleteuser 用户ID' },
  { command: 'setwelcome', description: '设置欢迎内容：/setwelcome' },
  { command: 'setwelcometext', description: '只修改欢迎文案，保留当前媒体' },
  { command: 'cancelwelcome', description: '取消欢迎设置：/cancelwelcome' },
  { command: 'blacklist', description: '查看黑名单列表' },
  { command: 'trustlist', description: '查看信任用户列表' },
  { command: 'keywords', description: '查看关键词屏蔽规则' },
  { command: 'blockedtext', description: '查看当前封禁提示' },
  { command: 'admins', description: '查看管理员列表' },
  { command: 'adminadd', description: '授权管理员：/adminadd 用户ID 备注' },
  { command: 'admindel', description: '移除管理员：/admindel 用户ID' },
  { command: 'panelpass', description: '重发当前面板临时密码' },
  { command: 'panelreset', description: '生成新的面板临时密码' },
  { command: 'upload', description: '上传下一张图片到图床' },
  { command: 'sweepdeleted', description: '巡检已注销账户并清理' },
  { command: 'cleanup', description: '按保留期清理历史数据' },
  { command: 'setcommands', description: '同步 Telegram 斜杠菜单' },
]);

export function getTelegramCommandCatalog() {
  return {
    default: USER_COMMANDS.map((item) => ({ ...item })),
    admin: ADMIN_COMMANDS.map((item) => ({ ...item })),
  };
}

export async function syncTelegramCommandMenu(options = {}) {
  const send = options.send || telegram;
  const commands = getTelegramCommandCatalog();
  // A chat-scoped command menu in a group is visible to every member. Admin
  // commands must therefore only be scoped to private admin chats.
  const adminChatIds = Array.from(new Set((options.adminChatIds || []).map(Number).filter((chatId) => Number.isFinite(chatId) && chatId > 0)));
  const legacyGroupChatIds = Array.from(new Set((options.legacyGroupChatIds || []).map(Number).filter((chatId) => Number.isFinite(chatId) && chatId < 0)));
  const adminUserIds = Array.from(new Set((options.adminUserIds || []).map(Number).filter((userId) => Number.isFinite(userId) && userId > 0)));
  const scopedAdminUserIds = adminUserIds.filter((userId) => !adminChatIds.includes(userId));
  const applied = [];
  const failedScopes = [];
  const clearedGroupScopes = [];

  applied.push(await send(options.env, 'setMyCommands', {
    scope: { type: 'default' },
    commands: commands.default,
  }));
  applied.push(await send(options.env, 'setChatMenuButton', {
    menu_button: { type: 'commands' },
  }));

  for (const chatId of legacyGroupChatIds) {
    try {
      await send(options.env, 'deleteMyCommands', {
        scope: { type: 'chat', chat_id: chatId },
      });
      clearedGroupScopes.push(chatId);
    } catch (error) {
      failedScopes.push({
        scope: 'admin_group_cleanup',
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const chatId of adminChatIds) {
    try {
      applied.push(await send(options.env, 'setMyCommands', {
        scope: { type: 'chat', chat_id: chatId },
        commands: commands.admin,
      }));
    } catch (error) {
      failedScopes.push({
        scope: 'admin_chat',
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const userId of scopedAdminUserIds) {
    try {
      applied.push(await send(options.env, 'setMyCommands', {
        scope: { type: 'chat', chat_id: userId },
        commands: commands.admin,
      }));
    } catch (error) {
      failedScopes.push({
        scope: 'admin_private',
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    commands,
    menuButton: 'commands',
    adminCommandChats: adminChatIds,
    adminCommandTargets: scopedAdminUserIds,
    clearedGroupScopes,
    failedScopes,
    appliedCount: applied.length,
    note: adminChatIds.length > 0 || scopedAdminUserIds.length > 0
      ? '默认命令已同步；管理员命令已下发到 ADMIN_CHAT_ID 对应聊天，并按管理员私聊用户 ID 单独下发。'
      : '默认命令已同步；未找到可用的 ADMIN_CHAT_ID 或管理员私聊用户 ID，因此管理员专属命令未单独下发。',
  };
}
