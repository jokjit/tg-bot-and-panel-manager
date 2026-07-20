import {
  detectMessageType,
  extractMessageText,
  extractPrimaryMediaFileId,
  isIgnoredAdminServiceMessage,
  parseReplyCommand,
} from './message.js';
import { trimText } from './format.js';

const PERMISSION_NOTICE = '未识别到管理员权限，请先确认：\n1) 你的用户 ID 已加入 ADMIN_IDS 或 ADMIN_ID；\n2) 若使用群管理员自动识别，请将机器人设为该管理群管理员后重试。';
const REPLY_FORMAT_NOTICE = '命令格式错误，请使用：/reply 用户ID 内容，或在话题内使用：/r 内容';
const TARGET_NOTICE = '未识别到目标用户。请使用：/reply 用户ID 内容，或在对应用户话题内发送：/r 内容（也可直接回复用户提示消息）。';
const GROUP_TARGET_NOTICE = '未识别到目标用户。请回复包含 #UID 的转发消息，或使用 /reply userId 内容。';

export async function handleAuthorizedAdminMessage(context = {}, handlers = {}) {
  const { message, adminChatId, preAuthorized = null, publicBaseUrl = '', ctx = null } = context;
  const senderId = message.from?.id ? Number(message.from.id) : null;
  const chatId = Number(message.chat.id);
  const hasPreAuthorized = preAuthorized === true || preAuthorized === false;
  let authorized = hasPreAuthorized
    ? preAuthorized
    : senderId
      ? await handlers.isAuthorizedAdmin(senderId)
      : false;

  if (!authorized && handlers.isAnonymousAdminMessage(message, adminChatId)) {
    authorized = true;
  }
  if (!authorized && senderId && chatId === adminChatId && message.chat.type !== 'private') {
    authorized = await handlers.isTelegramGroupAdmin(adminChatId, senderId);
  }

  if (!authorized) {
    const rawText = typeof message?.text === 'string' ? message.text.trim() : '';
    if (/^\/\S+/.test(rawText)) {
      await handlers.sendAdminNotice(message, PERMISSION_NOTICE);
    }
    return;
  }

  if (senderId) {
    await handlers.runNonCriticalTask(ctx, () => handlers.syncTelegramProfile(senderId, {
      user: message.from || {},
      adminChatId,
    }));
  }

  const topicMode = handlers.isTopicModeEnabled();
  const privateRelayAdminIds = topicMode ? [] : await handlers.getPrivateRelayAdminUserIds();
  const isPrivateRelayAdminChat = !topicMode && privateRelayAdminIds.includes(chatId);
  const isGroupAdminChat = message.chat.type !== 'private' && chatId === adminChatId;
  const isAuthorizedPrivateAdminChat = message.chat.type === 'private'
    && (chatId === adminChatId || isPrivateRelayAdminChat || Boolean(senderId && authorized));

  if (!isGroupAdminChat && !isAuthorizedPrivateAdminChat) return;
  if (isIgnoredAdminServiceMessage(message)) return;
  if (await handlers.tryConsumePendingWelcomeSetup(message)) return;

  const defaultTargetUserId = await handlers.resolveAdminTargetUserId(message, adminChatId);
  if (await handlers.handleAdminCommand(message, defaultTargetUserId, publicBaseUrl)) return;

  const parsedCommand = parseReplyCommand(message.text);
  if (parsedCommand) {
    const text = parsedCommand.text?.trim();
    if (!text) {
      await handlers.sendAdminNotice(message, REPLY_FORMAT_NOTICE);
      return;
    }
    const targetUserId = parsedCommand.userId || defaultTargetUserId;
    if (!targetUserId) {
      await handlers.sendAdminNotice(message, TARGET_NOTICE);
      return;
    }
    try {
      await handlers.sendUserMessage(targetUserId, text);
    } catch (error) {
      await handlers.sendAdminNotice(message, `发送给用户失败：${trimText(handlers.formatError(error), 500)}`);
      return;
    }
    await handlers.runNonCriticalTask(ctx, () => handlers.saveMessageHistory({
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
    }));
    return;
  }

  if (!defaultTargetUserId) {
    if (
      (chatId === adminChatId && message.chat.type !== 'private')
      || (message.chat.type === 'private' && isPrivateRelayAdminChat)
    ) {
      await handlers.sendAdminNotice(message, GROUP_TARGET_NOTICE);
    }
    return;
  }

  try {
    await handlers.relayAdminMessageToUser(message, defaultTargetUserId);
  } catch (error) {
    await handlers.sendAdminNotice(message, `发送给用户失败：${trimText(handlers.formatError(error), 500)}`);
    return;
  }
  await handlers.runNonCriticalTask(ctx, () => handlers.saveMessageHistory({
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
  }));
}
