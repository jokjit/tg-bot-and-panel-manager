export function userKey(userId) {
  return `user:${userId}`;
}

export function blacklistKey(userId) {
  return `blacklist:${userId}`;
}

export function adminKey(userId) {
  return `admin:${userId}`;
}

export function topicUserKey(userId) {
  return `topic:user:${userId}`;
}

export function topicThreadKey(threadId) {
  return `topic:thread:${threadId}`;
}

export function trustKey(userId) {
  return `trust:${userId}`;
}

export function verifyKey(userId) {
  return `verify:${userId}`;
}

export function verificationCacheKey(userId) {
  return String(Number(userId));
}

export function buildGroupAdminMemberCacheKey(chatId, userId) {
  return `${Number(chatId)}:${Number(userId)}`;
}

export function buildMessageHistoryDedupeKey(entry, userId) {
  const messageId = Number(entry?.telegramMessageId || 0);
  const direction = String(entry?.direction || '').trim();
  if (!(Number.isFinite(messageId) && messageId > 0 && direction)) return '';
  return `${Number(userId)}:${direction}:${messageId}`;
}
