export const ADMIN_COMMAND_PANEL_CALLBACK_PREFIX = 'panel:';

const MENUS = Object.freeze({
  media: { title: '🖼 图床与浏览器面板', description: '上传图片，打开浏览器控制台并管理面板密码。', buttons: [[['🖼 上传图片', 'upload'], ['🌐 打开管理面板', 'command:open']], [['🔑 面板密码', 'menu:panel-access'], ['🚫 取消上传说明', 'guide:cancel-upload']]], back: 'home' },
  'panel-access': { title: '🔑 管理面板访问', description: '获取或重置浏览器管理面板的临时密码。', buttons: [[['📨 重发当前密码', 'command:panelpass'], ['♻️ 重置临时密码', 'confirm:panelreset']]], back: 'media' },
  messaging: { title: '💬 用户与消息', description: '直接回复、查询用户，或打开指定用户的快捷操作卡。', buttons: [[['💬 回复用户', 'input:reply'], ['👥 最近用户', 'command:users']], [['🔎 查询用户', 'input:user'], ['🎛 用户操作卡', 'input:actions']], [['🗨️ 话题回复说明', 'guide:topic-reply'], ['🔢 自定义列表数量', 'input:users']]], back: 'home' },
  users: { title: '👤 用户查询与验证', description: '兼容旧版入口；新操作已集中到“用户与消息”和“验证与风控”。', buttons: [[['🔎 查询用户', 'input:user'], ['🎛 用户操作卡', 'input:actions']], [['✅ 验证管理', 'menu:verification'], ['🛡 风控管理', 'menu:moderation']]], back: 'home' },
  risk: { title: '🛡 验证与风控', description: '集中管理验证方式、屏蔽规则、名单和用户数据。', buttons: [[['⚙️ 验证方式与参数', 'menu:verify-config'], ['🚧 关键词与封禁提示', 'menu:block-rules']], [['🔄 重置用户验证', 'input:restart'], ['✅ 人工通过验证', 'input:verifypass']], [['⛔ 黑名单列表', 'command:blacklist'], ['⭐ 信任用户列表', 'command:trustlist']], [['🚫 黑名单操作', 'menu:blacklist-actions'], ['⭐ 信任用户操作', 'menu:trust-actions']], [['🗑️ 彻底删除用户', 'input:deleteuser']]], back: 'home' },
  'verify-config': { title: '⚙️ 验证方式与参数', description: '这些设置与在线管理面板共用同一份运行配置，修改后下一次请求生效。', buttons: [[['📋 查看当前规则', 'command:config'], ['✅ 开启首次验证', 'command:verifyon']], [['⏸ 关闭首次验证', 'command:verifyoff']], [['🧩 图形行为验证', 'command:verifycaptcha'], ['🔢 数字选择验证', 'command:verifymath']], [['⏱ 验证有效期', 'input:verifyexpire'], ['🔁 最大失败次数', 'input:verifymaxfailures']], [['🧊 失败冷却', 'input:verifyfailblock'], ['⌛ 超时冷却', 'input:verifytimeoutblock']], [['👁 验证后观察消息', 'input:verifyobserve']]], back: 'risk' },
  'block-rules': { title: '🚧 关键词与封禁提示', description: '关键词命中后会阻断消息、通知管理员并自动封禁；信任用户不会触发关键词封禁。', buttons: [[['📋 查看关键词', 'command:keywordsview'], ['✏️ 设置关键词', 'input:keywords']], [['🧹 清空关键词', 'confirm:keywords-clear']], [['💬 查看封禁提示', 'command:blockedtextview'], ['✏️ 修改封禁提示', 'input:blockedtext']], [['♻️ 恢复默认提示', 'confirm:blockedtext-reset']]], back: 'risk' },
  verification: { title: '✅ 验证管理', description: '对指定用户重新发起验证或人工通过验证。', buttons: [[['🔄 重置验证', 'input:restart'], ['✅ 人工通过', 'input:verifypass']]], back: 'risk' },
  moderation: { title: '🛡 风控与用户数据', description: '兼容旧版入口；可管理黑名单、信任用户和永久删除。', buttons: [[['⛔ 黑名单列表', 'command:blacklist'], ['⭐ 信任用户列表', 'command:trustlist']], [['🚫 黑名单操作', 'menu:blacklist-actions'], ['⭐ 信任用户操作', 'menu:trust-actions']], [['🗑️ 删除用户', 'input:deleteuser']]], back: 'risk' },
  'blacklist-actions': { title: '🚫 黑名单操作', description: '选择操作后，按提示输入用户 ID 和封禁原因。', buttons: [[['⛔ 加入黑名单', 'input:ban'], ['✅ 解除黑名单', 'input:unban']], [['🔢 自定义列表数量', 'input:blacklist']]], back: 'risk' },
  'trust-actions': { title: '⭐ 信任用户操作', description: '选择操作后，按提示输入用户 ID 和备注。', buttons: [[['⭐ 设为信任', 'input:trust'], ['↩️ 移出信任', 'input:untrust']], [['🔢 自定义列表数量', 'input:trustlist']]], back: 'risk' },
  'admin-system': { title: '👮 管理员与系统', description: '管理运行模式、管理员权限、欢迎内容和 Telegram 命令菜单。', buttons: [[['⚙️ 运行模式', 'menu:runtime-config'], ['👮 管理员权限', 'menu:admin-access']], [['👮 管理员列表', 'command:admins'], ['👋 欢迎内容', 'menu:welcome']], [['🔄 同步命令菜单', 'command:commands'], ['🔢 自定义列表数量', 'input:admins']]], back: 'home' },
  'runtime-config': { title: '⚙️ 运行模式', description: '调整话题模式和管理员资料提示发送策略。', buttons: [[['📋 查看当前规则', 'command:config']], [['💬 开启话题模式', 'command:topicon'], ['📨 关闭话题模式', 'command:topicoff']], [['🆕 资料仅新话题', 'command:metanew'], ['🔁 资料每条发送', 'command:metaalways']], [['🔕 不发送资料提示', 'command:metaoff']]], back: 'admin-system' },
  'admin-access': { title: '👮 管理员权限', description: '根管理员或配置管理群的群主可授权和移除管理员。', buttons: [[['👮 查看管理员', 'command:admins'], ['➕ 授权管理员', 'input:adminadd']], [['➖ 移除管理员', 'input:admindel']]], back: 'admin-system' },
  welcome: { title: '👋 欢迎内容类型', description: '选择类型后发送下一条内容；贴纸与欢迎文案会分成两条消息发送。', buttons: [[['✨ 自动识别', 'command:setwelcome'], ['✏️ 纯文本模式', 'command:welcometext']], [['🖼 图片', 'command:welcomephoto'], ['🎬 视频', 'command:welcomevideo']], [['🎞 动图', 'command:welcomeanimation'], ['🎵 音频', 'command:welcomeaudio']], [['🎙 语音', 'command:welcomevoice'], ['🏷 贴纸', 'command:welcomesticker']], [['📄 文件', 'command:welcomedocument'], ['📝 仅修改欢迎文案', 'command:welcomecopy']], [['🚫 取消设置', 'command:cancelwelcome']]], back: 'admin-system' },
  maintenance: { title: '⚙️ 数据维护', description: '执行维护任务，或调整与在线面板一致的自动维护开关和批量。', buttons: [[['🧹 默认清理', 'confirm:cleanup'], ['🧽 默认巡检', 'confirm:sweepdeleted']], [['🗓 自定义保留天数', 'input:cleanup'], ['🔢 自定义巡检数量', 'input:sweepdeleted']], [['✅ 开启自动清理', 'command:cleanupautoon'], ['⏸ 关闭自动清理', 'command:cleanupautooff']], [['✅ 开启自动巡检', 'command:sweepautoon'], ['⏸ 关闭自动巡检', 'command:sweepautooff']], [['📦 清理批量', 'input:cleanupbatch'], ['📦 巡检批量', 'input:sweepbatch']], [['📖 参数说明', 'guide:maintenance-options']]], back: 'home' },
});

const COMMANDS = Object.freeze({
  open: ['/panel', '已发送管理面板入口'],
  users: ['/users 20', '已发送最近用户'],
  commands: ['/setcommands', '正在同步命令菜单'],
  blacklist: ['/blacklist', '已发送黑名单列表'],
  trustlist: ['/trustlist', '已发送信任用户列表'],
  admins: ['/admins', '已发送管理员列表'],
  panelpass: ['/panelpass', '已发送当前临时密码'],
  setwelcome: ['/setwelcome auto', '欢迎内容自动识别已开启'],
  welcometext: ['/setwelcome text', '请发送欢迎文本'],
  welcomephoto: ['/setwelcome photo', '请发送欢迎图片'],
  welcomevideo: ['/setwelcome video', '请发送欢迎视频'],
  welcomeanimation: ['/setwelcome animation', '请发送欢迎动图'],
  welcomeaudio: ['/setwelcome audio', '请发送欢迎音频'],
  welcomevoice: ['/setwelcome voice', '请发送欢迎语音'],
  welcomesticker: ['/setwelcome sticker', '请发送欢迎贴纸'],
  welcomedocument: ['/setwelcome document', '请发送欢迎文件'],
  welcomecopy: ['/setwelcometext', '请发送欢迎文案，媒体类型保持不变'],
  cancelwelcome: ['/cancelwelcome', '已取消欢迎内容设置'],
  config: ['/config', '已发送当前运行规则'],
  verifyon: ['/verification on', '首次验证已开启'],
  verifyoff: ['/verification off', '首次验证已关闭'],
  verifycaptcha: ['/verifyflow captcha', '已切换为图形行为验证'],
  verifymath: ['/verifyflow math', '已切换为数字选择验证'],
  keywordsview: ['/keywords', '已发送关键词规则'],
  blockedtextview: ['/blockedtext', '已发送当前封禁提示'],
  topicon: ['/topicmode on', '话题模式已开启'],
  topicoff: ['/topicmode off', '话题模式已关闭'],
  metanew: ['/metamode new-topic', '资料提示已设为仅新话题'],
  metaalways: ['/metamode always', '资料提示已设为每条发送'],
  metaoff: ['/metamode off', '资料提示已关闭'],
  cleanupautoon: ['/cleanupauto on', '自动清理已开启'],
  cleanupautooff: ['/cleanupauto off', '自动清理已关闭'],
  sweepautoon: ['/sweepauto on', '自动巡检已开启'],
  sweepautooff: ['/sweepauto off', '自动巡检已关闭'],
});

const CONFIRMS = Object.freeze({
  cleanup: ['🧹 确认清理历史数据', '此操作会按当前保留策略清理历史用户资料、验证状态、话题映射和消息记录。执行后部分数据无法恢复。', '/cleanup', '确认清理', 'maintenance'],
  sweepdeleted: ['🧽 确认巡检已注销账户', '此操作会检测已注销的 Telegram 账户，并清理命中的用户资料、关联状态和历史记录。', '/sweepdeleted', '确认巡检并清理', 'maintenance'],
  panelreset: ['🔑 确认重置面板临时密码', '重置后，当前浏览器管理面板临时密码将立即失效，并生成一组新密码。', '/panelreset', '确认重置密码', 'panel-access'],
  'keywords-clear': ['🧹 确认清空关键词规则', '清空后将不再自动检测和封禁命中关键词的用户。', '/clearkeywords', '确认清空关键词', 'block-rules'],
  'blockedtext-reset': ['♻️ 确认恢复默认封禁提示', '当前自定义封禁提示将被移除，并恢复系统默认文字。', '/resetblockedtext', '确认恢复默认', 'block-rules'],
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
  adminadd: ['➕ 授权管理员', ['根管理员或配置管理群的群主可执行。', '请发送：/adminadd 用户ID 备注'], 'admin-access'],
  admindel: ['➖ 移除管理员', ['根管理员或配置管理群的群主可执行。', '请发送：/admindel 用户ID'], 'admin-access'],
  'cancel-upload': ['🚫 取消图床上传', ['在图片接收状态下发送：/cancel', '取消仅影响当前管理员、当前聊天和当前话题。'], 'media'],
  'maintenance-options': ['⚙️ 维护命令参数', ['/cleanup：按默认保留策略清理历史数据。', '/cleanup 天数：自定义保留天数，例如 /cleanup 30。', '/sweepdeleted：巡检并清理已注销账户。', '/sweepdeleted 数量：自定义单批巡检数量，例如 /sweepdeleted 100。'], 'maintenance'],
});

const INPUT_ACTIONS = new Set([
  'reply', 'user', 'actions', 'restart', 'verifypass', 'ban', 'unban', 'trust', 'untrust',
  'deleteuser', 'adminadd', 'admindel', 'users', 'blacklist', 'trustlist', 'admins', 'cleanup',
  'sweepdeleted', 'keywords', 'blockedtext', 'verifyexpire', 'verifyfailblock',
  'verifytimeoutblock', 'verifymaxfailures', 'verifyobserve', 'cleanupbatch', 'sweepbatch',
]);

function button(text, action) { return { text, callback_data: ADMIN_COMMAND_PANEL_CALLBACK_PREFIX + action }; }
function navigation(back) { const backButton = back === 'home' ? button('⬅️ 返回首页', 'home') : button('⬅️ 返回上级', 'menu:' + back); return [[backButton, button('🏠 首页', 'home')], [button('✖️ 关闭', 'close')]]; }

export function buildAdminCommandPanelText() { return ['🛠 管理员控制面板', '', '常用操作已集中为 5 个入口；需要参数的功能会逐步引导输入，无需手写完整命令。', '危险操作仍需二次确认，所有输入状态可发送 /cancel 取消。'].join('\n'); }
export function buildAdminCommandPanelKeyboard() { return buildHierarchicalAdminCommandPanelKeyboard(); }
export function buildHierarchicalAdminCommandPanelKeyboard() { return { inline_keyboard: [[button('💬 用户与消息', 'menu:messaging'), button('🛡 验证与风控', 'menu:risk')], [button('🖼 图床与面板', 'menu:media'), button('👮 管理员与系统', 'menu:admin-system')], [button('⚙️ 数据维护', 'menu:maintenance'), button('📚 命令总览', 'help')], [button('✖️ 关闭', 'close')]] }; }

function actionOf(data) { const value = String(data || '').trim(); return value.startsWith(ADMIN_COMMAND_PANEL_CALLBACK_PREFIX) ? value.slice(ADMIN_COMMAND_PANEL_CALLBACK_PREFIX.length) : ''; }
export function isAdminCommandPanelCallback(data) { const action = actionOf(data); if (['home', 'upload', 'help', 'close', 'deleteuser'].includes(action) || Object.hasOwn(COMMANDS, action)) return true; if (action.startsWith('menu:')) return Object.hasOwn(MENUS, action.slice(5)); if (action.startsWith('guide:')) return Object.hasOwn(GUIDES, action.slice(6)); if (action.startsWith('input:')) return INPUT_ACTIONS.has(action.slice(6)); if (action.startsWith('command:')) return Object.hasOwn(COMMANDS, action.slice(8)); if (action.startsWith('confirm:') || action.startsWith('run:')) return Object.hasOwn(CONFIRMS, action.slice(action.indexOf(':') + 1)); return false; }

function buildMenu(menuId) { const menu = MENUS[menuId]; if (!menu) return null; return { text: menu.title + '\n\n' + menu.description, reply_markup: { inline_keyboard: [...menu.buttons.map((row) => row.map(([text, action]) => button(text, action))), ...navigation(menu.back)] } }; }
function buildGuide(guideId) { const guide = GUIDES[guideId]; if (!guide) return null; const input = INPUT_ACTIONS.has(guideId) ? [[button('⌨️ 开始引导输入', 'input:' + guideId)]] : []; return { text: guide[0] + '\n\n' + guide[1].join('\n'), reply_markup: { inline_keyboard: [...input, ...navigation(guide[2])] } }; }
function buildConfirm(confirmId) { const confirm = CONFIRMS[confirmId]; if (!confirm) return null; return { text: confirm[0] + '\n\n' + confirm[1] + '\n\n确认后将立即执行。', reply_markup: { inline_keyboard: [[button('⚠️ ' + confirm[3], 'run:' + confirmId)], ...navigation(confirm[4])] } }; }
function buildHelpText() { return ['📚 管理员命令总览', '', '图床与面板：/upload、/cancel、/panel、/panelpass、/panelreset', '用户与消息：/reply 用户ID 内容、/r 内容、/users [数量]、/user [用户ID]、/actions [用户ID]', '验证与风控：/restart、/verifypass、/verification、/verifyflow、/config', '屏蔽规则：/keywords、/setkeywords、/blockedtext、/setblockedtext、/ban、/unban、/blacklist、/trust、/untrust、/trustlist', '管理员与系统：/admins、/adminadd、/admindel、/setwelcome、/setwelcometext、/cancelwelcome、/setcommands', '数据维护：/cleanup [保留天数]、/sweepdeleted [批量数量]、/deleteuser [用户ID]', '', '提示：面板按钮已支持分步输入；在用户话题或回复上下文中，带 [用户ID] 的命令通常可省略该参数。'].join('\n'); }

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
  if (action.startsWith('input:')) { const inputAction = action.slice(6); await handlers.startInput?.(inputAction); await handlers.answer?.('请按新消息中的提示输入'); return true; }
  if (action === 'deleteuser') { const confirmed = await handlers.confirmDeleteInput?.(); await handlers.answer?.(confirmed ? '已删除用户' : '确认已过期，请重新输入 ID'); return true; }
  if (action.startsWith('confirm:')) { const view = buildConfirm(action.slice(8)); if (!view) return false; await handlers.editPanel?.(view); await handlers.answer?.(); return true; }
  const confirm = CONFIRMS[action.slice(4)]; if (!confirm) return false;
  await handlers.runAdminCommand?.(confirm[2]);
  await handlers.editPanel?.({ text: confirm[0] + '\n\n已提交执行请求，结果会以新消息发送。', reply_markup: { inline_keyboard: navigation(confirm[4]) } });
  await handlers.answer?.('已执行'); return true;
}
