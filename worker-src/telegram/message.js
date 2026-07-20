export function normalizeBotCommandText(text) {
  return String(text || '')
    .trim()
    .replace(/^\/([a-z0-9_]{1,32})@[a-z0-9_]{3,64}(?=\s|$)/i, '/$1');
}

export function parseReplyCommand(text) {
  if (typeof text !== 'string') return null;
  const withUserId = text.match(/^\/(?:reply|r)\s+(\-?\d+)\s+([\s\S]+)$/i);
  if (withUserId) {
    return { userId: Number(withUserId[1]), text: withUserId[2] };
  }

  const withContext = text.match(/^\/(?:reply|r)\s+([\s\S]+)$/i);
  return withContext ? { userId: null, text: withContext[1] } : null;
}

export function extractTargetUserId(message) {
  if (!message) return null;

  const textPool = [message.text, message.caption].filter(Boolean).join('\n');
  const metaMatch = textPool.match(/#UID:(\-?\d+)/);
  if (metaMatch) return Number(metaMatch[1]);

  const forwardOriginUserId = message.forward_origin?.sender_user?.id;
  if (forwardOriginUserId) return Number(forwardOriginUserId);

  const forwardFromId = message.forward_from?.id;
  if (forwardFromId) return Number(forwardFromId);

  return message.reply_to_message ? extractTargetUserId(message.reply_to_message) : null;
}

export function extractMessageText(message) {
  if (typeof message?.text === 'string') return message.text;
  if (typeof message?.caption === 'string') return message.caption;
  return '';
}

export function extractPrimaryMediaFileId(message) {
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

export function isUserPrivateCommand(message) {
  return typeof message?.text === 'string' && /^\/\S+/.test(String(message.text).trim());
}

export function detectMessageType(message) {
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

export function isIgnoredAdminServiceMessage(message) {
  return Boolean(
    message.forum_topic_created ||
      message.forum_topic_closed ||
      message.forum_topic_reopened ||
      message.general_forum_topic_hidden ||
      message.general_forum_topic_unhidden ||
      message.new_chat_members ||
      message.left_chat_member
  );
}
