import { IMAGE_CONTENT_TYPES, IMAGE_MAX_BYTES, normalizeImageContentType } from '../storage/images.js';
import { normalizeBotCommandText } from './message.js';

export const ADMIN_IMAGE_UPLOAD_TTL_SECONDS = 10 * 60;

const IMAGE_TYPE_NOTICE = '仅支持 JPEG、PNG、WebP 或 GIF 图片，请重新发送。';

export function getAdminImageUploadScopeKey(message = {}) {
  const chatId = Number(message?.chat?.id || 0);
  const adminId = Number(message?.from?.id || 0);
  const threadId = Number(message?.message_thread_id || 0) || 0;
  if (!(Number.isFinite(chatId) && chatId) || !(Number.isFinite(adminId) && adminId > 0)) return '';
  return `${chatId}:${threadId}:${adminId}`;
}

export function getAdminImageUploadCommand(message = {}) {
  if (typeof message?.text !== 'string') return '';
  return normalizeBotCommandText(message.text).split(/\s+/, 1)[0].toLowerCase();
}

export function getTelegramImageDescriptor(message = {}) {
  if (Array.isArray(message?.photo) && message.photo.length) {
    const photo = message.photo[message.photo.length - 1] || {};
    const fileId = String(photo.file_id || '').trim();
    return fileId
      ? {
        fileId,
        fileName: 'telegram-photo.jpg',
        contentType: 'image/jpeg',
        fileSize: Number(photo.file_size || 0) || 0,
      }
      : null;
  }

  const document = message?.document || null;
  if (!document) return null;
  const fileId = String(document.file_id || '').trim();
  const contentType = normalizeImageContentType(document.mime_type);
  if (!fileId || !IMAGE_CONTENT_TYPES.includes(contentType)) return null;
  return {
    fileId,
    fileName: String(document.file_name || 'telegram-image').trim() || 'telegram-image',
    contentType,
    fileSize: Number(document.file_size || 0) || 0,
  };
}

function getUploadFailureNotice(error) {
  const code = error instanceof Error ? error.message : String(error || '');
  if (code === 'image_file_too_large') return `图片不能超过 ${Math.floor(IMAGE_MAX_BYTES / (1024 * 1024))} MB，请重新发送。`;
  if (code === 'image_type_not_allowed' || code === 'image_signature_mismatch') return IMAGE_TYPE_NOTICE;
  if (code === 'telegram_file_missing') return '无法读取 Telegram 图片文件，请重新发送原始图片。';
  if (code === 'telegram_file_download_failed') return '下载 Telegram 图片失败，请稍后重试。';
  return '图片上传失败，请重新发送图片或使用 /cancel 取消。';
}

function buildSession(message, scopeKey, now) {
  const createdAt = now.toISOString();
  return {
    scopeKey,
    chatId: Number(message.chat?.id || 0),
    threadId: Number(message.message_thread_id || 0) || null,
    adminId: Number(message.from?.id || 0),
    createdAt,
    expiresAt: new Date(now.getTime() + ADMIN_IMAGE_UPLOAD_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function tryHandleAdminImageUploadMessage(message, handlers = {}) {
  const scopeKey = getAdminImageUploadScopeKey(message);
  const command = getAdminImageUploadCommand(message);

  if (command === '/upload') {
    if (!scopeKey) {
      await handlers.sendNotice?.('无法识别管理员账号，请使用具名管理员账号发送 /upload。');
      return true;
    }
    if (handlers.isReady && !handlers.isReady()) {
      await handlers.sendNotice?.('图床尚未配置完成，请先部署并初始化 R2、D1 和 KV。');
      return true;
    }
    const now = handlers.now ? handlers.now() : new Date();
    await handlers.setSession(scopeKey, buildSession(message, scopeKey, now));
    await handlers.sendNotice?.('图片上传已开启。请在 10 分钟内发送一张图片；发送 /cancel 可取消。');
    return true;
  }

  if (command === '/cancel') {
    if (!scopeKey) return false;
    const pending = await handlers.getSession(scopeKey);
    if (!pending) return false;
    await handlers.clearSession(scopeKey);
    await handlers.sendNotice?.('已取消本次图片上传。');
    return true;
  }

  if (!scopeKey) return false;
  const pending = await handlers.getSession(scopeKey);
  if (!pending) return false;

  const descriptor = getTelegramImageDescriptor(message);
  if (!descriptor) {
    await handlers.sendNotice?.(`当前处于图片上传状态。${IMAGE_TYPE_NOTICE}发送 /cancel 可取消。`);
    return true;
  }
  if (descriptor.fileSize > IMAGE_MAX_BYTES) {
    await handlers.sendNotice?.(getUploadFailureNotice(new Error('image_file_too_large')));
    return true;
  }

  try {
    const file = await handlers.downloadFile(descriptor);
    const asset = await handlers.store(file, `telegram:${Number(message.from?.id || 0)}`);
    const view = handlers.buildView(asset);
    if (!view?.url) throw new Error('image_public_url_missing');
    await handlers.clearSession(scopeKey);
    await handlers.sendNotice?.(`图片上传成功：\n${view.url}`);
  } catch (error) {
    await handlers.sendNotice?.(getUploadFailureNotice(error));
  }
  return true;
}
