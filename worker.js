const DEFAULT_WELCOME = [
  '你好，欢迎使用私聊中转机器人。',
  '直接给我发送消息，我会转发给管理员；管理员回复后，我会继续把消息转发给你。',
].join('\n');

const DEFAULT_BLOCKED_TEXT = '你已被管理员限制联系，如有需要请稍后再试。';
const ADMIN_PANEL_PATH = '/admin';
const ADMIN_API_PREFIX = '/admin/api';
const MAX_LIST_LIMIT = 100;
const MAX_SCAN_KEYS = 500;
const VERIFY_EXPIRE_MS = 15 * 60 * 1000;
const VERIFY_FAIL_BLOCK_MS = 60 * 1000;
const VERIFY_TIMEOUT_BLOCK_MS = 60 * 1000;
const VERIFY_MAX_FAILURES = 2;
const SYSTEM_CONFIG_KEY = 'sys:config';
const ADMIN_SESSION_PREFIX = 'admin:session:';
const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;
const ADMIN_BOOTSTRAP_TTL_MS = 1 * 60 * 60 * 1000;
const PROFILE_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_ADMIN_PANEL_EXTERNAL_URL = '';
const LAST_WEBHOOK_ERROR_KEY = 'sys:last_webhook_error';
const VERIFY_IMAGE_PATH = '/verify-image';

export default {
  async fetch(request, env) {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(request),
        });
      }

      const url = new URL(request.url);
      const runtimeEnv = await getRuntimeEnv(env);
      const webhookPath = normalizeWebhookPath(runtimeEnv.WEBHOOK_PATH);
      const publicBaseUrl = getPublicBaseUrl(url, runtimeEnv);

      if (request.method === 'GET' && url.pathname === '/') {
        return json(await getAdminStatus(url, runtimeEnv, webhookPath, publicBaseUrl), 200, {}, request);
      }

      if (request.method === 'GET' && url.pathname === '/health') {
        return json({ ok: true, now: new Date().toISOString() }, 200, {}, request);
      }

      if (request.method === 'GET' && url.pathname === VERIFY_IMAGE_PATH) {
        return serveVerificationImage(url, request);
      }

      if (request.method === 'POST' && url.pathname === '/deploy/bootstrap') {
        return await handleDeployBootstrap(request, runtimeEnv, webhookPath, publicBaseUrl);
      }

      if (request.method === 'GET' && url.pathname === ADMIN_PANEL_PATH) {
        const panelUrl = buildAdminPanelUrl(runtimeEnv, publicBaseUrl);
        if (isAbsoluteHttpUrl(panelUrl)) {
          return Response.redirect(panelUrl, 302);
        }
        return html(renderAdminPage(url, runtimeEnv, webhookPath, publicBaseUrl), 200, request);
      }

      if (request.method === 'GET' && url.pathname === `${ADMIN_API_PREFIX}/auth/me`) {
        return await handleAdminAuthMe(request, runtimeEnv);
      }

      if (request.method === 'POST' && url.pathname === '/admin/login') {
        return await handleAdminLogin(request, runtimeEnv);
      }

      if (request.method === 'POST' && url.pathname === '/admin/logout') {
        await requireHttpAdmin(request, runtimeEnv);
        return await handleAdminLogout(request, runtimeEnv);
      }

      if (request.method === 'POST' && url.pathname === `${ADMIN_API_PREFIX}/auth/change-password`) {
        await requireHttpAdmin(request, runtimeEnv);
        return await handleAdminChangePassword(request, runtimeEnv);
      }

      if (request.method === 'GET' && url.pathname === `${ADMIN_API_PREFIX}/status`) {
        await requireHttpAdmin(request, runtimeEnv);
        return json(await getAdminStatus(url, runtimeEnv, webhookPath, publicBaseUrl), 200, {}, request);
      }

      if (request.method === 'GET' && url.pathname === `${ADMIN_API_PREFIX}/system-config`) {
        await requireHttpAdmin(request, runtimeEnv);
        return json({ ok: true, config: buildSystemConfigView(await getEffectiveSystemConfig(runtimeEnv)) }, 200, {}, request);
      }

      if (request.method === 'POST' && url.pathname === `${ADMIN_API_PREFIX}/system-config`) {
        await requireHttpAdmin(request, runtimeEnv);
        const body = await readJsonBody(request);
        await updateSystemConfig(runtimeEnv, body);
        return json({ ok: true, config: buildSystemConfigView(await getEffectiveSystemConfig(runtimeEnv)) }, 200, {}, request);
      }

      if (request.method === 'GET' && url.pathname === `${ADMIN_API_PREFIX}/users`) {
        await requireHttpAdmin(request, runtimeEnv);
        return json(
          { ok: true, users: await listUsers(runtimeEnv, parseLimit(url.searchParams.get('limit'), 50)) },
          200,
          {},
          request,
        );
      }

      if (request.method === 'GET' && url.pathname === `${ADMIN_API_PREFIX}/history`) {
        await requireHttpAdmin(request, runtimeEnv);
        const userIdRaw = url.searchParams.get('userId');
        const limit = parseLimit(url.searchParams.get('limit'), 50);
        const userId = userIdRaw ? toChatId(userIdRaw) : null;
        return json(
          {
            ok: true,
            items: await listMessageHistory(runtimeEnv, {
              userId,
              limit,
            }),
          },
          200,
          {},
          request,
        );
      }

      if (request.method === 'GET' && url.pathname === `${ADMIN_API_PREFIX}/avatar`) {
        await requireHttpAdmin(request, runtimeEnv);
        return await handleTelegramAvatarProxy(request, runtimeEnv);
      }

      if (request.method === 'POST' && url.pathname === `${ADMIN_API_PREFIX}/users/action`) {
        await requireHttpAdmin(request, runtimeEnv);
        const body = await readJsonBody(request);
        const action = String(body.action || '').trim().toLowerCase();
        const userId = toChatId(body.userId);
        const operator = getHttpAdminOperator(request);

        if (action === 'ban') {
          const entry = await setBlacklistEntry(runtimeEnv, userId, {
            reason: String(body.reason || '通过用户管理封禁').trim() || '通过用户管理封禁',
            createdAt: new Date().toISOString(),
            createdBy: operator,
          });
          return json({ ok: true, action, entry }, 200, {}, request);
        }

        if (action === 'unban') {
          await deleteBlacklistEntry(runtimeEnv, userId);
          return json({ ok: true, action, userId }, 200, {}, request);
        }

        if (action === 'trust') {
          const entry = await setTrustEntry(runtimeEnv, userId, {
            note: String(body.note || '通过用户管理设为信任用户').trim() || '通过用户管理设为信任用户',
            createdAt: new Date().toISOString(),
            createdBy: operator,
          });
          return json({ ok: true, action, entry }, 200, {}, request);
        }

        if (action === 'untrust') {
          await deleteTrustEntry(runtimeEnv, userId);
          return json({ ok: true, action, userId }, 200, {}, request);
        }

        if (action === 'restart') {
          const state = await restartUserVerification(runtimeEnv, userId, operator);
          return json({ ok: true, action, state }, 200, {}, request);
        }

        throw new AppError(400, 'action 必须是 ban / unban / trust / untrust / restart');
      }

      if (request.method === 'GET' && url.pathname === `${ADMIN_API_PREFIX}/blacklist`) {
        await requireHttpAdmin(request, runtimeEnv);
        return json(
          { ok: true, blacklist: await listBlacklist(runtimeEnv, parseLimit(url.searchParams.get('limit'), 50)) },
          200,
          {},
          request,
        );
      }

      if (request.method === 'GET' && url.pathname === `${ADMIN_API_PREFIX}/trust`) {
        await requireHttpAdmin(request, runtimeEnv);
        return json(
          { ok: true, trust: await listTrust(runtimeEnv, parseLimit(url.searchParams.get('limit'), 50)) },
          200,
          {},
          request,
        );
      }

      if (request.method === 'GET' && url.pathname === `${ADMIN_API_PREFIX}/admins`) {
        await requireHttpAdmin(request, runtimeEnv);
        return json(
          { ok: true, admins: await listAuthorizedAdmins(runtimeEnv, parseLimit(url.searchParams.get('limit'), 50)) },
          200,
          {},
          request,
        );
      }

      if (request.method === 'POST' && url.pathname === `${ADMIN_API_PREFIX}/reply`) {
        await requireHttpAdmin(request, runtimeEnv);
        ensureEnv(runtimeEnv, ['BOT_TOKEN']);
        const body = await readJsonBody(request);
        const userId = toChatId(body.userId);
        const text = String(body.text || '').trim();
        if (!text) {
          throw new AppError(400, 'text 不能为空');
        }

        const result = await telegram(runtimeEnv, 'sendMessage', {
          chat_id: userId,
          text,
        });

        return json({ ok: true, result }, 200, {}, request);
      }

      if (request.method === 'POST' && url.pathname === `${ADMIN_API_PREFIX}/blacklist`) {
        await requireHttpAdmin(request, runtimeEnv);
        const body = await readJsonBody(request);
        const action = String(body.action || '').trim().toLowerCase();
        const userId = toChatId(body.userId);
        const operator = getHttpAdminOperator(request);

        if (action === 'add') {
          const entry = await setBlacklistEntry(runtimeEnv, userId, {
            reason: String(body.reason || '通过管理面板封禁').trim() || '通过管理面板封禁',
            createdAt: new Date().toISOString(),
            createdBy: operator,
          });
          return json({ ok: true, action, entry }, 200, {}, request);
        }

        if (action === 'remove') {
          await deleteBlacklistEntry(runtimeEnv, userId);
          return json({ ok: true, action, userId }, 200, {}, request);
        }

        throw new AppError(400, 'action 必须是 add 或 remove');
      }

      if (request.method === 'POST' && url.pathname === `${ADMIN_API_PREFIX}/trust`) {
        await requireHttpAdmin(request, runtimeEnv);
        const body = await readJsonBody(request);
        const action = String(body.action || '').trim().toLowerCase();
        const userId = toChatId(body.userId);
        const operator = getHttpAdminOperator(request);

        if (action === 'add') {
          const entry = await setTrustEntry(runtimeEnv, userId, {
            note: String(body.note || '通过白名单面板设为信任用户').trim() || '通过白名单面板设为信任用户',
            createdAt: new Date().toISOString(),
            createdBy: operator,
          });
          return json({ ok: true, action, entry }, 200, {}, request);
        }

        if (action === 'remove') {
          await deleteTrustEntry(runtimeEnv, userId);
          return json({ ok: true, action, userId }, 200, {}, request);
        }

        throw new AppError(400, 'action 必须是 add 或 remove');
      }

      if (request.method === 'POST' && url.pathname === `${ADMIN_API_PREFIX}/admins`) {
        await requireHttpAdmin(request, runtimeEnv);
        const body = await readJsonBody(request);
        const action = String(body.action || '').trim().toLowerCase();
        const userId = toChatId(body.userId);
        const operator = getHttpAdminOperator(request);

        if (action === 'add') {
          const entry = await setAuthorizedAdmin(runtimeEnv, userId, {
            note: String(body.note || '').trim() || null,
            createdAt: new Date().toISOString(),
            createdBy: operator,
          });
          return json({ ok: true, action, entry }, 200, {}, request);
        }

        if (action === 'remove') {
          await deleteAuthorizedAdmin(runtimeEnv, userId);
          return json({ ok: true, action, userId }, 200, {}, request);
        }

        throw new AppError(400, 'action 必须是 add 或 remove');
      }

      if (request.method === 'GET' && url.pathname === '/setWebhook') {
        await requireHttpAdmin(request, runtimeEnv);
        ensureEnv(runtimeEnv, ['BOT_TOKEN']);
        const webhookUrl = `${publicBaseUrl}${webhookPath}`;
        const payload = { url: webhookUrl };
        if (runtimeEnv.WEBHOOK_SECRET) payload.secret_token = runtimeEnv.WEBHOOK_SECRET;
        const result = await telegram(runtimeEnv, 'setWebhook', payload);
        return json({ ok: true, webhookUrl, telegram: result }, 200, {}, request);
      }

      if (request.method === 'GET' && url.pathname === '/deleteWebhook') {
        await requireHttpAdmin(request, runtimeEnv);
        ensureEnv(runtimeEnv, ['BOT_TOKEN']);
        const result = await telegram(runtimeEnv, 'deleteWebhook', { drop_pending_updates: false });
        return json({ ok: true, telegram: result }, 200, {}, request);
      }

      if (request.method === 'GET' && url.pathname === '/getWebhookInfo') {
        await requireHttpAdmin(request, runtimeEnv);
        ensureEnv(runtimeEnv, ['BOT_TOKEN']);
        const result = await telegram(runtimeEnv, 'getWebhookInfo', {});
        return json({ ok: true, telegram: result }, 200, {}, request);
      }

      if (request.method === 'GET' && url.pathname === '/setCommands') {
        await requireHttpAdmin(request, runtimeEnv);
        ensureEnv(runtimeEnv, ['BOT_TOKEN']);
        const result = await syncTelegramCommands(runtimeEnv);
        return json({ ok: true, ...result }, 200, {}, request);
      }

      if (request.method === 'POST' && url.pathname === webhookPath) {
        ensureEnv(runtimeEnv, ['BOT_TOKEN', 'ADMIN_CHAT_ID']);
        if (runtimeEnv.WEBHOOK_SECRET) {
          const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
          if (secret !== runtimeEnv.WEBHOOK_SECRET) {
            return new Response('Forbidden', { status: 403 });
          }
        }

        const update = await request.json();
        try {
          await handleUpdate(update, runtimeEnv, publicBaseUrl);
        } catch (error) {
          await recordWebhookError(runtimeEnv, error, update);
          await notifyWebhookError(runtimeEnv, error, update);
        }
        return new Response('ok', { headers: corsHeaders(request) });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders(request) });
    } catch (error) {
      const status = error instanceof AppError ? error.status : 500;
      return json(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        status,
        {},
        request,
      );
    }
  },
};

class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function handleUpdate(update, env, publicBaseUrl = '') {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env, publicBaseUrl);
    return;
  }

  const message = update.message || update.edited_message;
  if (!message || !message.chat) return;

  const adminChatId = toChatId(env.ADMIN_CHAT_ID);
  const senderId = message.from?.id ? Number(message.from.id) : null;
  const authorizedAdmin = senderId ? await isAuthorizedAdmin(env, senderId) : false;
  const isAdminChat = Number(message.chat.id) === adminChatId;

  if (authorizedAdmin || isAdminChat) {
    await handleAdminMessage(message, env, adminChatId, authorizedAdmin, publicBaseUrl);
    return;
  }

  if (message.chat.type !== 'private') {
    return;
  }

  if (isTopicModeEnabled(env) || isUserVerificationEnabled(env)) {
    ensureKv(env);
  }

  await upsertUserProfile(env, message);

  const blacklistEntry = await getBlacklistEntry(env, message.chat.id);
  if (blacklistEntry) {
    await telegram(env, 'sendMessage', {
      chat_id: message.chat.id,
      text: env.BLOCKED_TEXT || DEFAULT_BLOCKED_TEXT,
    });
    return;
  }

  if (isUserPrivateCommand(message)) {
    await handleUserPrivateCommand(message, env, publicBaseUrl);
    return;
  }

  const trustEntry = await getTrustEntry(env, message.chat.id);
  const keywordHit = trustEntry ? null : matchKeywordFilter(env, message);
  if (keywordHit) {
    const entry = await setBlacklistEntry(env, message.chat.id, {
      reason: `命中关键词过滤：${keywordHit}`,
      createdAt: new Date().toISOString(),
      createdBy: 'keyword-filter',
    });

    await reportKeywordBan(env, adminChatId, message, keywordHit, entry);
    await telegram(env, 'sendMessage', {
      chat_id: message.chat.id,
      text: env.BLOCKED_TEXT || DEFAULT_BLOCKED_TEXT,
    });
    return;
  }

  const verified = await ensureUserVerifiedOrPrompt(message, env, publicBaseUrl);
  if (!verified) {
    return;
  }

  await handleUserMessage(message, env, adminChatId);
}

async function handleCallbackQuery(callbackQuery, env, publicBaseUrl = '') {
  const data = String(callbackQuery.data || '');
  if (!data) {
    await answerCallback(env, callbackQuery.id, '未识别的操作');
    return;
  }

  if (data.startsWith('verify:')) {
    await handleUserVerificationCallback(callbackQuery, env, publicBaseUrl);
    return;
  }

  if (data.startsWith('adm:')) {
    await handleAdminActionCallback(callbackQuery, env);
    return;
  }

  await answerCallback(env, callbackQuery.id, '未识别的操作');
}

async function handleUserMessage(message, env, adminChatId) {
  const sender = message.from || {};
  const topicModeEnabled = isTopicModeEnabled(env);
  const profileLine = formatUserProfile(sender, message.chat);
  let topicRecord = null;
  let topicError = '';
  if (topicModeEnabled) {
    try {
      topicRecord = await ensureUserTopic(env, message, adminChatId);
    } catch (error) {
      topicError = formatErrorMessage(error);
    }
  }
  const messageThreadId = topicRecord?.threadId;
  const topicModeActive = Boolean(messageThreadId);
  const metaText = [
    '📩 新的用户消息',
    `#UID:${message.chat.id}`,
    profileLine,
    topicModeActive
      ? '当前默认已启用话题模式：请在该用户专属话题中直接回复，也可使用下方按钮操作。'
      : topicModeEnabled && topicError
        ? `话题模式创建失败，已自动退回普通回复链模式。\n错误：${topicError}`
      : '当前为普通回复链模式：回复这条提示消息，或使用 /reply 用户ID 内容，即可回消息。',
    '建议使用按钮查看资料、拉黑/解封，降低回复错人的风险。',
  ]
    .filter(Boolean)
    .join('\n');

  let forwarded;
  try {
    forwarded = await telegramWithThreadFallback(env, 'forwardMessage', {
      chat_id: adminChatId,
      from_chat_id: message.chat.id,
      message_id: message.message_id,
      message_thread_id: messageThreadId || undefined,
    });
  } catch (error) {
    try {
      forwarded = await telegramWithThreadFallback(env, 'sendMessage', {
        chat_id: adminChatId,
        text: buildFallbackText(message, sender),
        message_thread_id: messageThreadId || undefined,
      });
    } catch (fallbackError) {
      await notifyUserAdminDeliveryFailed(env, message, fallbackError);
      await saveMessageHistory(env, {
        userId: Number(message.chat.id),
        chatType: message.chat?.type || 'private',
        topicId: messageThreadId || null,
        telegramMessageId: Number(message.message_id) || null,
        direction: 'user_to_admin',
        senderRole: 'user',
        messageType: detectMessageType(message),
        textContent: extractMessageText(message),
        mediaFileId: extractPrimaryMediaFileId(message),
        rawPayload: message,
      });
      return;
    }
  }

  try {
    await telegramWithThreadFallback(env, 'sendMessage', {
      chat_id: adminChatId,
      text: metaText,
      message_thread_id: messageThreadId || undefined,
      reply_to_message_id: forwarded.message_id,
      reply_markup: buildAdminActionKeyboard(message.chat.id),
    });
  } catch (error) {
    try {
      await telegram(env, 'sendMessage', {
        chat_id: adminChatId,
        text: `${metaText}\n\n提示：元信息消息降级发送，原错误：${trimText(formatErrorMessage(error), 300)}`,
        reply_markup: buildAdminActionKeyboard(message.chat.id),
      });
    } catch (fallbackError) {
      await notifyUserAdminDeliveryFailed(env, message, fallbackError);
      return;
    }
  }

  if (typeof message.text === 'string' && message.text.startsWith('/start')) {
    await telegram(env, 'sendMessage', {
      chat_id: message.chat.id,
      text: env.WELCOME_TEXT || DEFAULT_WELCOME,
    });
  }

  await saveMessageHistory(env, {
    userId: Number(message.chat.id),
    chatType: message.chat?.type || 'private',
    topicId: messageThreadId || null,
    telegramMessageId: Number(message.message_id) || null,
    direction: 'user_to_admin',
    senderRole: 'user',
    messageType: detectMessageType(message),
    textContent: extractMessageText(message),
    mediaFileId: extractPrimaryMediaFileId(message),
    rawPayload: message,
  });
}

async function handleAdminMessage(message, env, adminChatId, preAuthorized = false, publicBaseUrl = '') {
  const senderId = message.from?.id ? Number(message.from.id) : null;
  const chatId = Number(message.chat.id);
  let authorized = preAuthorized || (senderId ? await isAuthorizedAdmin(env, senderId) : false);

  // 兼容“匿名管理员”发言（sender_chat = 当前管理员群）。
  if (!authorized && isAnonymousAdminMessage(message, adminChatId)) {
    authorized = true;
  }

  // 兼容多管理员群场景：如果消息来自管理员群，允许“群管理员身份”直接回复。
  // 这样即便没写入 ADMIN_IDS/KV 授权，也能在群里处理会话（尤其是新增协作人员时）。
  if (!authorized && senderId && chatId === adminChatId && message.chat.type !== 'private') {
    authorized = await isTelegramGroupAdmin(env, adminChatId, senderId);
  }

  if (!authorized) {
    return;
  }

  if (senderId) {
    await syncTelegramProfile(env, senderId, {
      user: message.from || {},
      adminChatId,
    });
  }

  if (message.chat.type !== 'private' && chatId !== adminChatId) {
    return;
  }

  if (isIgnoredAdminServiceMessage(message)) {
    return;
  }

  const defaultTargetUserId = await resolveAdminTargetUserId(message, env, adminChatId);
  const handled = await handleAdminCommand(message, env, defaultTargetUserId, publicBaseUrl);
  if (handled) {
    return;
  }

  const parsedCommand = parseReplyCommand(message.text);

  if (parsedCommand) {
    const text = parsedCommand.text?.trim();
    if (!text) {
      await sendAdminNotice(env, message, '命令格式错误，请使用：/reply 用户ID 内容，或在话题内使用：/r 内容');
      return;
    }

    const targetUserId = parsedCommand.userId || defaultTargetUserId;
    if (!targetUserId) {
      await sendAdminNotice(
        env,
        message,
        '未识别到目标用户。请使用：/reply 用户ID 内容，或在对应用户话题内发送：/r 内容（也可直接回复用户提示消息）。',
      );
      return;
    }

    try {
      await telegram(env, 'sendMessage', {
        chat_id: targetUserId,
        text,
      });
    } catch (error) {
      await sendAdminNotice(env, message, `发送给用户失败：${trimText(formatErrorMessage(error), 500)}`);
      return;
    }

    await saveMessageHistory(env, {
      userId: Number(targetUserId),
      chatType: 'private',
      topicId: message.message_thread_id || null,
      telegramMessageId: Number(message.message_id) || null,
      direction: 'admin_to_user',
      senderRole: 'admin',
      messageType: 'text',
      textContent: text,
      mediaFileId: null,
      rawPayload: message,
    });
    return;
  }

  if (!defaultTargetUserId) {
    if (chatId === adminChatId && message.chat.type !== 'private') {
      await sendAdminNotice(
        env,
        message,
        '未识别到目标用户。请在对应用户话题内直接回复，或回复带 #UID 的提示消息，或使用 /reply 用户ID 内容。',
      );
    }
    return;
  }

  try {
    await relayAdminMessageToUser(message, env, defaultTargetUserId);
  } catch (error) {
    await sendAdminNotice(env, message, `发送给用户失败：${trimText(formatErrorMessage(error), 500)}`);
    return;
  }

  await saveMessageHistory(env, {
    userId: Number(defaultTargetUserId),
    chatType: 'private',
    topicId: message.message_thread_id || null,
    telegramMessageId: Number(message.message_id) || null,
    direction: 'admin_to_user',
    senderRole: 'admin',
    messageType: detectMessageType(message),
    textContent: extractMessageText(message),
    mediaFileId: extractPrimaryMediaFileId(message),
    rawPayload: message,
  });
}

async function handleAdminCommand(message, env, defaultTargetUserId, publicBaseUrl = '') {
  if (typeof message.text !== 'string') return false;

  const trimmed = message.text.trim();
  const senderId = message.from?.id ? Number(message.from.id) : null;
  const rootAdmin = senderId ? isRootAdmin(env, senderId) : false;

  if (trimmed === '/start' || trimmed === '/help') {
    await sendAdminNotice(
      env,
      message,
      [
        '管理员使用说明：',
        isTopicModeEnabled(env)
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
      ].join('\n'),
    );
    return true;
  }

  if (/^\/(?:panel|openpanel|adminpanel|admin)\s*$/i.test(trimmed)) {
    const panelUrl = await resolveAdminPanelUrl(env, publicBaseUrl);
    await sendAdminNotice(
      env,
      message,
      [
        '浏览器管理面板入口：',
        panelUrl,
        '请在浏览器中打开以上地址，并使用管理员密码登录。',
      ].join('\n'),
    );
    return true;
  }

  if (/^\/(?:panelpass|panelpassword|adminpass)\s*$/i.test(trimmed)) {
    const result = await resendBootstrapPassword(env);
    await sendAdminNotice(env, message, result.message);
    return true;
  }

  if (/^\/(?:panelreset|resetpanelpass|resetadminpass)\s*$/i.test(trimmed)) {
    const result = await resetBootstrapPassword(env);
    await sendAdminNotice(env, message, result.message);
    return true;
  }

  const adminAddMatch = trimmed.match(/^\/(?:adminadd|grantadmin|authadmin)\s+(\-?\d+)(?:\s+([\s\S]+))?$/i);
  if (adminAddMatch) {
    if (!rootAdmin) {
      await sendAdminNotice(env, message, '只有根管理员才可以授权新的管理员。');
      return true;
    }

    const userId = Number(adminAddMatch[1]);
    const note = (adminAddMatch[2] || '').trim() || null;
    const entry = await setAuthorizedAdmin(env, userId, {
      note,
      createdAt: new Date().toISOString(),
      createdBy: formatAdminOperator(message.from),
    });
    await sendAdminNotice(env, message, `已授权管理员：${userId}${entry.note ? `\n备注：${entry.note}` : ''}`);
    return true;
  }

  const adminRemoveMatch = trimmed.match(/^\/(?:admindel|revokeadmin|deauthadmin)\s+(\-?\d+)\s*$/i);
  if (adminRemoveMatch) {
    if (!rootAdmin) {
      await sendAdminNotice(env, message, '只有根管理员才可以移除管理员授权。');
      return true;
    }

    const userId = Number(adminRemoveMatch[1]);
    await deleteAuthorizedAdmin(env, userId);
    await sendAdminNotice(env, message, `已移除管理员授权：${userId}`);
    return true;
  }

  const adminsMatch = trimmed.match(/^\/admins(?:\s+(\d+))?\s*$/i);
  if (adminsMatch) {
    const limit = parseLimit(adminsMatch[1], 20);
    const admins = await listAuthorizedAdmins(env, limit);
    if (admins.length === 0) {
      await sendAdminNotice(env, message, '当前没有可用管理员。');
      return true;
    }

    const text = [
      `已授权管理员（最多 ${admins.length} 条）：`,
      ...admins.map((item) => {
        const suffix = [item.source, item.note].filter(Boolean).join(' | ');
        return `- ${item.userId}${suffix ? ` | ${suffix}` : ''}`;
      }),
    ].join('\n');

    await sendAdminNotice(env, message, text);
    return true;
  }

  const trustMatch = trimmed.match(/^\/(?:trust|whitelist)\s*(\-?\d+)?(?:\s+([\s\S]+))?$/i);
  if (trustMatch) {
    const userId = trustMatch[1] ? Number(trustMatch[1]) : defaultTargetUserId;
    const note = (trustMatch[2] || '').trim() || '管理员加入白名单';
    if (!userId) {
      await sendAdminNotice(env, message, '请使用 /trust 用户ID 备注，或在回复/话题上下文中直接发送 /trust');
      return true;
    }

    const entry = await setTrustEntry(env, userId, {
      note,
      createdAt: new Date().toISOString(),
      createdBy: formatAdminOperator(message.from),
    });
    await sendAdminNotice(env, message, `已设为信任用户：${userId}${entry.note ? `\n备注：${entry.note}` : ''}`);
    return true;
  }

  const untrustMatch = trimmed.match(/^\/(?:untrust|unwhitelist)\s*(\-?\d+)?\s*$/i);
  if (untrustMatch) {
    const userId = untrustMatch[1] ? Number(untrustMatch[1]) : defaultTargetUserId;
    if (!userId) {
      await sendAdminNotice(env, message, '请使用 /untrust 用户ID，或在回复/话题上下文中直接发送 /untrust');
      return true;
    }

    await deleteTrustEntry(env, userId);
    await sendAdminNotice(env, message, `已移出信任用户：${userId}`);
    return true;
  }

  const restartMatch = trimmed.match(/^\/(?:restart|reverify)\s*(\-?\d+)?\s*$/i);
  if (restartMatch) {
    const userId = restartMatch[1] ? Number(restartMatch[1]) : defaultTargetUserId;
    if (!userId) {
      await sendAdminNotice(env, message, '请使用 /restart 用户ID，或在回复/话题上下文中直接发送 /restart');
      return true;
    }

    await restartUserVerification(env, userId, formatAdminOperator(message.from));
    await sendAdminNotice(env, message, `已要求用户重新验证：${userId}`);
    return true;
  }

  const banMatch = trimmed.match(/^\/(?:ban|block)\s*(\-?\d+)?(?:\s+([\s\S]+))?$/i);
  if (banMatch) {
    const userId = banMatch[1] ? Number(banMatch[1]) : defaultTargetUserId;
    const reason = (banMatch[2] || '').trim() || '管理员封禁';
    if (!userId) {
      await sendAdminNotice(env, message, '请使用 /ban 用户ID 原因，或在回复/话题上下文中直接发送 /ban 原因');
      return true;
    }

    const entry = await setBlacklistEntry(env, userId, {
      reason,
      createdAt: new Date().toISOString(),
      createdBy: formatAdminOperator(message.from),
    });

    await sendAdminNotice(env, message, `已加入黑名单：${userId}\n原因：${entry.reason}`);

    try {
      await telegram(env, 'sendMessage', {
        chat_id: userId,
        text: env.BLOCKED_TEXT || DEFAULT_BLOCKED_TEXT,
      });
    } catch (error) {
      // ignore
    }

    return true;
  }

  const unbanMatch = trimmed.match(/^\/unban\s*(\-?\d+)?\s*$/i);
  if (unbanMatch) {
    const userId = unbanMatch[1] ? Number(unbanMatch[1]) : defaultTargetUserId;
    if (!userId) {
      await sendAdminNotice(env, message, '请使用 /unban 用户ID，或在回复/话题上下文中直接发送 /unban');
      return true;
    }

    await deleteBlacklistEntry(env, userId);
    await sendAdminNotice(env, message, `已解除黑名单：${userId}`);
    return true;
  }

  const blacklistMatch = trimmed.match(/^\/blacklist(?:\s+(\d+))?\s*$/i);
  if (blacklistMatch) {
    const entries = await listBlacklist(env, parseLimit(blacklistMatch[1], 20));
    if (entries.length === 0) {
      await sendAdminNotice(env, message, '黑名单为空。');
      return true;
    }

    const text = [
      `黑名单列表（最多 ${entries.length} 条）：`,
      ...entries.map((item) => `- ${item.userId}${item.reason ? ` | ${item.reason}` : ''}`),
    ].join('\n');

    await sendAdminNotice(env, message, text);
    return true;
  }

  const userMatch = trimmed.match(/^\/user\s*(\-?\d+)?\s*$/i);
  if (userMatch) {
    const userId = userMatch[1] ? Number(userMatch[1]) : defaultTargetUserId;
    if (!userId) {
      await sendAdminNotice(env, message, '请使用 /user 用户ID，或在回复/话题上下文中直接发送 /user');
      return true;
    }

    const profile = await getUserProfile(env, userId);
    const blacklist = await getBlacklistEntry(env, userId);
    const trust = await getTrustEntry(env, userId);
    const topic = await getTopicByUser(env, userId);
    const verifyState = await getUserVerificationState(env, userId);
    await sendAdminNotice(env, message, formatUserDetailText(userId, profile, blacklist, trust, topic, verifyState));
    return true;
  }

  const usersMatch = trimmed.match(/^\/users(?:\s+(\d+))?\s*$/i);
  if (usersMatch) {
    const users = await listUsers(env, parseLimit(usersMatch[1], 20));
    if (users.length === 0) {
      await sendAdminNotice(env, message, '暂无用户记录，请先配置 BOT_KV 并让用户与机器人互动。');
      return true;
    }

    const text = [
      `最近活跃用户（最多 ${users.length} 条）：`,
      ...users.map((item) => `- ${item.userId} | ${item.displayName || '未命名'} | ${item.lastSeenAt || '未知时间'}`),
    ].join('\n');

    await sendAdminNotice(env, message, text);
    return true;
  }

  return false;
}

async function handleAdminActionCallback(callbackQuery, env) {
  const senderId = callbackQuery.from?.id ? Number(callbackQuery.from.id) : null;
  const sourceChatId = callbackQuery.message?.chat?.id ? Number(callbackQuery.message.chat.id) : null;
  const adminChatId = toChatId(env.ADMIN_CHAT_ID);
  let allowed = senderId ? await isAuthorizedAdmin(env, senderId) : false;

  if (!allowed && senderId && sourceChatId === adminChatId && callbackQuery.message?.chat?.type !== 'private') {
    allowed = await isTelegramGroupAdmin(env, adminChatId, senderId);
  }

  if (!senderId || !allowed) {
    await answerCallback(env, callbackQuery.id, '你还没有被授权为管理员。', true);
    return;
  }

  await syncTelegramProfile(env, senderId, {
    user: callbackQuery.from || {},
    adminChatId,
  });

  const parts = String(callbackQuery.data || '').split(':');
  const action = parts[1];
  const userId = Number(parts[2]);
  if (!Number.isFinite(userId)) {
    await answerCallback(env, callbackQuery.id, '无效的目标用户');
    return;
  }

  const sourceMessage = callbackQuery.message || { chat: { id: senderId } };

  if (action === 'reply') {
    const tip = isTopicModeEnabled(env)
      ? '直接在当前话题发送消息即可回复该用户。'
      : '请直接回复这条提示消息，或使用 /reply 用户ID 内容。';
    await answerCallback(env, callbackQuery.id, tip, true);
    return;
  }

  if (action === 'user') {
    const profile = await getUserProfile(env, userId);
    const blacklist = await getBlacklistEntry(env, userId);
    const trust = await getTrustEntry(env, userId);
    const topic = await getTopicByUser(env, userId);
    const verifyState = await getUserVerificationState(env, userId);
    await sendAdminNotice(env, sourceMessage, formatUserDetailText(userId, profile, blacklist, trust, topic, verifyState));
    await answerCallback(env, callbackQuery.id, '已发送用户资料');
    return;
  }

  if (action === 'ban') {
    const entry = await setBlacklistEntry(env, userId, {
      reason: '通过按钮封禁',
      createdAt: new Date().toISOString(),
      createdBy: formatAdminOperator(callbackQuery.from),
    });
    await sendAdminNotice(env, sourceMessage, `已通过按钮加入黑名单：${userId}\n原因：${entry.reason}`);
    try {
      await telegram(env, 'sendMessage', {
        chat_id: userId,
        text: env.BLOCKED_TEXT || DEFAULT_BLOCKED_TEXT,
      });
    } catch (error) {
      // ignore
    }
    await answerCallback(env, callbackQuery.id, '已拉黑该用户');
    return;
  }

  if (action === 'unban') {
    await deleteBlacklistEntry(env, userId);
    await sendAdminNotice(env, sourceMessage, `已通过按钮解除黑名单：${userId}`);
    await answerCallback(env, callbackQuery.id, '已解除黑名单');
    return;
  }

  if (action === 'trust') {
    const entry = await setTrustEntry(env, userId, {
      note: '通过按钮加入白名单',
      createdAt: new Date().toISOString(),
      createdBy: formatAdminOperator(callbackQuery.from),
    });
    await sendAdminNotice(env, sourceMessage, `已通过按钮设为信任用户：${userId}${entry.note ? `\n备注：${entry.note}` : ''}`);
    await answerCallback(env, callbackQuery.id, '已设为信任用户');
    return;
  }

  if (action === 'untrust') {
    await deleteTrustEntry(env, userId);
    await sendAdminNotice(env, sourceMessage, `已通过按钮移出信任用户：${userId}`);
    await answerCallback(env, callbackQuery.id, '已移出信任用户');
    return;
  }

  if (action === 'restart') {
    await restartUserVerification(env, userId, formatAdminOperator(callbackQuery.from));
    await sendAdminNotice(env, sourceMessage, `已通过按钮要求用户重新验证：${userId}`);
    await answerCallback(env, callbackQuery.id, '已要求用户重新验证');
    return;
  }

  await answerCallback(env, callbackQuery.id, '未识别的管理员操作');
}

async function handleUserVerificationCallback(callbackQuery, env, publicBaseUrl = '') {
  const parts = String(callbackQuery.data || '').split(':');
  const userId = Number(parts[1]);
  const token = parts[2];
  const answer = String(parts[3] || '');
  const chatId = callbackQuery.message?.chat?.id ? Number(callbackQuery.message.chat.id) : null;
  const senderId = callbackQuery.from?.id ? Number(callbackQuery.from.id) : null;

  if (!chatId || !senderId || senderId !== userId || chatId !== userId) {
    await answerCallback(env, callbackQuery.id, '这不是你的验证题目。', true);
    return;
  }

  const result = await processUserVerificationAnswer(env, userId, answer, { expectedToken: token });

  if (result.status === 'verified') {
    await clearVerificationPromptMessage(env, userId, callbackQuery.message?.message_id, '✅ 验证通过，已解除限制。');

    await telegram(env, 'sendMessage', {
      chat_id: userId,
      text: `${env.WELCOME_TEXT || DEFAULT_WELCOME}\n\n你已完成首次验证，现在可以正常发送消息了。`,
    });

    await answerCallback(env, callbackQuery.id, '验证通过');
    return;
  }

  if (result.status === 'already-verified') {
    await answerCallback(env, callbackQuery.id, '你已经通过验证了。');
    return;
  }

  if (result.status === 'blocked') {
    await answerCallback(env, callbackQuery.id, `验证冷却中，请 ${result.leftSec} 秒后再试。`, true);
    return;
  }

  if (result.status === 'token-mismatch') {
    const refreshed = await createOrRefreshUserVerification(env, userId, true);
    await updateVerificationPromptMessage(env, callbackQuery.message, refreshed, publicBaseUrl);
    await answerCallback(env, callbackQuery.id, '题目已刷新，请重新验证。', true);
    return;
  }

  if (result.status === 'expired') {
    await clearVerificationPromptMessage(env, userId, callbackQuery.message?.message_id, [
      '⏰ 验证已过期',
      '本次验证题目已失效。',
      '请等待 1 分钟后重新发送消息获取新题目。',
    ].join('\n'));

    await answerCallback(env, callbackQuery.id, '验证已过期，请 1 分钟后重试。', true);
    return;
  }

  if (result.status === 'already-answered') {
    await answerCallback(env, callbackQuery.id, '本题已处理，请勿重复提交。', true);
    return;
  }

  if (result.status === 'banned') {
    await clearVerificationPromptMessage(env, userId, callbackQuery.message?.message_id, [
      '🚫 验证失败次数过多',
      `连续失败次数：${result.failureCount}/${result.maxFailures}`,
      '你已被自动加入黑名单，请等待管理员处理。',
    ].join('\n'));
    await answerCallback(env, callbackQuery.id, '验证失败次数过多，已限制联系。', true);
    return;
  }

  if (result.status === 'incorrect') {
    await clearVerificationPromptMessage(env, userId, callbackQuery.message?.message_id, [
      '❌ 验证失败',
      `你的答案：${answer}，正确答案：${result.correctAnswer}`,
      `连续失败次数：${result.failureCount}/${result.maxFailures}`,
      '请等待 1 分钟后重新发送消息获取新题目。',
      `解封时间：${result.blockedUntil}`,
    ].join('\n'));

    await answerCallback(env, callbackQuery.id, '验证失败，请 1 分钟后重试。', true);
    return;
  }
}

async function tryHandleUserVerificationText(message, env) {
  if (!isUserVerificationEnabled(env) || typeof message?.text !== 'string') {
    return false;
  }

  ensureKv(env);
  const userId = Number(message.chat.id);
  const state = await getUserVerificationState(env, userId);
  if (!state || state.verified || !state.challenge) {
    return false;
  }

  const answer = String(message.text || '').trim();
  if (!answer) {
    return false;
  }

  const result = await processUserVerificationAnswer(env, userId, answer);

  if (result.status === 'verified') {
    const promptMessageId = Number(state.promptMessageId || 0);
    if (promptMessageId) {
      await clearVerificationPromptMessage(env, userId, promptMessageId, '✅ 验证通过，已解除限制。');
    }

    await telegram(env, 'sendMessage', {
      chat_id: userId,
      text: `${env.WELCOME_TEXT || DEFAULT_WELCOME}\n\n你已完成首次验证，现在可以正常发送消息了。`,
    });
    return true;
  }

  if (result.status === 'blocked') {
    await telegram(env, 'sendMessage', {
      chat_id: userId,
      text: `验证冷却中，请 ${result.leftSec} 秒后再试。`,
    });
    return true;
  }

  if (result.status === 'expired') {
    const promptMessageId = Number(state.promptMessageId || 0);
    if (promptMessageId) {
      await clearVerificationPromptMessage(env, userId, promptMessageId, [
        '⏰ 验证已过期',
        '本次验证题目已失效。',
        '请等待 1 分钟后重新发送消息获取新题目。',
      ].join('\n'));
    }

    await telegram(env, 'sendMessage', {
      chat_id: userId,
      text: '验证已过期，请等待 1 分钟后重新发送消息获取新题目。',
    });
    return true;
  }

  if (result.status === 'incorrect') {
    const promptMessageId = Number(state.promptMessageId || 0);
    if (promptMessageId) {
      await clearVerificationPromptMessage(env, userId, promptMessageId, [
        '❌ 验证失败',
        `你的答案：${answer}，正确答案：${result.correctAnswer}`,
        `连续失败次数：${result.failureCount}/${result.maxFailures}`,
        '请等待 1 分钟后重新发送消息获取新题目。',
        `解封时间：${result.blockedUntil}`,
      ].join('\n'));
    }

    await telegram(env, 'sendMessage', {
      chat_id: userId,
      text: '验证失败，请等待 1 分钟后重新发送消息获取新题目。',
    });
    return true;
  }

  if (result.status === 'banned') {
    const promptMessageId = Number(state.promptMessageId || 0);
    if (promptMessageId) {
      await clearVerificationPromptMessage(env, userId, promptMessageId, [
        '🚫 验证失败次数过多',
        `连续失败次数：${result.failureCount}/${result.maxFailures}`,
        '你已被自动加入黑名单，请等待管理员处理。',
      ].join('\n'));
    }

    await telegram(env, 'sendMessage', {
      chat_id: userId,
      text: '验证失败次数过多，已限制联系。如有需要请等待管理员处理。',
    });
    return true;
  }

  if (result.status === 'already-answered') {
    await telegram(env, 'sendMessage', {
      chat_id: userId,
      text: '本题已处理，请勿重复提交。',
    });
    return true;
  }

  return false;
}

async function processUserVerificationAnswer(env, userId, answer, options = {}) {
  ensureKv(env);

  const state = await getUserVerificationState(env, userId);
  if (state?.verified) {
    return { status: 'already-verified' };
  }

  const blockedUntilMs = state?.blockedUntil ? new Date(state.blockedUntil).getTime() : 0;
  if (blockedUntilMs && blockedUntilMs > Date.now()) {
    return {
      status: 'blocked',
      leftSec: Math.max(1, Math.ceil((blockedUntilMs - Date.now()) / 1000)),
    };
  }

  if (!state?.challenge) {
    return { status: 'no-challenge' };
  }

  if (options.expectedToken && state.challenge.token !== options.expectedToken) {
    return { status: 'token-mismatch' };
  }

  if (isVerificationExpired(state.challenge, env)) {
    await markUserVerificationFailed(env, userId, {
      selectedAnswer: '',
      correctAnswer: String(state.challenge.correct || ''),
      blockMs: getVerificationTimeoutBlockMs(env),
      countForBan: false,
    });
    return { status: 'expired' };
  }

  if (state?.answeredAt) {
    return { status: 'already-answered' };
  }

  if (String(answer) !== String(state.challenge.correct)) {
    const failedState = await markUserVerificationFailed(env, userId, {
      selectedAnswer: answer,
      correctAnswer: String(state.challenge.correct),
      blockMs: getVerificationFailBlockMs(env),
    });
    const maxFailures = getVerificationMaxFailures(env);
    if (failedState.failureCount >= maxFailures) {
      const entry = await banUserForVerificationFailures(env, userId, failedState, maxFailures);
      return {
        status: 'banned',
        correctAnswer: String(state.challenge.correct),
        blockedUntil: failedState.blockedUntil,
        failureCount: failedState.failureCount,
        maxFailures,
        blacklist: entry,
      };
    }
    return {
      status: 'incorrect',
      correctAnswer: String(state.challenge.correct),
      blockedUntil: failedState.blockedUntil,
      failureCount: failedState.failureCount,
      maxFailures,
    };
  }

  await markUserVerified(env, userId);
  return { status: 'verified' };
}

function isUserPrivateCommand(message) {
  return typeof message?.text === 'string' && /^\/\S+/.test(String(message.text).trim());
}

async function handleUserPrivateCommand(message, env, publicBaseUrl = '') {
  const raw = String(message.text || '').trim();
  const command = raw.split(/\s+/)[0].split('@')[0].toLowerCase();

  if (command === '/start') {
    const verified = await ensureUserVerifiedOrPrompt(message, env, publicBaseUrl);
    if (!verified) return;

    await telegram(env, 'sendMessage', {
      chat_id: message.chat.id,
      text: env.WELCOME_TEXT || DEFAULT_WELCOME,
    });
    return;
  }

  await telegram(env, 'sendMessage', {
    chat_id: message.chat.id,
    text: '该命令仅管理员可用，请直接发送你要咨询的内容。',
  });
}

async function ensureUserVerifiedOrPrompt(message, env, publicBaseUrl = '') {
  if (!isUserVerificationEnabled(env)) {
    return true;
  }

  ensureKv(env);
  const userId = Number(message.chat.id);
  const state = await getUserVerificationState(env, userId);
  if (state?.verified) {
    return true;
  }

  if (await tryHandleUserVerificationText(message, env)) {
    return false;
  }

  const blockedUntilMs = state?.blockedUntil ? new Date(state.blockedUntil).getTime() : 0;
  if (blockedUntilMs && blockedUntilMs > Date.now()) {
    const leftSec = Math.max(1, Math.ceil((blockedUntilMs - Date.now()) / 1000));
    await telegram(env, 'sendMessage', {
      chat_id: userId,
      text: `验证冷却中，请 ${leftSec} 秒后再试。`,
    });
    return false;
  }

  if (state?.challenge && isVerificationExpired(state.challenge, env)) {
    await markUserVerificationFailed(env, userId, {
      selectedAnswer: '',
      correctAnswer: String(state.challenge.correct || ''),
      blockMs: getVerificationTimeoutBlockMs(env),
      countForBan: false,
    });
    await telegram(env, 'sendMessage', {
      chat_id: userId,
      text: '验证已过期，请等待 1 分钟后重新发送消息获取新题目。',
    });
    return false;
  }

  const nextState = await createOrRefreshUserVerification(
    env,
    userId,
    !state?.challenge || Boolean(state?.answeredAt),
  );

  await sendUserVerificationPrompt(env, userId, nextState, publicBaseUrl);
  return false;
}

async function syncTelegramCommands(env) {
  const userCommands = [
    { command: 'start', description: '开始使用机器人 / 查看欢迎说明' },
  ];
  const adminCommands = [
    { command: 'start', description: '开始使用机器人 / 查看欢迎说明' },
    { command: 'help', description: '查看管理员帮助' },
    { command: 'panel', description: '打开浏览器管理面板链接' },
    { command: 'reply', description: '回复用户：/reply 用户ID 内容' },
    { command: 'ban', description: '拉黑用户：/ban 用户ID 原因' },
    { command: 'unban', description: '解除拉黑：/unban 用户ID' },
    { command: 'trust', description: '设为信任用户：/trust 用户ID 备注' },
    { command: 'untrust', description: '取消信任用户：/untrust 用户ID' },
    { command: 'restart', description: '要求用户重新验证：/restart 用户ID' },
    { command: 'user', description: '查看用户详情：/user 用户ID' },
    { command: 'users', description: '查看最近用户：/users 20' },
    { command: 'blacklist', description: '查看黑名单列表' },
    { command: 'admins', description: '查看管理员列表' },
    { command: 'adminadd', description: '授权管理员：/adminadd 用户ID 备注' },
    { command: 'admindel', description: '移除管理员：/admindel 用户ID' },
    { command: 'panelpass', description: '重发当前面板临时密码' },
    { command: 'panelreset', description: '生成新的面板临时密码' },
  ];

  const applied = [];
  const failedScopes = [];
  const adminUserIds = await getCommandAdminUserIds(env);

  applied.push(
    await telegram(env, 'setMyCommands', {
      scope: { type: 'default' },
      commands: userCommands,
    }),
  );

  applied.push(
    await telegram(env, 'setChatMenuButton', {
      menu_button: {
        type: 'commands',
      },
    }),
  );

  for (const userId of adminUserIds) {
    try {
      applied.push(
        await telegram(env, 'setMyCommands', {
          scope: {
            type: 'chat',
            chat_id: userId,
          },
          commands: adminCommands,
        }),
      );
    } catch (error) {
      failedScopes.push({
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    commands: {
      default: userCommands,
      admin: adminCommands,
    },
    menuButton: 'commands',
    adminCommandTargets: adminUserIds,
    failedScopes,
    appliedCount: applied.length,
    note:
      adminUserIds.length > 0
        ? '默认命令已同步；管理员命令已按 ADMIN_IDS、已授权管理员，以及管理员群中的 Telegram 管理员私聊用户 ID 下发。'
        : '默认命令已同步；未找到可用的管理员私聊用户 ID，因此管理员专属命令未单独下发。',
  };
}

async function relayAdminMessageToUser(message, env, targetUserId) {
  if (typeof message.text === 'string' && !message.text.startsWith('/')) {
    await telegram(env, 'sendMessage', {
      chat_id: targetUserId,
      text: message.text,
    });
    return;
  }

  if (message.photo?.length) {
    const photo = message.photo[message.photo.length - 1];
    await telegram(env, 'sendPhoto', {
      chat_id: targetUserId,
      photo: photo.file_id,
      caption: message.caption || undefined,
    });
    return;
  }

  if (message.document) {
    await telegram(env, 'sendDocument', {
      chat_id: targetUserId,
      document: message.document.file_id,
      caption: message.caption || undefined,
    });
    return;
  }

  if (message.video) {
    await telegram(env, 'sendVideo', {
      chat_id: targetUserId,
      video: message.video.file_id,
      caption: message.caption || undefined,
    });
    return;
  }

  if (message.animation) {
    await telegram(env, 'sendAnimation', {
      chat_id: targetUserId,
      animation: message.animation.file_id,
      caption: message.caption || undefined,
    });
    return;
  }

  if (message.audio) {
    await telegram(env, 'sendAudio', {
      chat_id: targetUserId,
      audio: message.audio.file_id,
      caption: message.caption || undefined,
    });
    return;
  }

  if (message.voice) {
    await telegram(env, 'sendVoice', {
      chat_id: targetUserId,
      voice: message.voice.file_id,
      caption: message.caption || undefined,
    });
    return;
  }

  if (message.video_note) {
    await telegram(env, 'sendVideoNote', {
      chat_id: targetUserId,
      video_note: message.video_note.file_id,
    });
    return;
  }

  if (message.sticker) {
    await telegram(env, 'sendSticker', {
      chat_id: targetUserId,
      sticker: message.sticker.file_id,
    });
    return;
  }

  if (message.contact) {
    await telegram(env, 'sendContact', {
      chat_id: targetUserId,
      phone_number: message.contact.phone_number,
      first_name: message.contact.first_name,
      last_name: message.contact.last_name || undefined,
      vcard: message.contact.vcard || undefined,
    });
    return;
  }

  if (message.location) {
    await telegram(env, 'sendLocation', {
      chat_id: targetUserId,
      latitude: message.location.latitude,
      longitude: message.location.longitude,
    });
    return;
  }

  if (message.text && message.text.startsWith('/')) {
    return;
  }

  await telegram(env, 'sendMessage', {
    chat_id: targetUserId,
    text: '管理员发送了一条当前机器人暂未适配的消息类型。',
  });
}

function parseReplyCommand(text) {
  if (typeof text !== 'string') return null;
  const withUserId = text.match(/^\/(?:reply|r)\s+(\-?\d+)\s+([\s\S]+)$/i);
  if (withUserId) {
    return {
      userId: Number(withUserId[1]),
      text: withUserId[2],
    };
  }

  const withContext = text.match(/^\/(?:reply|r)\s+([\s\S]+)$/i);
  if (withContext) {
    return {
      userId: null,
      text: withContext[1],
    };
  }

  return null;
}

async function resolveAdminTargetUserId(message, env, adminChatId) {
  const byReply = extractTargetUserId(message.reply_to_message);
  if (byReply) {
    return byReply;
  }

  if (isTopicModeEnabled(env) && Number(message.chat.id) === adminChatId && message.message_thread_id) {
    return getUserIdByThread(env, message.message_thread_id);
  }

  return null;
}

function extractTargetUserId(message) {
  if (!message) return null;

  const textPool = [message.text, message.caption].filter(Boolean).join('\n');
  const metaMatch = textPool.match(/#UID:(\-?\d+)/);
  if (metaMatch) {
    return Number(metaMatch[1]);
  }

  const forwardOriginUserId = message.forward_origin?.sender_user?.id;
  if (forwardOriginUserId) {
    return Number(forwardOriginUserId);
  }

  const forwardFromId = message.forward_from?.id;
  if (forwardFromId) {
    return Number(forwardFromId);
  }

  if (message.reply_to_message) {
    return extractTargetUserId(message.reply_to_message);
  }

  return null;
}

function buildFallbackText(message, sender) {
  const header = [
    '📩 新的用户消息（降级文本模式）',
    `#UID:${message.chat.id}`,
    formatUserProfile(sender, message.chat),
  ]
    .filter(Boolean)
    .join('\n');

  return `${header}\n\n${formatMessagePreview(message)}`.trim();
}

function formatMessagePreview(message) {
  if (message.text) return trimText(message.text, 300);
  if (message.caption) return `[媒体消息]\n${trimText(message.caption, 300)}`;
  if (message.sticker) return '[贴纸消息]';
  if (message.voice) return '[语音消息]';
  if (message.video_note) return '[视频笔记消息]';
  if (message.photo) return '[图片消息]';
  if (message.video) return '[视频消息]';
  if (message.audio) return '[音频消息]';
  if (message.document) return `[文件消息] ${message.document.file_name || ''}`.trim();
  if (message.location) return `[位置消息] ${message.location.latitude}, ${message.location.longitude}`;
  if (message.contact) return `[联系人] ${message.contact.first_name} ${message.contact.phone_number}`.trim();
  return '[无法预览的消息类型]';
}

function trimText(text, maxLen) {
  const value = String(text || '');
  return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
}

function formatUserProfile(sender, chat) {
  const parts = [];
  const name = [sender.first_name, sender.last_name].filter(Boolean).join(' ').trim();
  if (name) parts.push(`用户：${name}`);
  if (sender.username) parts.push(`@${sender.username}`);
  if (chat?.id) parts.push(`ID:${chat.id}`);
  return parts.join(' | ');
}

function formatUserDetailText(userId, profile, blacklist, trust, topic, verifyState) {
  if (!profile && !blacklist && !trust && !topic && !verifyState) {
    return `未找到用户 ${userId} 的资料记录。`;
  }

  const lines = [`用户详情：${userId}`];
  if (profile) {
    lines.push(`昵称：${profile.displayName || '未知'}`);
    lines.push(`用户名：${profile.username ? `@${profile.username}` : '无'}`);
    lines.push(`First Name：${profile.firstName || '无'}`);
    lines.push(`Last Name：${profile.lastName || '无'}`);
    lines.push(`头像：${profile.hasAvatar ? '已同步' : '暂无'}`);
    lines.push(`资料状态：${formatProfileStatusText(profile.profileStatus)}`);
    lines.push(`资料更新时间：${profile.lastProfileSyncAt || '未知'}`);
    lines.push(`首次出现：${profile.firstSeenAt || '未知'}`);
    lines.push(`最近活跃：${profile.lastSeenAt || '未知'}`);
    lines.push(`最后消息：${profile.lastMessagePreview || '无'}`);
  }
  if (topic) {
    lines.push('话题模式：已分配');
    lines.push(`话题线程 ID：${topic.threadId || '未知'}`);
    lines.push(`话题名称：${topic.topicName || '未命名'}`);
  } else {
    lines.push('话题模式：未分配');
  }
  if (verifyState?.verified) {
    lines.push(`首次私聊验证：已通过（${verifyState.verifiedAt || '未知时间'}）`);
  } else if (verifyState?.challenge) {
    lines.push('首次私聊验证：待完成');
  } else {
    lines.push('首次私聊验证：未记录');
  }
  if (trust) {
    lines.push('白名单：是');
    lines.push(`白名单备注：${trust.note || '未填写'}`);
    lines.push(`白名单时间：${trust.createdAt || '未知'}`);
  } else {
    lines.push('白名单：否');
  }
  if (blacklist) {
    lines.push('黑名单：是');
    lines.push(`封禁原因：${blacklist.reason || '未填写'}`);
    lines.push(`封禁时间：${blacklist.createdAt || '未知'}`);
  } else {
    lines.push('黑名单：否');
  }
  return lines.join('\n');
}

function formatProfileStatusText(status) {
  if (status === 'complete') return '头像与资料已同步';
  if (status === 'partial') return '基础资料已同步';
  if (status === 'message-only') return '仅基于消息资料';
  if (status === 'error') return '资料同步异常';
  return '未知';
}

function buildAdminActionKeyboard(userId) {
  return {
    inline_keyboard: [
      [
        { text: '💬 回复', callback_data: `adm:reply:${userId}` },
        { text: '👤 用户资料', callback_data: `adm:user:${userId}` },
      ],
      [
        { text: '🚫 拉黑', callback_data: `adm:ban:${userId}` },
        { text: '✅ 解封', callback_data: `adm:unban:${userId}` },
      ],
      [
        { text: '🤝 信任', callback_data: `adm:trust:${userId}` },
        { text: '♻️ 重验', callback_data: `adm:restart:${userId}` },
      ],
      [{ text: '🧹 取消信任', callback_data: `adm:untrust:${userId}` }],
    ],
  };
}

function buildUserVerificationText(challenge, env = {}) {
  const expireMs = getVerificationExpireMs(env);
  const modeText = challenge.mode === 'math' ? '10 以内算术题' : '图形验证码';
  const promptText = challenge.mode === 'math'
    ? '请从下方 4 个选项中选择正确答案，答错后需等待 1 分钟。'
    : '请识别图片中的验证码，并从下方 4 个选项中选择正确答案，答错后需等待 1 分钟。';

  return [
    '🔐 首次私聊验证',
    `⏱ 请在 ${Math.floor(expireMs / 60000)} 分钟内完成验证`,
    promptText,
    '❗ 验证失败后需等待 1 分钟',
    `验证方式：${modeText}`,
    `题目：${challenge.question}`,
    `有效期：${Math.floor(expireMs / 60000)} 分钟`,
  ].join('\n');
}

function buildTextVerificationPrompt(challenge, env = {}) {
  const lines = [buildUserVerificationText(challenge, env)];
  if (challenge?.mode === 'captcha') {
    lines.push('');
    lines.push(`验证码：${challenge.correct}`);
    lines.push('图片发送失败时显示此文本验证码，请点选下方对应选项。');
  }
  return lines.join('\n');
}

function buildUserVerificationKeyboard(userId, challenge) {
  const buttons = challenge.options.map((option) => ({
    text: String(option),
    callback_data: `verify:${userId}:${challenge.token}:${option}`,
  }));

  return {
    inline_keyboard: [buttons.slice(0, 2), buttons.slice(2, 4)].filter((row) => row.length > 0),
  };
}

function buildVerificationImageUrl(challenge, publicBaseUrl = '') {
  const base = String(publicBaseUrl || '').trim().replace(/\/$/, '');
  if (!base) return '';
  const text = getVerificationImageText(challenge);
  const params = new URLSearchParams({
    text,
    token: String(challenge?.token || ''),
    mode: String(challenge?.mode || 'captcha'),
  });
  return `${base}${VERIFY_IMAGE_PATH}?${params.toString()}`;
}

function getVerificationImageText(challenge) {
  const raw = String(challenge?.imageText || challenge?.question || challenge?.correct || 'VERIFY').trim();
  return raw.replace(/[^\w+\-*/=? ]/g, ' ').replace(/\s+/g, ' ').slice(0, 24) || 'VERIFY';
}

function serveVerificationImage(url, request) {
  const text = String(url.searchParams.get('text') || 'VERIFY')
    .replace(/[^\w+\-*/=? ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
    .toUpperCase() || 'VERIFY';
  const token = String(url.searchParams.get('token') || '').slice(0, 80);
  const png = renderVerificationPng(text, token);
  return new Response(png, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'no-store, max-age=0',
      ...corsHeaders(request),
    },
  });
}

function renderVerificationPng(text, token = '') {
  const width = 420;
  const height = 140;
  const pixels = new Uint8Array(width * height * 3);
  const rand = createSeededRandom(`${text}:${token}`);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 3;
      const shade = 242 + Math.floor(rand() * 10);
      pixels[idx] = shade;
      pixels[idx + 1] = Math.min(255, shade + 2);
      pixels[idx + 2] = 255;
    }
  }

  for (let i = 0; i < 900; i += 1) {
    const x = Math.floor(rand() * width);
    const y = Math.floor(rand() * height);
    const idx = (y * width + x) * 3;
    const v = 160 + Math.floor(rand() * 70);
    pixels[idx] = v;
    pixels[idx + 1] = v;
    pixels[idx + 2] = v + 15;
  }

  for (let i = 0; i < 8; i += 1) {
    drawLine(
      pixels,
      width,
      height,
      Math.floor(rand() * width),
      Math.floor(rand() * height),
      Math.floor(rand() * width),
      Math.floor(rand() * height),
      [120 + Math.floor(rand() * 80), 130 + Math.floor(rand() * 70), 170 + Math.floor(rand() * 60)],
    );
  }

  const chars = text.split('');
  const scale = chars.length > 14 ? 6 : chars.length > 9 ? 7 : 8;
  const gap = Math.max(3, Math.floor(scale * 0.75));
  const totalWidth = chars.reduce((sum, ch) => sum + getFontWidth(ch, scale) + gap, -gap);
  let x = Math.max(16, Math.floor((width - totalWidth) / 2));
  const y = Math.floor((height - 7 * scale) / 2);
  for (const ch of chars) {
    const jitterY = Math.floor(rand() * 7) - 3;
    const color = [20 + Math.floor(rand() * 40), 45 + Math.floor(rand() * 45), 90 + Math.floor(rand() * 70)];
    drawChar(pixels, width, height, ch, x, y + jitterY, scale, color);
    x += getFontWidth(ch, scale) + gap;
  }

  return encodePngRgb(width, height, pixels);
}

const FONT_5X7 = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00001', '00001', '00001', '00001', '10001', '10001', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '*': ['00000', '10101', '01110', '11111', '01110', '10101', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function getFontWidth(ch, scale) {
  return (ch === ' ' ? 3 : 5) * scale;
}

function drawChar(pixels, width, height, ch, x, y, scale, color) {
  const glyph = FONT_5X7[ch] || FONT_5X7['?'];
  for (let gy = 0; gy < glyph.length; gy += 1) {
    const row = glyph[gy];
    for (let gx = 0; gx < row.length; gx += 1) {
      if (row[gx] !== '1') continue;
      for (let py = 0; py < scale; py += 1) {
        for (let px = 0; px < scale; px += 1) {
          setPixel(pixels, width, height, x + gx * scale + px, y + gy * scale + py, color);
        }
      }
    }
  }
}

function drawLine(pixels, width, height, x0, y0, x1, y1, color) {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    setPixel(pixels, width, height, x0, y0, color);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function setPixel(pixels, width, height, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const idx = (Math.floor(y) * width + Math.floor(x)) * 3;
  pixels[idx] = color[0];
  pixels[idx + 1] = color[1];
  pixels[idx + 2] = color[2];
}

function createSeededRandom(seedText) {
  let state = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    state ^= seedText.charCodeAt(i);
    state = Math.imul(state, 16777619) >>> 0;
  }
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function encodePngRgb(width, height, pixels) {
  const raw = new Uint8Array((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    raw.set(pixels.subarray(y * width * 3, (y + 1) * width * 3), offset);
    offset += width * 3;
  }

  const header = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, width);
  writeUint32(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return concatBytes([
    header,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlibStore(raw)),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

function zlibStore(data) {
  const parts = [new Uint8Array([0x78, 0x01])];
  let offset = 0;
  while (offset < data.length) {
    const len = Math.min(65535, data.length - offset);
    const final = offset + len >= data.length ? 1 : 0;
    const block = new Uint8Array(5 + len);
    block[0] = final;
    block[1] = len & 0xff;
    block[2] = (len >>> 8) & 0xff;
    const nlen = (~len) & 0xffff;
    block[3] = nlen & 0xff;
    block[4] = (nlen >>> 8) & 0xff;
    block.set(data.subarray(offset, offset + len), 5);
    parts.push(block);
    offset += len;
  }

  const adler = adler32(data);
  const checksum = new Uint8Array(4);
  writeUint32(checksum, 0, adler);
  parts.push(checksum);
  return concatBytes(parts);
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  writeUint32(out, 0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  writeUint32(out, 8 + data.length, crc32(crcInput));
  return out;
}

function adler32(data) {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return (((b << 16) | a) >>> 0);
}

let crcTable = null;

function crc32(data) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function concatBytes(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function generateCaptchaCode(length = 4) {
  const pool = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += pool[randomInt(0, pool.length - 1)];
  }
  return code;
}

function mutateCaptchaCode(code) {
  const pool = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const chars = String(code).split('');
  const index = randomInt(0, chars.length - 1);
  let next = chars[index];
  while (next === chars[index]) {
    next = pool[randomInt(0, pool.length - 1)];
  }
  chars[index] = next;
  return chars.join('');
}

function createMathOperands(operator) {
  if (operator === '+') {
    return [randomInt(0, 10), randomInt(0, 10)];
  }

  if (operator === '-') {
    const left = randomInt(0, 10);
    const right = randomInt(0, left);
    return [left, right];
  }

  const factors = [];
  for (let left = 0; left <= 10; left += 1) {
    for (let right = 0; right <= 10; right += 1) {
      if (left * right <= 10) {
        factors.push([left, right]);
      }
    }
  }

  return factors[randomInt(0, factors.length - 1)];
}

function calculateMathAnswer(left, right, operator) {
  if (operator === '+') return left + right;
  if (operator === '-') return left - right;
  return left * right;
}

function generateMathOptions(correct) {
  const options = new Set([Number(correct)]);
  while (options.size < 4) {
    const delta = randomInt(-3, 3);
    const candidate = Math.max(0, Number(correct) + (delta === 0 ? 1 : delta));
    options.add(candidate);
  }
  return shuffleArray(Array.from(options)).slice(0, 4);
}

function generateCaptchaChallenge() {
  const correct = generateCaptchaCode(4);
  const options = new Set([correct]);
  while (options.size < 4) {
    options.add(mutateCaptchaCode(correct));
  }

  return {
    mode: 'captcha',
    token: createChallengeToken(),
    question: '请选择图片中正确的验证码',
    imageText: correct,
    correct,
    options: shuffleArray(Array.from(options)).slice(0, 4),
    createdAt: new Date().toISOString(),
  };
}

function generateMathChallenge() {
  const operators = ['+', '-', '?'];
  const displayOperator = operators[randomInt(0, operators.length - 1)];
  const operator = displayOperator === '?' ? '*' : displayOperator;
  const [left, right] = createMathOperands(operator);
  const correct = calculateMathAnswer(left, right, operator);

  return {
    mode: 'math',
    token: createChallengeToken(),
    question: `${left} ${displayOperator} ${right} = ?（答案范围 0~10）`,
    imageText: `${left} ${displayOperator} ${right} = ?`,
    correct,
    options: generateMathOptions(correct),
    createdAt: new Date().toISOString(),
  };
}

function generateVerificationChallenge(env = {}) {
  const captchaEnabled = getVerificationCaptchaEnabled(env);
  const mathEnabled = getVerificationMathEnabled(env);
  if (captchaEnabled && mathEnabled) {
    return randomInt(0, 1) === 0 ? generateCaptchaChallenge() : generateMathChallenge();
  }
  if (mathEnabled) return generateMathChallenge();
  return generateCaptchaChallenge();
}

function isVerificationExpired(challenge, env = {}) {
  if (!challenge?.createdAt) return true;
  return Date.now() - new Date(challenge.createdAt).getTime() > getVerificationExpireMs(env);
}

async function updateVerificationPromptMessage(env, message, state, publicBaseUrl = '') {
  const imageUrl = buildVerificationImageUrl(state.challenge, publicBaseUrl || env.PUBLIC_BASE_URL || '');
  try {
    if (!imageUrl) throw new Error('verification_image_url_not_ready');
    await telegram(env, 'editMessageMedia', {
      chat_id: message.chat.id,
      message_id: message.message_id,
      media: {
        type: 'photo',
        media: imageUrl,
        caption: buildUserVerificationText(state.challenge, env),
      },
      reply_markup: buildUserVerificationKeyboard(Number(message.chat.id), state.challenge),
    });
    await setVerificationPromptMessageId(env, Number(message.chat.id), message.message_id);
  } catch (error) {
    const sent = await sendVerificationPromptMessage(env, Number(message.chat.id), state, publicBaseUrl);
    await setVerificationPromptMessageId(env, Number(message.chat.id), sent.message_id);
  }
}

async function sendUserVerificationPrompt(env, userId, state, publicBaseUrl = '') {
  const sent = await sendVerificationPromptMessage(env, userId, state, publicBaseUrl);

  await setVerificationPromptMessageId(env, userId, sent.message_id);
}

async function sendVerificationPromptMessage(env, userId, state, publicBaseUrl = '') {
  const imageUrl = buildVerificationImageUrl(state.challenge, publicBaseUrl || env.PUBLIC_BASE_URL || '');
  try {
    if (!imageUrl) throw new Error('verification_image_url_not_ready');
    return await telegram(env, 'sendPhoto', {
      chat_id: userId,
      photo: imageUrl,
      caption: buildUserVerificationText(state.challenge, env),
      reply_markup: buildUserVerificationKeyboard(userId, state.challenge),
    });
  } catch (error) {
    return telegram(env, 'sendMessage', {
      chat_id: userId,
      text: buildTextVerificationPrompt(state.challenge, env),
      reply_markup: buildUserVerificationKeyboard(userId, state.challenge),
    });
  }
}

async function answerCallback(env, callbackQueryId, text, showAlert = false) {
  try {
    await telegram(env, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  } catch (error) {
    // ignore
  }
}

async function clearVerificationPromptMessage(env, chatId, messageId, text) {
  if (!messageId) return;
  try {
    await telegram(env, 'editMessageCaption', {
      chat_id: chatId,
      message_id: messageId,
      caption: text,
      reply_markup: { inline_keyboard: [] },
    });
    return;
  } catch (error) {
    // Text fallback prompts have no caption.
  }

  try {
    await telegram(env, 'editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: { inline_keyboard: [] },
    });
  } catch (error) {
    // Ignore stale or already-deleted prompt messages.
  }
}

async function getAdminStatus(url, env, webhookPath, publicBaseUrl) {
  const topicModeEnabled = isTopicModeEnabled(env);
  const userVerificationEnabled = isUserVerificationEnabled(env);
  let webhookInfo = null;
  let webhookError = null;
  let lastWebhookError = null;

  if (env.BOT_TOKEN) {
    try {
      webhookInfo = await telegram(env, 'getWebhookInfo', {});
    } catch (error) {
      webhookError = error instanceof Error ? error.message : String(error);
    }
  }

  if (env.BOT_KV) {
    lastWebhookError = await getJson(env.BOT_KV, LAST_WEBHOOK_ERROR_KEY);
  }

  return {
    ok: true,
    service: 'telegram-private-chatbot',
    currentHost: url.host,
    publicBaseUrl,
    usingCustomDomain: !new URL(publicBaseUrl).hostname.endsWith('.workers.dev'),
    webhookPath,
    webhookUrl: `${publicBaseUrl}${webhookPath}`,
    adminPanel: getAdminPanelEntryUrl(env, publicBaseUrl) || buildAdminPanelUrl(env, publicBaseUrl),
    adminPanelTarget: buildAdminPanelUrl(env, publicBaseUrl),
    botConfigReady: Boolean(env.BOT_TOKEN && env.ADMIN_CHAT_ID),
    adminMode: topicModeEnabled ? 'forum-topic' : 'reply-chain',
    topicModeEnabled,
    topicModeReady: topicModeEnabled ? Boolean(env.BOT_KV) : true,
    userVerificationEnabled,
    userVerificationReady: userVerificationEnabled ? Boolean(env.BOT_KV) : true,
    hasToken: Boolean(env.BOT_TOKEN),
    hasKv: Boolean(env.BOT_KV),
    hasD1: Boolean(env.DB),
    hasAdminApiKey: Boolean(env.ADMIN_API_KEY),
    adminChatId: env.ADMIN_CHAT_ID || null,
    rootAdminIds: getRootAdminIds(env),
    webhookInfo,
    webhookError,
    lastWebhookError,
  };
}

async function recordWebhookError(env, error, update) {
  const message = update?.message || update?.edited_message || update?.callback_query?.message || null;
  const record = {
    at: new Date().toISOString(),
    error: formatErrorMessage(error),
    updateId: update?.update_id || null,
    chatId: message?.chat?.id || null,
    messageId: message?.message_id || null,
    senderId: update?.callback_query?.from?.id || message?.from?.id || null,
    messageType: message ? detectMessageType(message) : update?.callback_query ? 'callback_query' : 'unknown',
  };
  console.error('Telegram webhook update failed', record);
  if (env.BOT_KV) {
    try {
      await env.BOT_KV.put(LAST_WEBHOOK_ERROR_KEY, JSON.stringify(record));
    } catch (kvError) {
      console.error('Failed to persist webhook error', formatErrorMessage(kvError));
    }
  }
}

async function notifyWebhookError(env, error, update) {
  try {
    if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) return;
    const adminChatId = toChatId(env.ADMIN_CHAT_ID);
    const message = update?.message || update?.edited_message || update?.callback_query?.message || null;
    await telegram(env, 'sendMessage', {
      chat_id: adminChatId,
      text: [
        '⚠️ Webhook 入站处理异常，已自动吞掉 500，避免 Telegram 持续重试。',
        `错误：${trimText(formatErrorMessage(error), 500)}`,
        `Update：${update?.update_id || '未知'}`,
        message?.chat?.id ? `来源会话：${message.chat.id}` : '',
        message?.from?.id ? `发送者：${message.from.id}` : '',
      ].filter(Boolean).join('\n'),
    });
  } catch (notifyError) {
    console.error('Failed to notify webhook error', formatErrorMessage(notifyError));
  }
}

async function upsertUserProfile(env, message) {
  if (!env.BOT_KV) return null;

  const userId = Number(message.chat.id);
  const existing = await getUserProfile(env, userId);
  const sender = message.from || {};
  const now = new Date().toISOString();
  const baseRecord = {
    userId,
    username: sender.username || existing?.username || null,
    firstName: sender.first_name || existing?.firstName || null,
    lastName: sender.last_name || existing?.lastName || null,
    displayName:
      [sender.first_name, sender.last_name].filter(Boolean).join(' ').trim() || existing?.displayName || null,
    chatType: message.chat.type || existing?.chatType || null,
    firstSeenAt: existing?.firstSeenAt || now,
    lastSeenAt: now,
    lastMessageType: detectMessageType(message),
    lastMessagePreview: formatMessagePreview(message),
    hasAvatar: existing?.hasAvatar || false,
    avatarFileId: existing?.avatarFileId || null,
    avatarFileUniqueId: existing?.avatarFileUniqueId || null,
    avatarFilePath: existing?.avatarFilePath || null,
    avatarUpdatedAt: existing?.avatarUpdatedAt || null,
    avatarUrl: existing?.avatarUrl || null,
    profileStatus: existing?.profileStatus || 'message-only',
    lastProfileSyncAt: existing?.lastProfileSyncAt || null,
    profileSyncError: existing?.profileSyncError || null,
    profileSource: existing?.profileSource || 'message',
  };

  const record = await syncTelegramProfile(env, userId, {
    existing: baseRecord,
    user: sender,
    chat: message.chat,
  });

  await env.BOT_KV.put(userKey(userId), JSON.stringify(record));
  return record;
}

async function getUserProfile(env, userId) {
  if (!env.BOT_KV) return null;
  return getJson(env.BOT_KV, userKey(userId));
}

async function listUsers(env, requestedLimit = 50) {
  if (!env.BOT_KV) return [];
  const names = await collectKvKeys(env.BOT_KV, 'user:', MAX_SCAN_KEYS);
  const users = await Promise.all(names.map((name) => getJson(env.BOT_KV, name)));
  const enriched = await Promise.all(
    users.filter(Boolean).map(async (item) => {
      const [blacklist, trust, verifyState] = await Promise.all([
        getBlacklistEntry(env, item.userId),
        getTrustEntry(env, item.userId),
        getUserVerificationState(env, item.userId),
      ]);

      return {
        ...item,
        displayName: item.displayName || buildDisplayName(item) || `用户 ${item.userId}`,
        profileStatus: item.profileStatus || 'message-only',
        blacklisted: Boolean(blacklist),
        blacklistReason: blacklist?.reason || null,
        trusted: Boolean(trust),
        trustNote: trust?.note || null,
        verified: Boolean(verifyState?.verified),
        verificationStatus: verifyState?.verified ? 'verified' : verifyState?.challenge ? 'pending' : 'unknown',
      };
    }),
  );

  return enriched
    .sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')))
    .slice(0, clamp(requestedLimit, 1, MAX_LIST_LIMIT));
}

async function getBlacklistEntry(env, userId) {
  if (!env.BOT_KV) return null;
  return getJson(env.BOT_KV, blacklistKey(userId));
}

async function setBlacklistEntry(env, userId, payload) {
  ensureKv(env);
  const profile = await getUserProfile(env, userId);
  const entry = {
    userId: Number(userId),
    reason: payload.reason || '管理员封禁',
    createdAt: payload.createdAt || new Date().toISOString(),
    createdBy: payload.createdBy || 'unknown',
    displayName: profile?.displayName || null,
    username: profile?.username || null,
  };
  await env.BOT_KV.put(blacklistKey(userId), JSON.stringify(entry));
  return entry;
}

async function deleteBlacklistEntry(env, userId) {
  ensureKv(env);
  await env.BOT_KV.delete(blacklistKey(userId));
}

async function listBlacklist(env, requestedLimit = 50) {
  if (!env.BOT_KV) return [];
  const names = await collectKvKeys(env.BOT_KV, 'blacklist:', MAX_SCAN_KEYS);
  const items = await Promise.all(names.map((name) => getJson(env.BOT_KV, name)));
  const enriched = await Promise.all(
    items.filter(Boolean).map(async (item) => {
      const profile = await getUserProfile(env, item.userId);
      return {
        ...item,
        displayName: item.displayName || profile?.displayName || buildDisplayName(profile) || `用户 ${item.userId}`,
        username: item.username || profile?.username || null,
        firstName: profile?.firstName || null,
        lastName: profile?.lastName || null,
        hasAvatar: Boolean(profile?.hasAvatar),
        avatarUrl: profile?.avatarUrl || null,
        profileStatus: profile?.profileStatus || 'message-only',
      };
    }),
  );

  return enriched
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, clamp(requestedLimit, 1, MAX_LIST_LIMIT));
}

async function listTrust(env, requestedLimit = 50) {
  if (!env.BOT_KV) return [];
  const names = await collectKvKeys(env.BOT_KV, 'trust:', MAX_SCAN_KEYS);
  const items = await Promise.all(names.map((name) => getJson(env.BOT_KV, name)));
  const enriched = await Promise.all(
    items.filter(Boolean).map(async (item) => {
      const profile = await getUserProfile(env, item.userId);
      return {
        ...item,
        displayName: item.displayName || profile?.displayName || buildDisplayName(profile) || `用户 ${item.userId}`,
        username: item.username || profile?.username || null,
        firstName: profile?.firstName || null,
        lastName: profile?.lastName || null,
        hasAvatar: Boolean(profile?.hasAvatar),
        avatarUrl: profile?.avatarUrl || null,
        profileStatus: profile?.profileStatus || 'message-only',
      };
    }),
  );

  return enriched
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, clamp(requestedLimit, 1, MAX_LIST_LIMIT));
}

async function getTrustEntry(env, userId) {
  if (!env.BOT_KV) return null;
  return getJson(env.BOT_KV, trustKey(userId));
}

async function setTrustEntry(env, userId, payload) {
  ensureKv(env);
  const profile = await getUserProfile(env, userId);
  const entry = {
    userId: Number(userId),
    note: payload.note || '管理员加入白名单',
    createdAt: payload.createdAt || new Date().toISOString(),
    createdBy: payload.createdBy || 'unknown',
    displayName: profile?.displayName || null,
    username: profile?.username || null,
  };
  await env.BOT_KV.put(trustKey(userId), JSON.stringify(entry));
  return entry;
}

async function deleteTrustEntry(env, userId) {
  ensureKv(env);
  await env.BOT_KV.delete(trustKey(userId));
}

async function setAuthorizedAdmin(env, userId, payload) {
  ensureKv(env);
  const profile = await syncTelegramProfile(env, userId, {
    existing: (await getUserProfile(env, userId)) || { userId: Number(userId) },
    adminChatId: env.ADMIN_CHAT_ID,
  });
  const entry = {
    userId: Number(userId),
    note: payload.note || null,
    createdAt: payload.createdAt || new Date().toISOString(),
    createdBy: payload.createdBy || 'unknown',
    source: 'kv',
    displayName: profile?.displayName || buildDisplayName(profile) || null,
    username: profile?.username || null,
    firstName: profile?.firstName || null,
    lastName: profile?.lastName || null,
    avatarUrl: profile?.avatarUrl || null,
    hasAvatar: Boolean(profile?.hasAvatar),
    profileStatus: profile?.profileStatus || 'message-only',
  };
  await env.BOT_KV.put(adminKey(userId), JSON.stringify(entry));
  return entry;
}

async function deleteAuthorizedAdmin(env, userId) {
  if (!env.BOT_KV) return;
  await env.BOT_KV.delete(adminKey(userId));
}

async function getAuthorizedAdminEntry(env, userId) {
  if (!env.BOT_KV) return null;
  return getJson(env.BOT_KV, adminKey(userId));
}

async function isAuthorizedAdmin(env, userId) {
  if (isRootAdmin(env, userId)) {
    return true;
  }

  const entry = await getAuthorizedAdminEntry(env, userId);
  if (entry) {
    return true;
  }

  const adminChatId = Number(env.ADMIN_CHAT_ID);
  if (Number.isFinite(adminChatId) && adminChatId < 0 && Number(userId) > 0) {
    return isTelegramGroupAdmin(env, adminChatId, Number(userId));
  }

  return false;
}

async function listAuthorizedAdmins(env, requestedLimit = 50) {
  const limit = clamp(requestedLimit, 1, MAX_LIST_LIMIT);
  const rootEntries = getRootAdminIds(env).map((userId) => ({
    userId,
    note: '根管理员',
    source: 'root-env',
  }));
  const groupEntries = await getDynamicGroupAdminEntries(env);

  if (!env.BOT_KV) {
    return [...rootEntries, ...groupEntries].slice(0, limit);
  }

  const names = await collectKvKeys(env.BOT_KV, 'admin:', MAX_SCAN_KEYS);
  const kvEntries = (await Promise.all(names.map((name) => getJson(env.BOT_KV, name))))
    .filter((item) => item && Number.isFinite(Number(item.userId)))
    .map((item) => ({
      ...item,
      userId: Number(item.userId),
      source: item.source || 'kv',
    }));

  const merged = new Map();
  for (const item of [...rootEntries, ...groupEntries, ...kvEntries]) {
    merged.set(Number(item.userId), item);
  }

  const enriched = await Promise.all(
    Array.from(merged.values()).map(async (item) => {
      const profile = await syncTelegramProfile(env, item.userId, {
        existing: (await getUserProfile(env, item.userId)) || item,
        adminChatId: env.ADMIN_CHAT_ID,
      });

      return {
        ...item,
        displayName: item.displayName || profile?.displayName || buildDisplayName(profile) || `管理员 ${item.userId}`,
        username: item.username || profile?.username || null,
        firstName: item.firstName || profile?.firstName || null,
        lastName: item.lastName || profile?.lastName || null,
        avatarUrl: item.avatarUrl || profile?.avatarUrl || null,
        hasAvatar: item.hasAvatar || Boolean(profile?.hasAvatar),
        profileStatus: item.profileStatus || profile?.profileStatus || 'message-only',
      };
    }),
  );

  return enriched.sort((a, b) => Number(a.userId) - Number(b.userId)).slice(0, limit);
}

async function getDynamicGroupAdminEntries(env) {
  const adminChatId = Number(env.ADMIN_CHAT_ID);
  if (!(Number.isFinite(adminChatId) && adminChatId < 0) || !env.BOT_TOKEN) {
    return [];
  }

  try {
    const members = await telegram(env, 'getChatAdministrators', {
      chat_id: adminChatId,
    });

    const result = [];
    for (const item of members) {
      const userId = Number(item?.user?.id);
      if (!(Number.isFinite(userId) && userId > 0)) continue;
      const profile = await syncTelegramProfile(env, userId, {
        user: item?.user || {},
        adminChatId,
      });
      result.push({
        userId,
        note: item?.status === 'creator' ? '群主管理员' : '群管理员',
        source: 'group-admin',
        createdAt: null,
        displayName: profile?.displayName || buildDisplayName(profile) || null,
        username: profile?.username || null,
        firstName: profile?.firstName || null,
        lastName: profile?.lastName || null,
        avatarUrl: profile?.avatarUrl || null,
        hasAvatar: Boolean(profile?.hasAvatar),
        profileStatus: profile?.profileStatus || 'message-only',
      });
    }

    return result;
  } catch (error) {
    return [];
  }
}

function getRootAdminIds(env) {
  const ids = parseIdList(env.ADMIN_IDS || env.ADMIN_ID);
  if (ids.length === 0 && env.ADMIN_CHAT_ID && !String(env.ADMIN_CHAT_ID).startsWith('-')) {
    ids.push(Number(env.ADMIN_CHAT_ID));
  }
  return Array.from(new Set(ids));
}

async function getCommandAdminUserIds(env) {
  const admins = await listAuthorizedAdmins(env, MAX_LIST_LIMIT);
  const configuredIds = admins
    .map((item) => Number(item.userId))
    .filter((userId) => Number.isFinite(userId) && userId > 0);

  const groupAdminIds = [];
  const adminChatId = env.ADMIN_CHAT_ID ? Number(env.ADMIN_CHAT_ID) : 0;
  if (Number.isFinite(adminChatId) && adminChatId < 0 && env.BOT_TOKEN) {
    try {
      const members = await telegram(env, 'getChatAdministrators', {
        chat_id: adminChatId,
      });
      groupAdminIds.push(
        ...members
          .map((item) => Number(item?.user?.id))
          .filter((userId, index, arr) => Number.isFinite(userId) && userId > 0 && !arr.slice(0, index).includes(userId)),
      );
    } catch (error) {
      // ignore group admin lookup failures and fall back to configured IDs
    }
  }

  return Array.from(new Set([...configuredIds, ...groupAdminIds]));
}

function isRootAdmin(env, userId) {
  return getRootAdminIds(env).includes(Number(userId));
}

async function ensureUserTopic(env, message, adminChatId) {
  ensureKv(env);

  const userId = Number(message.chat.id);
  const existing = await getTopicByUser(env, userId);
  if (existing?.threadId) {
    return existing;
  }

  let created;
  try {
    created = await telegram(env, 'createForumTopic', {
      chat_id: adminChatId,
      name: buildTopicName(message.from || {}, message.chat),
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    throw new AppError(
      500,
      `话题模式创建失败：${raw}。请确认 ADMIN_CHAT_ID 指向已开启话题功能的 Telegram 超级群组，并已绑定 BOT_KV。`,
    );
  }

  const record = {
    userId,
    threadId: Number(created.message_thread_id),
    topicName: created.name || buildTopicName(message.from || {}, message.chat),
    chatId: Number(adminChatId),
    createdAt: new Date().toISOString(),
  };

  await env.BOT_KV.put(topicUserKey(userId), JSON.stringify(record));
  await env.BOT_KV.put(
    topicThreadKey(record.threadId),
    JSON.stringify({
      threadId: record.threadId,
      userId,
      createdAt: record.createdAt,
    }),
  );

  return record;
}

async function getTopicByUser(env, userId) {
  if (!env.BOT_KV) return null;
  return getJson(env.BOT_KV, topicUserKey(userId));
}

async function getUserIdByThread(env, threadId) {
  if (!env.BOT_KV) return null;
  const record = await getJson(env.BOT_KV, topicThreadKey(threadId));
  return record?.userId ? Number(record.userId) : null;
}

function buildTopicName(sender, chat) {
  const base =
    [sender.first_name, sender.last_name].filter(Boolean).join(' ').trim() ||
    sender.username ||
    `用户 ${chat.id}`;
  return `${base} (${chat.id})`.slice(0, 120);
}

async function getUserVerificationState(env, userId) {
  if (!env.BOT_KV) return null;
  return getJson(env.BOT_KV, verifyKey(userId));
}

async function createOrRefreshUserVerification(env, userId, forceNew = false) {
  ensureKv(env);
  const existing = await getUserVerificationState(env, userId);
  if (existing?.verified) {
    return existing;
  }
  if (existing?.challenge && !forceNew && !isVerificationExpired(existing.challenge, env)) {
    return existing;
  }

  const state = {
    userId: Number(userId),
    verified: false,
    verifiedAt: null,
    answeredAt: null,
    promptMessageId: existing?.promptMessageId || null,
    blockedUntil: null,
    selectedAnswer: null,
    correctAnswer: null,
    failureCount: Number(existing?.failureCount || 0),
    challenge: generateVerificationChallenge(env),
    updatedAt: new Date().toISOString(),
  };

  await env.BOT_KV.put(verifyKey(userId), JSON.stringify(state));
  return state;
}

async function setVerificationPromptMessageId(env, userId, messageId) {
  if (!env.BOT_KV) return;
  const state = (await getUserVerificationState(env, userId)) || {
    userId: Number(userId),
    verified: false,
    challenge: null,
  };
  state.promptMessageId = Number(messageId);
  state.updatedAt = new Date().toISOString();
  await env.BOT_KV.put(verifyKey(userId), JSON.stringify(state));
}

async function markUserVerified(env, userId) {
  ensureKv(env);
  const existing = await getUserVerificationState(env, userId);
  const state = {
    ...(existing || {}),
    userId: Number(userId),
    verified: true,
    verifiedAt: new Date().toISOString(),
    answeredAt: new Date().toISOString(),
    blockedUntil: null,
    selectedAnswer: null,
    correctAnswer: null,
    challenge: null,
    failureCount: 0,
    updatedAt: new Date().toISOString(),
  };
  await env.BOT_KV.put(verifyKey(userId), JSON.stringify(state));
  return state;
}

async function markUserVerificationFailed(env, userId, payload) {
  ensureKv(env);
  const existing = await getUserVerificationState(env, userId);
  const blockMs = Number(payload?.blockMs || VERIFY_FAIL_BLOCK_MS);
  const now = Date.now();
  const blockedUntil = new Date(now + blockMs).toISOString();
  const countForBan = payload?.countForBan !== false;
  const failureCount = countForBan ? Number(existing?.failureCount || 0) + 1 : Number(existing?.failureCount || 0);
  const state = {
    ...(existing || {}),
    userId: Number(userId),
    verified: false,
    verifiedAt: null,
    answeredAt: new Date(now).toISOString(),
    blockedUntil,
    selectedAnswer: String(payload?.selectedAnswer || ''),
    correctAnswer: String(payload?.correctAnswer || ''),
    challenge: null,
    failureCount,
    lastFailureAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  await env.BOT_KV.put(verifyKey(userId), JSON.stringify(state));
  return state;
}

async function banUserForVerificationFailures(env, userId, failedState, maxFailures) {
  const entry = await setBlacklistEntry(env, userId, {
    reason: `首次私聊验证连续失败 ${failedState.failureCount}/${maxFailures} 次，系统自动拉黑`,
    createdAt: new Date().toISOString(),
    createdBy: 'verification-guard',
  });
  await reportVerificationAutoBan(env, userId, failedState, maxFailures, entry);
  return entry;
}

async function reportVerificationAutoBan(env, userId, failedState, maxFailures, entry) {
  try {
    const adminChatId = toChatId(env.ADMIN_CHAT_ID);
    const profile = await getUserProfile(env, userId);
    await telegram(env, 'sendMessage', {
      chat_id: adminChatId,
      text: [
        '🚫 用户验证失败次数过多，已自动拉黑',
        `用户：${profile?.displayName || '未知'}${profile?.username ? ` @${profile.username}` : ''}`,
        `ID：${userId}`,
        `失败次数：${failedState.failureCount}/${maxFailures}`,
        `最后选择：${failedState.selectedAnswer || '无'}`,
        `正确答案：${failedState.correctAnswer || '未知'}`,
        `原因：${entry.reason}`,
      ].join('\n'),
    });
  } catch (error) {
    // 自动拉黑已完成，管理员通知失败不应影响 webhook。
  }
}

async function restartUserVerification(env, userId, operator = 'unknown') {
  ensureKv(env);
  const existing = await getUserVerificationState(env, userId);
  const state = {
    ...(existing || {}),
    userId: Number(userId),
    verified: false,
    verifiedAt: null,
    answeredAt: null,
    blockedUntil: null,
    selectedAnswer: null,
    correctAnswer: null,
    challenge: null,
    failureCount: 0,
    updatedAt: new Date().toISOString(),
    restartedBy: operator,
  };

  await env.BOT_KV.put(verifyKey(userId), JSON.stringify(state));
  return state;
}

async function collectKvKeys(kv, prefix, maxKeys) {
  const names = [];
  let cursor = undefined;

  while (names.length < maxKeys) {
    const result = await kv.list({ prefix, cursor, limit: 1000 });
    names.push(...result.keys.map((item) => item.name));
    if (result.list_complete || !result.cursor) {
      break;
    }
    cursor = result.cursor;
  }

  return names.slice(0, maxKeys);
}

async function getJson(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function ensureKv(env) {
  if (!env.BOT_KV) {
    throw new AppError(500, '请先在 wrangler.toml / Cloudflare 中绑定 KV：BOT_KV');
  }
}

function userKey(userId) {
  return `user:${userId}`;
}

function blacklistKey(userId) {
  return `blacklist:${userId}`;
}

function adminKey(userId) {
  return `admin:${userId}`;
}

function topicUserKey(userId) {
  return `topic:user:${userId}`;
}

function topicThreadKey(threadId) {
  return `topic:thread:${threadId}`;
}

function trustKey(userId) {
  return `trust:${userId}`;
}

function verifyKey(userId) {
  return `verify:${userId}`;
}

function detectMessageType(message) {
  if (typeof message?.text === 'string') return 'text';
  if (message?.photo?.length) return 'photo';
  if (message?.document) return 'document';
  if (message?.video) return 'video';
  if (message?.animation) return 'animation';
  if (message?.audio) return 'audio';
  if (message?.voice) return 'voice';
  if (message?.video_note) return 'video_note';
  if (message?.sticker) return 'sticker';
  if (message?.contact) return 'contact';
  if (message?.location) return 'location';
  return 'unknown';
}

function isIgnoredAdminServiceMessage(message) {
  return Boolean(
    message.forum_topic_created ||
      message.forum_topic_closed ||
      message.forum_topic_reopened ||
      message.general_forum_topic_hidden ||
      message.general_forum_topic_unhidden ||
      message.new_chat_members ||
      message.left_chat_member,
  );
}

function isTopicModeEnabled(env) {
  const raw = String(env.TOPIC_MODE ?? 'true').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function parsePositiveInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}

function getVerificationExpireMs(env) {
  return parsePositiveInt(env.VERIFY_EXPIRE_MS, VERIFY_EXPIRE_MS);
}

function getVerificationFailBlockMs(env) {
  return parsePositiveInt(env.VERIFY_FAIL_BLOCK_MS, VERIFY_FAIL_BLOCK_MS);
}

function getVerificationTimeoutBlockMs(env) {
  return parsePositiveInt(env.VERIFY_TIMEOUT_BLOCK_MS, VERIFY_TIMEOUT_BLOCK_MS);
}

function getVerificationMaxFailures(env) {
  return parsePositiveInt(env.VERIFY_MAX_FAILURES, VERIFY_MAX_FAILURES);
}

function getVerificationMathEnabled(env) {
  return String(env.VERIFY_MATH_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

function getVerificationCaptchaEnabled(env) {
  return String(env.VERIFY_CAPTCHA_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

function isUserVerificationEnabled(env) {
  const raw = String(env.USER_VERIFICATION ?? 'true').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function getKeywordFilters(env) {
  return String(env.KEYWORD_FILTERS || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchKeywordFilter(env, message) {
  const keywords = getKeywordFilters(env);
  if (keywords.length === 0) return null;

  const textPool = [message.text, message.caption]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  if (!textPool) return null;

  return keywords.find((item) => textPool.includes(String(item).toLowerCase())) || null;
}

async function reportKeywordBan(env, adminChatId, message, keyword, entry) {
  const sender = message.from || {};
  const lines = [
    '🚨 命中关键词过滤，已自动封禁用户',
    `关键词：${keyword}`,
    `用户：${formatUserProfile(sender, message.chat)}`,
    `原因：${entry.reason || '命中关键词过滤'}`,
    `内容预览：${formatMessagePreview(message)}`,
  ];

  try {
    await telegram(env, 'sendMessage', {
      chat_id: adminChatId,
      text: lines.join('\n'),
    });
  } catch (error) {
    // ignore
  }
}

async function sendAdminNotice(env, message, text) {
  const payload = {
    chat_id: message.chat.id,
    text,
  };

  if (message.message_thread_id) {
    payload.message_thread_id = message.message_thread_id;
  }

  await telegramWithThreadFallback(env, 'sendMessage', payload);
}

async function notifyUserAdminDeliveryFailed(env, message, error) {
  try {
    await telegram(env, 'sendMessage', {
      chat_id: message.chat.id,
      text: [
        '消息暂未送达管理员，请稍后再试。',
        `原因：${trimText(formatErrorMessage(error), 300)}`,
      ].join('\n'),
    });
  } catch (notifyError) {
    console.error('Failed to notify user delivery failure', formatErrorMessage(notifyError));
  }
}

async function getRuntimeEnv(env) {
  if (!env.BOT_KV) {
    return env;
  }

  const systemConfig = await getSystemConfig(env);
  const runtime = { ...env };
  const runtimeKeys = [
    'VERIFY_EXPIRE_MS',
    'VERIFY_FAIL_BLOCK_MS',
    'VERIFY_TIMEOUT_BLOCK_MS',
    'VERIFY_MAX_FAILURES',
    'VERIFY_MATH_ENABLED',
    'VERIFY_CAPTCHA_ENABLED',
    'BOT_TOKEN',
    'ADMIN_CHAT_ID',
    'ADMIN_IDS',
    'ADMIN_ID',
    'WEBHOOK_SECRET',
    'PUBLIC_BASE_URL',
    'WEBHOOK_PATH',
    'TOPIC_MODE',
    'USER_VERIFICATION',
    'WELCOME_TEXT',
    'BLOCKED_TEXT',
    'ADMIN_API_KEY',
    'ADMIN_PANEL_URL',
    'ADMIN_PANEL_USER',
    'KEYWORD_FILTERS',
  ];

  for (const key of runtimeKeys) {
    const value = systemConfig?.[key];
    if (typeof value === 'string' && value.trim()) {
      runtime[key] = value.trim();
    }
  }

  return runtime;
}

async function saveMessageHistory(env, entry) {
  if (!env.DB) return;

  try {
    const userId = Number(entry.userId);
    if (!Number.isFinite(userId)) return;

    const nowIso = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO conversations (user_id, chat_type, topic_id, last_message_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?4, ?4)
       ON CONFLICT(user_id) DO UPDATE SET
         chat_type = excluded.chat_type,
         topic_id = COALESCE(excluded.topic_id, conversations.topic_id),
         last_message_at = excluded.last_message_at,
         updated_at = excluded.updated_at`
    )
      .bind(userId, entry.chatType || null, entry.topicId || null, nowIso)
      .run();

    const conversation = await env.DB.prepare('SELECT id FROM conversations WHERE user_id = ?1 LIMIT 1')
      .bind(userId)
      .first();
    if (!conversation?.id) return;

    await env.DB.prepare(
      `INSERT INTO messages (
        conversation_id, user_id, telegram_message_id, direction, sender_role, message_type,
        text_content, media_file_id, raw_payload, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
    )
      .bind(
        Number(conversation.id),
        userId,
        entry.telegramMessageId || null,
        entry.direction,
        entry.senderRole,
        entry.messageType,
        entry.textContent || null,
        entry.mediaFileId || null,
        safeJsonStringify(entry.rawPayload),
        nowIso,
      )
      .run();
  } catch (error) {
    // ignore D1 write failures to avoid blocking message flow
  }
}

async function listMessageHistory(env, options = {}) {
  if (!env.DB) return [];

  const limit = clamp(Number(options.limit) || 50, 1, MAX_LIST_LIMIT);
  const userId = options.userId ? Number(options.userId) : null;
  const baseSql = `SELECT
      m.id,
      m.user_id,
      m.telegram_message_id,
      m.direction,
      m.sender_role,
      m.message_type,
      m.text_content,
      m.media_file_id,
      m.created_at,
      c.topic_id,
      c.chat_type
    FROM messages m
    INNER JOIN conversations c ON c.id = m.conversation_id`;

  const statement = userId
    ? env.DB.prepare(`${baseSql} WHERE m.user_id = ?1 ORDER BY m.created_at DESC LIMIT ?2`).bind(userId, limit)
    : env.DB.prepare(`${baseSql} ORDER BY m.created_at DESC LIMIT ?1`).bind(limit);

  const result = await statement.all();
  return Array.isArray(result?.results) ? result.results : [];
}



function extractMessageText(message) {
  if (typeof message?.text === 'string') return message.text;
  if (typeof message?.caption === 'string') return message.caption;
  return '';
}

function extractPrimaryMediaFileId(message) {
  if (message?.photo?.length) return message.photo[message.photo.length - 1]?.file_id || null;
  return (
    message?.document?.file_id ||
    message?.video?.file_id ||
    message?.animation?.file_id ||
    message?.audio?.file_id ||
    message?.voice?.file_id ||
    message?.video_note?.file_id ||
    message?.sticker?.file_id ||
    null
  );
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch (error) {
    return null;
  }
}

async function getEffectiveSystemConfig(env) {
  const config = await getSystemConfig(env);
  const effective = { ...config };
  const runtimeKeys = [
    'BOT_TOKEN',
    'ADMIN_CHAT_ID',
    'ADMIN_IDS',
    'ADMIN_ID',
    'WEBHOOK_SECRET',
    'PUBLIC_BASE_URL',
    'WEBHOOK_PATH',
    'TOPIC_MODE',
    'USER_VERIFICATION',
    'WELCOME_TEXT',
    'BLOCKED_TEXT',
    'ADMIN_API_KEY',
    'ADMIN_PANEL_URL',
    'ADMIN_PANEL_USER',
    'KEYWORD_FILTERS',
  ];

  for (const key of runtimeKeys) {
    const value = typeof env?.[key] === 'string' ? env[key].trim() : '';
    if (value) {
      effective[key] = value;
    }
  }

  for (const key of runtimeKeys) {
    const value = typeof config?.[key] === 'string' ? config[key].trim() : '';
    if (value) {
      effective[key] = value;
    }
  }

  effective.updatedAt = config.updatedAt || null;
  return effective;
}

async function getSystemConfig(env) {
  if (!env.BOT_KV) {
    return {};
  }

  const data = await getJson(env.BOT_KV, SYSTEM_CONFIG_KEY);
  if (!data || typeof data !== 'object') {
    return {};
  }
  return data;
}

async function ensureAdminPasswordState(env) {
  ensureKv(env);
  const config = await getSystemConfig(env);
  const username = getAdminPanelUser(env);
  const permanentPassword = String(config.ADMIN_PANEL_PASSWORD || '').trim();

  if (permanentPassword) {
    return {
      username,
      passwordReady: true,
      passwordMode: 'permanent',
      password: permanentPassword,
      mustChangePassword: false,
      bootstrapExpiresAt: null,
    };
  }

  const bootstrapPassword = String(config.ADMIN_BOOTSTRAP_PASSWORD || '').trim();
  const bootstrapExpiresAt = String(config.ADMIN_BOOTSTRAP_EXPIRES_AT || '').trim() || null;
  const bootstrapExpireMs = bootstrapExpiresAt ? new Date(bootstrapExpiresAt).getTime() : 0;

  if (bootstrapPassword && bootstrapExpireMs > Date.now()) {
    return {
      username,
      passwordReady: true,
      passwordMode: 'bootstrap',
      password: bootstrapPassword,
      mustChangePassword: true,
      bootstrapExpiresAt,
      bootstrapNotifyError: String(config.ADMIN_BOOTSTRAP_NOTIFY_ERROR || '').trim() || null,
    };
  }

  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) {
    return {
      username,
      passwordReady: false,
      passwordMode: 'none',
      password: '',
      mustChangePassword: false,
      bootstrapExpiresAt: null,
    };
  }

  const bootstrapGeneratedPassword = createBootstrapPassword();

  const next = {
    ...config,
    ADMIN_BOOTSTRAP_PASSWORD: bootstrapGeneratedPassword,
    ADMIN_BOOTSTRAP_EXPIRES_AT: new Date(Date.now() + ADMIN_BOOTSTRAP_TTL_MS).toISOString(),
    ADMIN_FORCE_PASSWORD_CHANGE: 'true',
    updatedAt: new Date().toISOString(),
  };

  delete next.ADMIN_PANEL_PASSWORD;
  delete next.ADMIN_BOOTSTRAP_NOTIFY_ERROR;
  await env.BOT_KV.put(SYSTEM_CONFIG_KEY, JSON.stringify(next));
  let bootstrapNotifyError = null;
  try {
    await notifyBootstrapPassword(env, username, bootstrapGeneratedPassword, next.ADMIN_BOOTSTRAP_EXPIRES_AT);
  } catch (error) {
    bootstrapNotifyError = formatErrorMessage(error);
    next.ADMIN_BOOTSTRAP_NOTIFY_ERROR = bootstrapNotifyError;
    await env.BOT_KV.put(SYSTEM_CONFIG_KEY, JSON.stringify(next));
  }

  return {
    username,
    passwordReady: true,
    passwordMode: 'bootstrap',
    password: bootstrapGeneratedPassword,
    mustChangePassword: true,
    bootstrapExpiresAt: next.ADMIN_BOOTSTRAP_EXPIRES_AT,
    bootstrapNotifyError,
  };
}

async function resendBootstrapPassword(env) {
  ensureKv(env);
  const state = await ensureAdminPasswordState(env);

  if (!state.passwordReady) {
    return {
      ok: false,
      message: '当前还无法生成面板密码，请先确保 BOT_TOKEN 与 ADMIN_CHAT_ID 已正确配置。',
    };
  }

  if (state.passwordMode === 'permanent') {
    return {
      ok: false,
      message: '当前面板已使用永久密码。若你忘记了密码，请执行 /panelreset 重新生成新的临时密码。',
    };
  }

  try {
    await notifyBootstrapPassword(env, state.username, state.password, state.bootstrapExpiresAt);
    const config = await getSystemConfig(env);
    if (config.ADMIN_BOOTSTRAP_NOTIFY_ERROR) {
      delete config.ADMIN_BOOTSTRAP_NOTIFY_ERROR;
      config.updatedAt = new Date().toISOString();
      await env.BOT_KV.put(SYSTEM_CONFIG_KEY, JSON.stringify(config));
    }
  } catch (error) {
    return {
      ok: false,
      message: `临时密码已存在，但发送到 Telegram 失败：${formatErrorMessage(error)}`,
    };
  }
  return {
    ok: true,
    message: `当前有效的临时密码已重新发送到管理员会话。有效期至：${state.bootstrapExpiresAt}`,
  };
}

async function resetBootstrapPassword(env) {
  ensureKv(env);
  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) {
    return {
      ok: false,
      message: '当前还无法重置面板密码，请先确保 BOT_TOKEN 与 ADMIN_CHAT_ID 已正确配置。',
    };
  }

  const config = await getSystemConfig(env);
  const username = getAdminPanelUser(env);
  const bootstrapGeneratedPassword = createBootstrapPassword();
  const expiresAt = new Date(Date.now() + ADMIN_BOOTSTRAP_TTL_MS).toISOString();
  const next = {
    ...config,
    ADMIN_BOOTSTRAP_PASSWORD: bootstrapGeneratedPassword,
    ADMIN_BOOTSTRAP_EXPIRES_AT: expiresAt,
    ADMIN_FORCE_PASSWORD_CHANGE: 'true',
    updatedAt: new Date().toISOString(),
  };

  delete next.ADMIN_PANEL_PASSWORD;
  delete next.ADMIN_BOOTSTRAP_NOTIFY_ERROR;
  await env.BOT_KV.put(SYSTEM_CONFIG_KEY, JSON.stringify(next));
  try {
    await notifyBootstrapPassword(env, username, bootstrapGeneratedPassword, expiresAt);
  } catch (error) {
    next.ADMIN_BOOTSTRAP_NOTIFY_ERROR = formatErrorMessage(error);
    await env.BOT_KV.put(SYSTEM_CONFIG_KEY, JSON.stringify(next));
    return {
      ok: false,
      message: `新的临时密码已生成，但发送到 Telegram 失败：${next.ADMIN_BOOTSTRAP_NOTIFY_ERROR}`,
    };
  }

  return {
    ok: true,
    message: `新的临时密码已生成并发送到管理员会话。有效期至：${expiresAt}`,
  };
}

function buildAdminAuthPayload(passwordState, authenticated = false) {
  return {
    ok: true,
    authenticated,
    username: passwordState.username || 'admin',
    mustChangePassword: authenticated ? Boolean(passwordState.mustChangePassword) : false,
    passwordReady: Boolean(passwordState.passwordReady),
    passwordMode: passwordState.passwordMode || 'none',
    bootstrapExpiresAt: passwordState.bootstrapExpiresAt || null,
    bootstrapNotifyError: passwordState.bootstrapNotifyError || null,
  };
}

async function updateSystemConfig(env, payload) {
  ensureKv(env);
  const existing = await getSystemConfig(env);
  const next = { ...existing };
  const allowed = [
    'VERIFY_EXPIRE_MS',
    'VERIFY_FAIL_BLOCK_MS',
    'VERIFY_TIMEOUT_BLOCK_MS',
    'VERIFY_MAX_FAILURES',
    'VERIFY_MATH_ENABLED',
    'VERIFY_CAPTCHA_ENABLED',
    'BOT_TOKEN',
    'ADMIN_CHAT_ID',
    'ADMIN_IDS',
    'ADMIN_ID',
    'WEBHOOK_SECRET',
    'PUBLIC_BASE_URL',
    'WEBHOOK_PATH',
    'TOPIC_MODE',
    'USER_VERIFICATION',
    'WELCOME_TEXT',
    'BLOCKED_TEXT',
    'ADMIN_API_KEY',
    'ADMIN_PANEL_URL',
    'ADMIN_PANEL_USER',
    'KEYWORD_FILTERS',
  ];

  for (const key of allowed) {
    if (!(key in payload)) continue;
    const value = String(payload[key] ?? '').trim();
    if (!value) {
      delete next[key];
      continue;
    }
    next[key] = value;
  }

  next.updatedAt = new Date().toISOString();
  await env.BOT_KV.put(SYSTEM_CONFIG_KEY, JSON.stringify(next));
  return next;
}

function buildSystemConfigView(config) {
  return {
    BOT_TOKEN: maskSecret(config.BOT_TOKEN),
    ADMIN_CHAT_ID: config.ADMIN_CHAT_ID || '',
    ADMIN_IDS: config.ADMIN_IDS || config.ADMIN_ID || '',
    WEBHOOK_SECRET: maskSecret(config.WEBHOOK_SECRET),
    PUBLIC_BASE_URL: config.PUBLIC_BASE_URL || '',
    WEBHOOK_PATH: config.WEBHOOK_PATH || '',
    TOPIC_MODE: config.TOPIC_MODE || '',
    USER_VERIFICATION: config.USER_VERIFICATION || '',
    VERIFY_EXPIRE_MS: config.VERIFY_EXPIRE_MS || '',
    VERIFY_FAIL_BLOCK_MS: config.VERIFY_FAIL_BLOCK_MS || '',
    VERIFY_TIMEOUT_BLOCK_MS: config.VERIFY_TIMEOUT_BLOCK_MS || '',
    VERIFY_MAX_FAILURES: config.VERIFY_MAX_FAILURES || '',
    VERIFY_MATH_ENABLED: config.VERIFY_MATH_ENABLED || '',
    VERIFY_CAPTCHA_ENABLED: config.VERIFY_CAPTCHA_ENABLED || '',
    WELCOME_TEXT: config.WELCOME_TEXT || '',
    BLOCKED_TEXT: config.BLOCKED_TEXT || '',
    ADMIN_API_KEY: maskSecret(config.ADMIN_API_KEY),
    ADMIN_PANEL_URL: config.ADMIN_PANEL_URL || '',
    ADMIN_PANEL_USER: config.ADMIN_PANEL_USER || '',
    KEYWORD_FILTERS: config.KEYWORD_FILTERS || '',
    updatedAt: config.updatedAt || null,
  };
}

function maskSecret(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length <= 6) return '*'.repeat(raw.length);
  return `${raw.slice(0, 3)}***${raw.slice(-3)}`;
}

function getAdminPanelUser(env) {
  return String(env.ADMIN_PANEL_USER || 'admin').trim() || 'admin';
}

function createSessionToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function createChallengeToken() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `${Date.now().toString(36)}${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function createBootstrapPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

async function notifyBootstrapPassword(env, username, password, expiresAt) {
  const adminChatId = toChatId(env.ADMIN_CHAT_ID);
  const panelUrl = getAdminPanelEntryUrl(env) || await resolveAdminPanelUrl(env);
  const lines = [
    '你的管理面板首次临时密码已生成。',
    `账号：${username || 'admin'}`,
    `临时密码：${password}`,
    `有效期至：${expiresAt}`,
    '请尽快登录并修改为永久密码。',
  ];

  if (panelUrl) {
    lines.splice(1, 0, `面板入口：${panelUrl}`);
  }

  await telegram(env, 'sendMessage', {
    chat_id: adminChatId,
    text: lines.join('\n'),
  });
}

function formatErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function timingSafeEqualText(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a || !b || a.length !== b.length) return false;

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

async function readDeployBootstrapToken(request) {
  const url = new URL(request.url);
  const authorization = request.headers.get('authorization') || '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const headerToken = request.headers.get('x-deploy-bootstrap-token') || '';
  const queryToken = url.searchParams.get('token') || '';
  let bodyToken = '';

  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await request.json();
      bodyToken = String(body?.token || '').trim();
    }
  } catch (error) {
    // ignore malformed optional body
  }

  return String(headerToken || bearerToken || bodyToken || queryToken || '').trim();
}

async function handleDeployBootstrap(request, env, webhookPath, publicBaseUrl) {
  const expectedToken = String(env.DEPLOY_BOOTSTRAP_TOKEN || '').trim();
  if (!expectedToken) {
    throw new AppError(404, 'deploy_bootstrap_disabled');
  }

  const providedToken = await readDeployBootstrapToken(request);
  if (!timingSafeEqualText(providedToken, expectedToken)) {
    throw new AppError(403, 'forbidden');
  }

  ensureEnv(env, ['BOT_TOKEN', 'ADMIN_CHAT_ID']);

  const webhookUrl = `${publicBaseUrl}${webhookPath}`;
  const webhookPayload = { url: webhookUrl };
  if (env.WEBHOOK_SECRET) webhookPayload.secret_token = env.WEBHOOK_SECRET;

  let webhook = null;
  let webhookError = null;
  try {
    webhook = await telegram(env, 'setWebhook', webhookPayload);
  } catch (error) {
    webhookError = formatErrorMessage(error);
  }

  let commands = null;
  let commandsError = null;
  try {
    commands = await syncTelegramCommands(env);
  } catch (error) {
    commandsError = formatErrorMessage(error);
  }

  const passwordState = await ensureAdminPasswordState(env);
  const bootstrapNotifyError = passwordState.bootstrapNotifyError || null;

  return json(
    {
      ok: Boolean(!webhookError && passwordState.passwordReady && !bootstrapNotifyError),
      webhookUrl,
      webhook,
      webhookError,
      commands,
      commandsError,
      passwordReady: Boolean(passwordState.passwordReady),
      passwordMode: passwordState.passwordMode || 'none',
      bootstrapNotifyError,
    },
    200,
    {},
    request,
  );
}

function parseCookies(cookieHeader) {
  const pairs = String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  const cookies = {};
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function buildSessionCookie(token) {
  return `admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${ADMIN_SESSION_TTL_SECONDS}`;
}

function buildExpiredSessionCookie() {
  return 'admin_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0';
}

async function getAdminSession(env, request) {
  if (!env.BOT_KV) return null;
  const cookies = parseCookies(request.headers.get('cookie'));
  const token = cookies.admin_session;
  if (!token) return null;
  return getJson(env.BOT_KV, `${ADMIN_SESSION_PREFIX}${token}`);
}

async function handleAdminAuthMe(request, env) {
  ensureKv(env);
  const passwordState = await ensureAdminPasswordState(env);
  const session = await getAdminSession(env, request);
  const url = new URL(request.url);
  const authorization = request.headers.get('authorization') || '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const key = request.headers.get('x-admin-key') || bearerToken || url.searchParams.get('key') || '';
  const authenticatedByKey = Boolean(env.ADMIN_API_KEY && key && key === env.ADMIN_API_KEY);

  return json(buildAdminAuthPayload(passwordState, authenticatedByKey || Boolean(session)), 200, {}, request);
}

async function handleAdminLogin(request, env) {
  ensureKv(env);
  const body = await readJsonBody(request);
  const username = String(body.username || '').trim() || 'admin';
  const password = String(body.password || '').trim();
  const expectedUser = getAdminPanelUser(env);
  const passwordState = await ensureAdminPasswordState(env);

  if (!passwordState.passwordReady) {
    throw new AppError(500, '请先配置 BOT_TOKEN 与 ADMIN_CHAT_ID，系统会自动生成首次临时密码并发送到管理员会话');
  }

  if (username !== expectedUser || password !== passwordState.password) {
    throw new AppError(401, '账号或密码错误');
  }

  const token = createSessionToken();
  const now = new Date();
  const expireAt = new Date(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000).toISOString();
  await env.BOT_KV.put(
    `${ADMIN_SESSION_PREFIX}${token}`,
    JSON.stringify({
      username,
      loginAt: now.toISOString(),
      expireAt,
    }),
    { expirationTtl: ADMIN_SESSION_TTL_SECONDS },
  );

  return json(
    {
      ...buildAdminAuthPayload(passwordState, true),
      expireAt,
    },
    200,
    {
      'set-cookie': buildSessionCookie(token),
    },
    request,
  );
}

async function handleAdminChangePassword(request, env) {
  ensureKv(env);
  const body = await readJsonBody(request);
  const newPassword = String(body.newPassword || '').trim();

  if (newPassword.length < 6) {
    throw new AppError(400, '新密码至少需要 6 位');
  }

  const current = await getSystemConfig(env);
  const next = {
    ...current,
    ADMIN_PANEL_PASSWORD: newPassword,
    ADMIN_FORCE_PASSWORD_CHANGE: 'false',
    updatedAt: new Date().toISOString(),
  };

  delete next.ADMIN_BOOTSTRAP_PASSWORD;
  delete next.ADMIN_BOOTSTRAP_EXPIRES_AT;
  await env.BOT_KV.put(SYSTEM_CONFIG_KEY, JSON.stringify(next));

  return json(
    {
      ok: true,
      authenticated: true,
      username: getAdminPanelUser(env),
      mustChangePassword: false,
      passwordReady: true,
      passwordMode: 'permanent',
      bootstrapExpiresAt: null,
    },
    200,
    {},
    request,
  );
}

async function handleAdminLogout(request, env) {
  if (env.BOT_KV) {
    const cookies = parseCookies(request.headers.get('cookie'));
    const token = cookies.admin_session;
    if (token) {
      await env.BOT_KV.delete(`${ADMIN_SESSION_PREFIX}${token}`);
    }
  }

  return json(
    { ok: true },
    200,
    {
      'set-cookie': buildExpiredSessionCookie(),
    },
    request,
  );
}

async function requireHttpAdmin(request, env) {
  const url = new URL(request.url);
  const authorization = request.headers.get('authorization') || '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const key = request.headers.get('x-admin-key') || bearerToken || url.searchParams.get('key') || '';

  if (env.ADMIN_API_KEY && key && key === env.ADMIN_API_KEY) {
    return;
  }

  const session = await getAdminSession(env, request);
  if (session) {
    return;
  }

  throw new AppError(401, 'Unauthorized');
}

function getHttpAdminOperator(request) {
  const url = new URL(request.url);
  const authorization = request.headers.get('authorization') || '';
  const hasBearer = authorization.startsWith('Bearer ');
  if (request.headers.get('x-admin-key')) return 'http:x-admin-key';
  if (hasBearer) return 'http:bearer';
  if (url.searchParams.get('key')) return 'http:query';
  return 'http:unknown';
}

function formatAdminOperator(sender) {
  if (!sender) return 'telegram-admin';
  const username = sender.username ? `@${sender.username}` : null;
  const name = [sender.first_name, sender.last_name].filter(Boolean).join(' ').trim() || null;
  return username || name || `telegram:${sender.id || 'unknown'}`;
}

async function isTelegramGroupAdmin(env, chatId, userId) {
  try {
    const member = await telegram(env, 'getChatMember', {
      chat_id: chatId,
      user_id: userId,
    });
    const status = String(member?.status || '').toLowerCase();
    return status === 'creator' || status === 'administrator';
  } catch (error) {
    return false;
  }
}

function isAnonymousAdminMessage(message, adminChatId) {
  if (!message || !message.chat || !message.sender_chat) return false;
  if (message.chat.type === 'private') return false;
  const chatId = Number(message.chat.id);
  const senderChatId = Number(message.sender_chat.id);
  return chatId === Number(adminChatId) && senderChatId === Number(adminChatId);
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (error) {
    throw new AppError(400, '请求体必须是合法 JSON');
  }
}

async function syncTelegramProfile(env, userId, options = {}) {
  const numericUserId = Number(userId);
  const existing = options.existing || (await getUserProfile(env, numericUserId)) || {};
  const nowIso = new Date().toISOString();
  const lastSyncMs = existing?.lastProfileSyncAt ? new Date(existing.lastProfileSyncAt).getTime() : 0;
  const skipRemoteSync =
    !env.BOT_TOKEN ||
    numericUserId <= 0 ||
    (lastSyncMs && Date.now() - lastSyncMs < PROFILE_SYNC_INTERVAL_MS && existing?.profileStatus !== 'error');

  const record = {
    ...existing,
    userId: numericUserId,
    username: options.user?.username || existing?.username || null,
    firstName: options.user?.first_name || options.user?.firstName || existing?.firstName || null,
    lastName: options.user?.last_name || options.user?.lastName || existing?.lastName || null,
    displayName:
      buildDisplayName({
        firstName: options.user?.first_name || options.user?.firstName || existing?.firstName,
        lastName: options.user?.last_name || options.user?.lastName || existing?.lastName,
        username: options.user?.username || existing?.username,
        displayName: existing?.displayName,
        userId: numericUserId,
      }) || existing?.displayName || null,
    chatType: options.chat?.type || existing?.chatType || null,
    profileSource: existing?.profileSource || 'message',
    profileStatus: existing?.profileStatus || 'message-only',
    hasAvatar: Boolean(existing?.hasAvatar),
    avatarFileId: existing?.avatarFileId || null,
    avatarFileUniqueId: existing?.avatarFileUniqueId || null,
    avatarFilePath: existing?.avatarFilePath || null,
    avatarUpdatedAt: existing?.avatarUpdatedAt || null,
    avatarUrl: existing?.avatarUrl || null,
    lastProfileSyncAt: existing?.lastProfileSyncAt || null,
    profileSyncError: existing?.profileSyncError || null,
  };

  if (skipRemoteSync) {
    record.profileStatus = record.profileStatus || 'message-only';
    return record;
  }

  try {
    const photos = await telegram(env, 'getUserProfilePhotos', {
      user_id: numericUserId,
      limit: 1,
    });
    const bestPhoto = extractBestTelegramPhoto(photos);

    if (bestPhoto?.file_id) {
      const file = await telegram(env, 'getFile', { file_id: bestPhoto.file_id });
      const filePath = file?.file_path || null;
      record.hasAvatar = true;
      record.avatarFileId = bestPhoto.file_id;
      record.avatarFileUniqueId = bestPhoto.file_unique_id || null;
      record.avatarFilePath = filePath;
      record.avatarUpdatedAt = nowIso;
      record.avatarUrl = filePath ? buildTelegramAvatarProxyUrl(numericUserId) : record.avatarUrl;
      record.profileStatus = 'complete';
      record.profileSource = 'telegram-api';
    } else {
      record.hasAvatar = false;
      record.avatarFileId = null;
      record.avatarFileUniqueId = null;
      record.avatarFilePath = null;
      record.avatarUpdatedAt = nowIso;
      record.avatarUrl = null;
      record.profileStatus = record.firstName || record.lastName || record.username ? 'partial' : 'message-only';
      record.profileSource = 'telegram-api';
    }

    record.lastProfileSyncAt = nowIso;
    record.profileSyncError = null;
    if (env.BOT_KV) {
      await env.BOT_KV.put(userKey(numericUserId), JSON.stringify(record));
    }
    return record;
  } catch (error) {
    record.lastProfileSyncAt = nowIso;
    record.profileStatus = record.firstName || record.lastName || record.username ? 'partial' : 'error';
    record.profileSyncError = error instanceof Error ? error.message : String(error);
    if (env.BOT_KV) {
      await env.BOT_KV.put(userKey(numericUserId), JSON.stringify(record));
    }
    return record;
  }
}

function extractBestTelegramPhoto(photos) {
  const sets = Array.isArray(photos?.photos) ? photos.photos : [];
  const variants = sets[0] || [];
  return variants[variants.length - 1] || null;
}

function buildDisplayName(profile) {
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (profile?.displayName) return profile.displayName;
  if (profile?.username) return `@${String(profile.username).replace(/^@/, '')}`;
  if (profile?.userId) return `用户 ${profile.userId}`;
  return '';
}

function buildTelegramAvatarProxyUrl(userId) {
  return `${ADMIN_API_PREFIX}/avatar?userId=${encodeURIComponent(String(userId))}`;
}

function buildAdminPanelUrl(env, publicBaseUrl = '') {
  const configured = String(env.ADMIN_PANEL_URL || '').trim();
  if (configured) {
    try {
      return new URL(configured).toString();
    } catch (error) {
      // ignore invalid explicit panel url and continue fallback resolution
    }
  }

  const raw = String(publicBaseUrl || env.PUBLIC_BASE_URL || '').trim();
  if (!raw) {
    return DEFAULT_ADMIN_PANEL_EXTERNAL_URL || ADMIN_PANEL_PATH;
  }

  try {
    const parsed = new URL(raw);
    const origin = parsed.origin;
    if (!origin) return DEFAULT_ADMIN_PANEL_EXTERNAL_URL || ADMIN_PANEL_PATH;
    return `${origin}${ADMIN_PANEL_PATH}`;
  } catch (error) {
    return DEFAULT_ADMIN_PANEL_EXTERNAL_URL || ADMIN_PANEL_PATH;
  }
}

function getAdminPanelEntryUrl(env, publicBaseUrl = '') {
  const raw = String(publicBaseUrl || env.PUBLIC_BASE_URL || '').trim();
  if (!raw) return '';

  try {
    const origin = new URL(raw).origin;
    return `${origin}${ADMIN_PANEL_PATH}`;
  } catch (error) {
    return '';
  }
}

async function resolveAdminPanelUrl(env, publicBaseUrl = '') {
  const directUrl = buildAdminPanelUrl(env, publicBaseUrl);
  if (isAbsoluteHttpUrl(directUrl)) {
    return directUrl;
  }

  if (env.BOT_TOKEN) {
    try {
      const webhookInfo = await telegram(env, 'getWebhookInfo', {});
      const webhookUrl = String(webhookInfo?.url || '').trim();
      if (webhookUrl) {
        const webhookOrigin = new URL(webhookUrl).origin;
        const webhookResolvedUrl = buildAdminPanelUrl(env, webhookOrigin);
        if (isAbsoluteHttpUrl(webhookResolvedUrl)) {
          return webhookResolvedUrl;
        }
      }
    } catch (error) {
      // ignore webhook lookup failures and keep local fallback
    }
  }

  return directUrl;
}

function isAbsoluteHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

async function handleTelegramAvatarProxy(request, env) {
  ensureEnv(env, ['BOT_TOKEN']);
  const url = new URL(request.url);
  const userId = toChatId(url.searchParams.get('userId'));
  const profile = await syncTelegramProfile(env, userId, {
    existing: await getUserProfile(env, userId),
  });
  if (!profile?.avatarFilePath) {
    throw new AppError(404, '该用户暂无可用头像');
  }

  const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${profile.avatarFilePath}`;
  const response = await fetch(fileUrl, {
    headers: {
      accept: 'image/*',
    },
  });

  if (!response.ok) {
    throw new AppError(response.status, '头像拉取失败');
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      'content-type': response.headers.get('content-type') || 'image/jpeg',
      'cache-control': 'private, max-age=3600',
      ...corsHeaders(request),
    },
  });
}

async function telegram(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram API error: ${response.status}`);
  }
  return data.result;
}

async function telegramWithThreadFallback(env, method, payload) {
  try {
    return await telegram(env, method, payload);
  } catch (error) {
    if (!payload?.message_thread_id) throw error;
    const fallbackPayload = { ...payload };
    delete fallbackPayload.message_thread_id;
    return telegram(env, method, fallbackPayload);
  }
}

function ensureEnv(env, keys) {
  for (const key of keys) {
    if (!env[key]) {
      throw new AppError(500, `缺少环境变量：${key}`);
    }
  }
}

function parseIdList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function toChatId(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new AppError(400, 'userId / ADMIN_CHAT_ID 必须是合法数字');
  }
  return num;
}

function normalizeWebhookPath(path) {
  if (!path) return '/webhook';
  return path.startsWith('/') ? path : `/${path}`;
}

function getPublicBaseUrl(url, env) {
  const raw = String(env.PUBLIC_BASE_URL || url.origin).trim();
  try {
    const parsed = new URL(raw);
    return parsed.origin.replace(/\/$/, '');
  } catch (error) {
    throw new AppError(500, 'PUBLIC_BASE_URL 不是合法 URL');
  }
}

function parseLimit(value, fallback) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return fallback;
  return clamp(limit, 1, MAX_LIST_LIMIT);
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value), min), max);
}

function randomInt(min, max) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  const range = high - low + 1;
  if (range <= 0) return low;
  const maxUint = 0xffffffff;
  const limit = maxUint - (maxUint % range);
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return low + (value[0] % range);
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function html(content, status = 200, request = null) {
  return new Response(content, {
    status,
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      ...corsHeaders(request),
    },
  });
}

function json(data, status = 200, extraHeaders = {}, request = null) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      ...corsHeaders(request),
      ...extraHeaders,
    },
  });
}

function corsHeaders(request = null) {
  const origin =
    typeof request === 'string'
      ? request
      : request?.headers?.get?.('origin') || request?.headers?.get?.('Origin') || '';
  const allowOrigin = resolveAllowedOrigin(origin, request);

  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization, X-Admin-Key',
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  };
}

function resolveAllowedOrigin(origin, request = null) {
  const requestOrigin = getRequestOrigin(request);
  const fallback = requestOrigin || origin || '*';
  if (!origin) return fallback;

  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    const requestHost = requestOrigin ? new URL(requestOrigin).hostname.toLowerCase() : '';
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
    const isPages = host.endsWith('.pages.dev');
    const isSameOrigin = Boolean(requestOrigin && url.origin === requestOrigin);
    const isSiblingCustomDomain = Boolean(
      requestHost && getBaseDomain(host) && getBaseDomain(host) === getBaseDomain(requestHost),
    );

    if (isLocalhost || isPages || isSameOrigin || isSiblingCustomDomain) {
      return origin;
    }
  } catch (error) {
    return fallback;
  }

  return fallback;
}

function getRequestOrigin(request = null) {
  try {
    if (request?.url) return new URL(request.url).origin;
  } catch (error) {
    return '';
  }

  return '';
}

function getBaseDomain(host = '') {
  const normalized = String(host || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'localhost' || normalized === '127.0.0.1') return normalized;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) return normalized;

  const parts = normalized.split('.').filter(Boolean);
  if (parts.length < 2) return normalized;
  return parts.slice(-2).join('.');
}

function renderAdminPage(url, env, webhookPath, publicBaseUrl) {
  const info = {
    host: url.host,
    webhookUrl: `${publicBaseUrl}${webhookPath}`,
    adminMode: isTopicModeEnabled(env) ? 'forum-topic' : 'reply-chain',
    userVerificationEnabled: isUserVerificationEnabled(env),
    rootAdmins: getRootAdminIds(env),
    panelUrl: String(env.ADMIN_PANEL_URL || '').trim(),
  };

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>管理面板入口</title>
  <style>
    :root{--bg:#0b1020;--card:#121b36dd;--text:#e6ecff;--muted:#9fb0d8;--line:#2b3d6d;--pri:#5b8cff;--pri-2:#7f6bff;--shadow:0 10px 30px rgba(0,0,0,.35)}
    *{box-sizing:border-box}
    body{margin:0;color:var(--text);background:radial-gradient(1200px 500px at -10% -20%, #2b5bff33 0%, transparent 60%),radial-gradient(900px 500px at 110% -10%, #7f6bff2e 0%, transparent 60%),linear-gradient(160deg,var(--bg),#0d1328 45%, #111936);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,'PingFang SC','Microsoft Yahei',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{width:min(760px,100%);border:1px solid var(--line);background:var(--card);backdrop-filter:blur(6px);border-radius:20px;padding:24px;box-shadow:var(--shadow)}
    .title{font-size:30px;font-weight:800;margin:0 0 12px}
    .desc{color:var(--muted);line-height:1.75;font-size:14px}
    .meta{margin-top:14px;display:flex;flex-wrap:wrap;gap:10px}
    .chip{font-size:12px;color:#d7e2ff;border:1px solid #3d518b;background:#162348;border-radius:999px;padding:6px 12px}
    .actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}
    .btn{display:inline-flex;align-items:center;justify-content:center;min-width:180px;border:0;border-radius:12px;padding:12px 16px;color:white;text-decoration:none;cursor:pointer;background:linear-gradient(135deg,var(--pri),var(--pri-2));font-weight:700;letter-spacing:.2px}
    .btn.secondary{background:#273760}
    .hint{margin-top:16px;color:#c3cff3;font-size:12px;line-height:1.7}
    code{background:#162348;border:1px solid #31467c;border-radius:8px;padding:2px 6px}
  </style>
</head>
<body>
  <div class="card">
      <h1 class="title">管理面板入口</h1>
      <div class="desc">
        当前项目已切换为 <strong>Pages 面板接管</strong> 模式。<br>
        Worker 的 <code>/admin</code> 不再提供完整后台界面，只保留 API 与入口兜底能力。
      </div>
      <div class="meta">
        <span class="chip">域名：${escapeHtml(info.host)}</span>
        <span class="chip">Webhook：${escapeHtml(info.webhookUrl)}</span>
        <span class="chip">模式：${escapeHtml(info.adminMode)}</span>
        <span class="chip">首次验证：${info.userVerificationEnabled ? 'ON' : 'OFF'}</span>
        <span class="chip">根管理员：${escapeHtml((info.rootAdmins || []).join(', ') || '未配置')}</span>
      </div>

      <div class="actions">
        ${info.panelUrl ? `<a class="btn" href="${escapeHtml(info.panelUrl)}">打开 Pages 管理面板</a>` : ''}
        <a class="btn secondary" href="/">查看 Worker 状态</a>
      </div>

      <div class="hint">
        ${info.panelUrl
          ? `当前实例的 Pages 面板地址：<code>${escapeHtml(info.panelUrl)}</code><br>你也可以继续通过 Telegram 命令 <code>/panel</code> 打开这个地址。`
          : '当前尚未配置 <code>ADMIN_PANEL_URL</code>。请先部署 Pages 面板，并在系统配置或运行时变量中填入面板地址。'}
      </div>
  </div>
</body>
</html>`;
}
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
