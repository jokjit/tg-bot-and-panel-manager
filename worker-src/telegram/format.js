export function trimText(text, maxLen) {
  const value = String(text || '');
  return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
}

export function formatUserProfile(sender = {}, chat = null) {
  const parts = [];
  const name = [sender.first_name, sender.last_name].filter(Boolean).join(' ').trim();
  if (name) parts.push(`用户：${name}`);
  if (sender.username) parts.push(`@${sender.username}`);
  if (chat?.id) parts.push(`ID:${chat.id}`);
  return parts.join(' | ');
}

export function formatMessagePreview(message = {}) {
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

export function buildFallbackText(message, sender = {}) {
  const header = [
    '📩 新的用户消息（降级文本模式）',
    `#UID:${message.chat.id}`,
    formatUserProfile(sender, message.chat),
  ]
    .filter(Boolean)
    .join('\n');

  return `${header}\n\n${formatMessagePreview(message)}`.trim();
}

export function buildTopicName(sender = {}, chat = {}) {
  const base =
    [sender.first_name, sender.last_name].filter(Boolean).join(' ').trim() ||
    sender.username ||
    `用户 ${chat.id}`;
  return `${base} (${chat.id})`.slice(0, 120);
}

export function buildDisplayName(profile = null) {
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (profile?.displayName) return profile.displayName;
  if (profile?.username) return `@${String(profile.username).replace(/^@/, '')}`;
  if (profile?.userId) return `用户 ${profile.userId}`;
  return '';
}
