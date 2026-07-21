export const ADMIN_COMMAND_PANEL_CALLBACK_PREFIX = 'panel:';

const MENUS = Object.freeze({
  media: { title: '🖼 图床与浏览器面板', description: '管理 Telegram 图床上传、浏览器控制台入口和临时密码。', buttons: [[['🖼 上传图片', 'upload'], ['🌐 打开管理面板', 'command:open']], [['🔑 面板密码', 'menu:panel-access'], ['🚫 取消上传说明', 'guide:cancel-upload']]], back: 'home' },
  'panel-access': { title: '🔑 管理面板访问', description: '获取或重置浏览器管理面板的临时密码。', buttons: [[['📨 重发当前密码', 'command:panelpass'], ['♻️ 重置临时密码', 'confirm:panelreset']]], back: 'media' },
  messaging: { title: '💬 用户沟通', description: '查看最近用户、回复消息和打开用户快捷操作卡。', buttons: [[['👥 最近用户', 'command:users'], ['💬 回复用户', 'guide:reply']], [['🗨️ 话题内回复', 'guide:topic-reply'], ['🎛 用户操作卡', 'guide:actions']]], back: 'home' },
  users: { title: '👤 用户查询与验证', description: '查询用户资料、快捷操作和验证状态。', buttons: [[['👥 最近用户', 'command:users'], ['🔎 查询用户', 'guide:user']], [['🎛 用户操作卡', 'guide:actions'], ['✅ 验证管理', 'menu:verification']]], back: 'home' },
  verification: { title: '✅ 验证管理', description: '对指定用户重新发起验证或人工通过验证。', buttons: [[['🔄 重置验证', 'guide:restart'], ['✅ 人工通过', 'guide:verifypass']]], back: 'users' },
  moderation: { title: '🛡 风控与用户数据', description: '管理黑名单、信任用户，以及永久删除用户数据。', buttons: [[['⛔ 黑名单列表', 'command:blacklist'], ['🚫 黑名单操作', 'menu:blacklist-actions']], [['⭐ 信任用户操作', 'menu:trust-actions'], ['🗑️ 删除用户', 'guide:deleteuser']]], back: 'home' },
  'blacklist-actions': { title: '🚫 黑名单操作', description: '加入或解除黑名单均需要指定用户 ID，或在用户话题中操作。', buttons: [[['⛔ 加入黑名单', 'guide:ban'], ['✅ 解除黑名单', 'guide:unban']]], back: 'moderation' },
  'trust-actions': { title: '⭐ 信任用户操作', description: '设为信任或移出信任用户均需要指定用户 ID，或在用户话题中操作。', buttons: [[['⭐ 设为信任', 'guide:trust'], ['↩️ 移出信任', 'guide:untrust']]], back: 'moderation' },
  'admin-system': { title: '👮 管理员与系统', description: '管理管理员权限、欢迎内容、数据维护和命令菜单。', buttons: [[['👮 管理员列表', 'command:admins'], ['➕ 管理员权限', 'menu:admin-access']], [['👋 欢迎内容', 'menu:welcome'], ['⚙️ 数据维护', 'menu:maintenance']], [['🔄 同步命令菜单', 'command:commands']]], back: 'home' },
  'admin-access': { title: '👮 管理员权限', description: '管理员列表可直接查看；授权和移除仅根管理员可执行。', buttons: [[['👮 查看管理员', 'command:admins'], ['➕ 授权管理员', 'guide:adminadd']], [['➖ 移除管理员', 'guide:admindel']]], back: 'admin-system' },
  welcome: { title: '👋 欢迎内容', description: '开启后，下一条消息会被保存为欢迎内容；支持文字和多种媒体。', buttons: [[['✏️ 设置欢迎内容', 'command:setwelcome'], ['🚫 取消设置', 'command:cancelwelcome']]], back: 'admin-system' },
  maintenance: { title: '⚙️ 数据维护', description: '清理和巡检会删除数据，需二次确认；也可查看自定义参数格式。', buttons: [[['🧹 清理历史数据', 'confirm:cleanup'], ['🧽 巡检已注销账户', 'confirm:sweepdeleted']], [['📖 参数说明', 'guide:maintenance-options']]], back: 'admin-system' },
});

const COMMANDS = Object.freeze({
  open: ['/panel', '已发送管理面板入口'], users: ['/users 10', '已发送最近用户'], commands: ['/setcommands', '正在同步命令菜单'], blacklist: ['/blacklist', '已发送黑名单列表'], admins: ['/admins', '已发送管理员列表'], panelpass: ['/panelpass', '已发送当前临时密码'], setwelcome: ['/setwelcome', '欢迎内容设置已开启'], cancelwelcome: ['/cancelwelcome', '已取消欢迎内容设置'],
});

const CONFIRMS = Object.freeze({
  cleanup: ['🧹 确认清理历史数据', '此操作会按当前保留策略清理历史用户资料、验证状态、话题映射和消息记录。执行后部分数据无法恢复。', '/cleanup', '确认清理', 'maintenance'],
  sweepdeleted: ['🧽 确认巡检已注销账户', '此操作会检测已注销的 Telegram 账户，并清理命中的用户资料、关联状态和历史记录。', '/sweepdeleted', '确认巡检并清理', 'maintenance'],
  panelreset: ['🔑 确认重置面板临时密码', '重置后，当前浏览器管理面板临时密码将立即失效，并生成一组新密码。', '/panelreset', '确认重置密码', 'panel-access'],
});

const GUIDES = Object.freeze({
  reply: ['💬 回复用户', ['请发送：/reply 用户ID 回复内容', '在用户专属话题内可直接发送消息，或使用：/r 回复内容'], 'messaging'],
  'topic-reply': ['🗨️ 话题内快速回复', ['进入对应用户的话题后，直接发送消息即可回复。', '也可发送：/r 回复内容', '若群内直接回复无效，请在 @BotFather 执行 /setprivacy 并选择 Disable。'], 'messaging'],
  user: ['🔎 查询用户详情', ['请发送：/user 用户ID', '在用户话题或回复用户消息的上下文中，可直接发送：/user'], 'users'],
  actions: ['🎛 用户快捷操作卡', ['请发送：/actions 用户ID', '在用户话题或回复用户消息的上下文中，可直接发送：/actions', '操作卡会提供查询、验证、拉黑和信任等快捷按钮。'], 'users'],
  restart: ['🔄 重置用户验证', ['请发送：/restart 用户ID', '在用户话题或回复用户消息的上下文中，可直接发送：/restart'], 'verification'],
  verifypass: ['✅ 手动通过验证', ['请发送：/verifypass 用户ID', '在用户话题或回复用户消息的上下文中，可直接发送：/verifypass'], 'verification'],
  ban: ['⛔ 加入黑名单', ['请发送：/ban 用户ID 原因', '在用户话题或回复用户消息的上下文中，可发送：/ban 原因'], 'blacklist-actions'],
  unban: ['✅ 解除黑名单', ['请发送：/unban 用户ID', '在用户话题或回复用户消息的上下文中，可直接发送：/unban'], 'blacklist-actions'],
  trust: ['⭐ 设为信任用户', ['请发送：/trust 用户ID 备注', '在用户话题或回复用户消息的上下文中，可发送：/trust 备注'], 'trust-actions'],
  untrust: ['↩️ 移出信任用户', ['请发送：/untrust 用户ID', '在用户话题或回复用户消息的上下文中，可直接发送：/untrust'], 'trust-actions'],
  deleteuser: ['🗑️ 彻底删除用户', ['请发送：/deleteuser 用户ID', '在用户话题或回复用户消息的上下文中，可直接发送：/deleteuser', '该命令会删除用户资料、验证状态、会话与历史消息，无法恢复。'], 'moderation'],
  adminadd: ['➕ 授权管理员', ['仅根管理员可执行。', '请发送：/adminadd 用户ID 备注'], 'admin-access'],
  admindel: ['➖ 移除管理员', ['仅根管理员可执行。', '请发送：/admindel 用户ID'], 'admin-access'],
  'cancel-upload': ['🚫 取消图床上传', ['在图片接收状态下发送：/cancel', '取消仅影响当前管理员、当前聊天和当前话题。'], 'media'],
  'maintenance-options': ['⚙️ 维护命令参数', ['/cleanup：按默认保留策略清理历史数据。', '/cleanup 天数：自定义保留天数，例如 /cleanup 30。', '/sweepdeleted：巡检并清理已注销账户。', '/sweepdeleted 数量：自定义单批巡检数量，例如 /sweepdeleted 100。'], 'maintenance'],
});

const INPUT_ACTIONS = new Set(['reply', 'user', 'actions', 'restart', 'verifypass', 'ban', 'unban', 'trust', 'untrust', 'deleteuser', 'adminadd', 'admindel']);

function button(text, action) { return { text, callback_data: ADMIN_COMMAND_PANEL_CALLBACK_PREFIX + action }; }
function navigation(back) { const backButton = back === 'home' ? button('⬅️ 返回首页', 'home') : button('⬅️ 返回上级', 'menu:' + back); return [[backButton, button('🏠 首页', 'home')], [button('✖️ 关闭', 'close')]]; }

export function buildAdminCommandPanelText() { return ['🛠 管理员控制面板', '', '图床上传、用户管理和系统维护均已按二级、三级菜单分类。', '需要用户 ID 或正文的操作会显示准确的发送格式；其他操作可直接执行。'].join('\n'); }
export function buildAdminCommandPanelKeyboard() { return buildHierarchicalAdminCommandPanelKeyboard(); }
export function buildHierarchicalAdminCommandPanelKeyboard() { return { inline_keyboard: [[button('🖼 图床与面板', 'menu:media'), button('💬 用户沟通', 'menu:messaging')], [button('👤 用户查询与验证', 'menu:users'), button('🛡 风控与用户数据', 'menu:moderation')], [button('👮 管理员与系统', 'menu:admin-system'), button('📚 命令总览', 'help')], [button('✖️ 关闭', 'close')]] }; }

function actionOf(data) { const value = String(data || '').trim(); return value.startsWith(ADMIN_COMMAND_PANEL_CALLBACK_PREFIX) ? value.slice(ADMIN_COMMAND_PANEL_CALLBACK_PREFIX.length) : ''; }
export function isAdminCommandPanelCallback(data) { const action = actionOf(data); if (['home', 'upload', 'help', 'close', 'deleteuser'].includes(action) || Object.hasOwn(COMMANDS, action)) return true; if (action.startsWith('menu:')) return Object.hasOwn(MENUS, action.slice(5)); if (action.startsWith('guide:')) return Object.hasOwn(GUIDES, action.slice(6)); if (action.startsWith('input:')) return INPUT_ACTIONS.has(action.slice(6)); if (action.startsWith('command:')) return Object.hasOwn(COMMANDS, action.slice(8)); if (action.startsWith('confirm:') || action.startsWith('run:')) return Object.hasOwn(CONFIRMS, action.slice(action.indexOf(':') + 1)); return false; }

function buildMenu(menuId) { const menu = MENUS[menuId]; if (!menu) return null; return { text: menu.title + '\n\n' + menu.description, reply_markup: { inline_keyboard: [...menu.buttons.map((row) => row.map(([text, action]) => button(text, action))), ...navigation(menu.back)] } }; }
function buildGuide(guideId) { const guide = GUIDES[guideId]; if (!guide) return null; const input = INPUT_ACTIONS.has(guideId) ? [[button('⌨️ 只输入用户 ID', 'input:' + guideId)]] : []; return { text: guide[0] + '\n\n' + guide[1].join('\n'), reply_markup: { inline_keyboard: [...input, ...navigation(guide[2])] } }; }
function buildConfirm(confirmId) { const confirm = CONFIRMS[confirmId]; if (!confirm) return null; return { text: confirm[0] + '\n\n' + confirm[1] + '\n\n确认后将立即执行。', reply_markup: { inline_keyboard: [[button('⚠️ ' + confirm[3], 'run:' + confirmId)], ...navigation(confirm[4])] } }; }
function buildHelpText() { return ['📚 管理员命令总览', '', '图床与面板：/upload、/cancel、/panel、/panelpass、/panelreset', '用户沟通：/reply 用户ID 内容、/r 内容、/users [数量]、/user [用户ID]、/actions [用户ID]', '验证与风控：/restart [用户ID]、/verifypass [用户ID]、/ban 用户ID 原因、/unban 用户ID、/blacklist、/trust 用户ID 备注、/untrust 用户ID', '管理员与系统：/admins、/adminadd 用户ID 备注、/admindel 用户ID、/setwelcome、/cancelwelcome、/setcommands', '数据维护：/cleanup [保留天数]、/sweepdeleted [批量数量]、/deleteuser [用户ID]', '', '提示：在用户话题或回复上下文中，很多带 [用户ID] 的命令可省略该参数。'].join('\n'); }

export async function handleAdminCommandPanelCallback(context = {}, handlers = {}) {
  const action = actionOf(context.data);
  if (!isAdminCommandPanelCallback(context.data)) { await handlers.answer?.('未识别的面板操作', true); return false; }
  if (action === 'upload') { await handlers.startUpload?.(); await handlers.answer?.('已开启图片接收态'); return true; }
  if (action === 'home') { await handlers.editPanel?.({ text: buildAdminCommandPanelText(), reply_markup: buildHierarchicalAdminCommandPanelKeyboard() }); await handlers.answer?.(); return true; }
  if (action === 'help') { await handlers.editPanel?.({ text: buildHelpText(), reply_markup: { inline_keyboard: navigation('home') } }); await handlers.answer?.(); return true; }
  if (action === 'close') { await handlers.editPanel?.({ text: '管理员面板已关闭。发送 /start 可再次打开。', reply_markup: { inline_keyboard: [] } }); await handlers.answer?.('已关闭'); return true; }
  if (action.startsWith('menu:')) { const view = buildMenu(action.slice(5)); if (!view) return false; await handlers.editPanel?.(view); await handlers.answer?.(); return true; }
  if (action.startsWith('guide:')) { const view = buildGuide(action.slice(6)); if (!view) return false; await handlers.editPanel?.(view); await handlers.answer?.(); return true; }
  if (action.startsWith('command:') || Object.hasOwn(COMMANDS, action)) { const command = COMMANDS[action.startsWith('command:') ? action.slice(8) : action]; if (!command) return false; await handlers.runAdminCommand?.(command[0]); await handlers.answer?.(command[1]); return true; }
  if (action.startsWith('input:')) { const inputAction = action.slice(6); await handlers.startInput?.(inputAction); await handlers.answer?.('请发送用户 ID'); return true; }
  if (action === 'deleteuser') { const confirmed = await handlers.confirmDeleteInput?.(); await handlers.answer?.(confirmed ? '已删除用户' : '确认已过期，请重新输入 ID'); return true; }
  if (action.startsWith('confirm:')) { const view = buildConfirm(action.slice(8)); if (!view) return false; await handlers.editPanel?.(view); await handlers.answer?.(); return true; }
  const confirm = CONFIRMS[action.slice(4)]; if (!confirm) return false;
  await handlers.runAdminCommand?.(confirm[2]);
  await handlers.editPanel?.({ text: confirm[0] + '\n\n已提交执行请求，结果会以新消息发送。', reply_markup: { inline_keyboard: navigation(confirm[4]) } });
  await handlers.answer?.('已执行'); return true;
}
