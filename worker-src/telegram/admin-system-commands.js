export async function handleAdminSystemCommand(context = {}, handlers = {}) {
  const { trimmed } = context;

  if (trimmed === '/start' || trimmed === '/help') {
    const lines = [
      '管理员使用说明：',
      context.topicModeEnabled
        ? '1. 当前默认是话题模式：每个用户进入独立话题，直接在对应话题发消息即可回复。'
        : '1. 当前为普通回复链模式：建议回复“📩 新的用户消息”提示。',
      '2. 也可以使用命令：/reply 用户ID 内容；在话题内可用 /r 内容 快速回复。',
      '3. 若群里“直接发消息回复”无效，请在 @BotFather 里关闭该机器人隐私模式（/setprivacy -> Disable）。',
      '4. 黑名单：/ban 用户ID 原因、/unban 用户ID、/blacklist',
      '5. 白名单：/trust 用户ID 备注、/untrust 用户ID',
      '6. 重置验证：/restart 用户ID（或在话题 / 回复上下文中直接发送 /restart）',
      '7. 查询用户：/user 用户ID、/users 20',
      '8. 管理员授权：/adminadd 用户ID、/admindel 用户ID、/admins',
      '9. 关键词过滤：在系统配置里填写 KEYWORD_FILTERS，命中后会自动上报并封禁。',
      '10. 打开浏览器管理面板：/panel',
      '11. 重发当前临时密码：/panelpass',
      '12. 强制生成新的临时密码：/panelreset',
      '13. 手动放行验证：/verifypass 用户ID',
      '14. 清理历史数据：/cleanup （按保留期）或 /cleanup 天数',
      '15. 检测已注销账户并清理：/sweepdeleted',
      '16. 彻底删除用户（含历史消息）：/deleteuser 用户ID',
      '17. 设置欢迎内容：/setwelcome（下一条消息自动识别并回填）',
      '18. 取消欢迎设置：/cancelwelcome',
      '19. 召回用户快捷操作按钮：/actions 用户ID（话题内可直接 /actions）',
      '20. 同步 Telegram 斜杠菜单：/setcommands',
    ];
    await handlers.sendNotice(lines.join('\n'));
    return true;
  }

  if (/^\/(?:setcommands|synccommands|commands)\s*$/i.test(trimmed)) {
    const result = await handlers.syncCommands();
    const adminChats = Array.isArray(result.adminCommandChats) ? result.adminCommandChats : [];
    const adminTargets = Array.isArray(result.adminCommandTargets) ? result.adminCommandTargets : [];
    const failedScopes = Array.isArray(result.failedScopes) ? result.failedScopes : [];
    const lines = [
      'Telegram 斜杠菜单已同步。',
      `管理聊天：${adminChats.length ? adminChats.join(', ') : '未配置'}`,
      `管理员私聊：${adminTargets.length} 个`,
      failedScopes.length ? `失败 scope：${failedScopes.length} 个，可在面板或 /setCommands 返回中查看详情。` : '',
    ].filter(Boolean);
    await handlers.sendNotice(lines.join('\n'));
    return true;
  }

  if (/^\/(?:cancelwelcome|cancelsetwelcome|welcomecancel)\s*$/i.test(trimmed)) {
    await handlers.clearWelcomeSetup(context.pendingScope);
    await handlers.sendNotice('已取消欢迎内容设置。');
    return true;
  }

  const welcomeMatch = trimmed.match(/^\/(?:setwelcome|welcome|setupwelcome)(?:\s+(text|photo|video|animation|audio|voice|sticker|document|auto))?\s*$/i);
  if (welcomeMatch) {
    const requestedType = String(welcomeMatch[1] || 'auto').trim().toLowerCase();
    const normalizedType = requestedType === 'auto' ? 'auto' : handlers.normalizeWelcomeType(requestedType);
    await handlers.setWelcomeSetup(context.pendingScope, {
      requestedType: normalizedType,
      createdBy: context.operator,
      chatId: Number(context.chatId || 0) || null,
      threadId: Number(context.threadId || 0) || null,
    });
    const lines = [
      `欢迎设置已开启（模式：${normalizedType === 'auto' ? '自动识别' : normalizedType}）。`,
      '请发送下一条消息作为欢迎内容：',
      '1) 纯文本：自动更新 WELCOME_TEXT，并将类型设为 text',
      '2) 图片/视频/动图/音频/语音/贴纸/文件：自动提取 file_id 并更新 WELCOME_MEDIA 与类型',
      '3) 若媒体带 caption，会同时写入 WELCOME_TEXT',
      '可用 /cancelwelcome 取消本次设置。',
    ];
    await handlers.sendNotice(lines.join('\n'));
    return true;
  }

  if (/^\/(?:panel|openpanel|adminpanel|admin)\s*$/i.test(trimmed)) {
    const panelUrl = await handlers.resolvePanelUrl();
    await handlers.sendNotice(['浏览器管理面板入口：', panelUrl, '请在浏览器中打开以上地址，并使用管理员密码登录。'].join('\n'));
    return true;
  }

  if (/^\/(?:panelpass|panelpassword|adminpass)\s*$/i.test(trimmed)) {
    const result = await handlers.resendPanelPassword();
    await handlers.sendNotice(result.message);
    return true;
  }

  if (/^\/(?:panelreset|resetpanelpass|resetadminpass)\s*$/i.test(trimmed)) {
    const result = await handlers.resetPanelPassword();
    await handlers.sendNotice(result.message);
    return true;
  }

  return false;
}
