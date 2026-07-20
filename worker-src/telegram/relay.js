import { telegram, telegramWithThreadFallback } from './api.js';
import { trimText } from './format.js';

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function markTopicMeta(options, sentMeta) {
  if (!options.topicModeActive || typeof options.markTopicMeta !== 'function') return;
  try {
    await options.markTopicMeta(sentMeta);
  } catch {}
}

export async function relayUserMessageToAdmins(options = {}) {
  const send = options.send || telegram;
  const sendWithThreadFallback = options.sendWithThreadFallback || telegramWithThreadFallback;
  let delivered = false;
  let lastError = null;

  for (const relayChatId of options.relayChatIds || []) {
    let forwarded;
    try {
      forwarded = await sendWithThreadFallback(options.env, 'forwardMessage', {
        chat_id: relayChatId,
        from_chat_id: options.message.chat.id,
        message_id: options.message.message_id,
        message_thread_id: options.messageThreadId || undefined,
      });
      delivered = true;
    } catch {
      try {
        forwarded = await sendWithThreadFallback(options.env, 'sendMessage', {
          chat_id: relayChatId,
          text: options.fallbackText,
          message_thread_id: options.messageThreadId || undefined,
        });
        delivered = true;
      } catch (fallbackError) {
        lastError = fallbackError;
        continue;
      }
    }

    if (!options.shouldSendMeta) continue;
    try {
      const sentMeta = await sendWithThreadFallback(options.env, 'sendMessage', {
        chat_id: relayChatId,
        text: options.metaText,
        message_thread_id: options.messageThreadId || undefined,
        reply_to_message_id: forwarded.message_id,
        reply_markup: options.replyMarkup,
      });
      await markTopicMeta(options, sentMeta);
    } catch (error) {
      try {
        const sentMeta = await send(options.env, 'sendMessage', {
          chat_id: relayChatId,
          text: `${options.metaText}\n\n提示：元信息补发失败：${trimText(formatError(error), 300)}`,
          reply_markup: options.replyMarkup,
        });
        await markTopicMeta(options, sentMeta);
      } catch (fallbackError) {
        lastError = fallbackError;
      }
    }
  }

  return { delivered, lastError };
}

export async function relayAdminMessageToUser(message, env, targetUserId, send = telegram) {
  if (typeof message.text === 'string' && !message.text.startsWith('/')) {
    return send(env, 'sendMessage', { chat_id: targetUserId, text: message.text });
  }

  const media = [
    ['photo', 'sendPhoto', 'photo', message.photo?.at(-1)?.file_id],
    ['document', 'sendDocument', 'document', message.document?.file_id],
    ['video', 'sendVideo', 'video', message.video?.file_id],
    ['animation', 'sendAnimation', 'animation', message.animation?.file_id],
    ['audio', 'sendAudio', 'audio', message.audio?.file_id],
    ['voice', 'sendVoice', 'voice', message.voice?.file_id],
  ];
  const matched = media.find(([type, , , fileId]) => type === 'photo' ? message.photo?.length : fileId);
  if (matched) {
    const [, method, field, fileId] = matched;
    return send(env, method, {
      chat_id: targetUserId,
      [field]: fileId,
      caption: message.caption || undefined,
    });
  }

  if (message.video_note) {
    return send(env, 'sendVideoNote', { chat_id: targetUserId, video_note: message.video_note.file_id });
  }
  if (message.sticker) {
    return send(env, 'sendSticker', { chat_id: targetUserId, sticker: message.sticker.file_id });
  }
  if (message.contact) {
    return send(env, 'sendContact', {
      chat_id: targetUserId,
      phone_number: message.contact.phone_number,
      first_name: message.contact.first_name,
      last_name: message.contact.last_name || undefined,
      vcard: message.contact.vcard || undefined,
    });
  }
  if (message.location) {
    return send(env, 'sendLocation', {
      chat_id: targetUserId,
      latitude: message.location.latitude,
      longitude: message.location.longitude,
    });
  }
  if (message.text?.startsWith('/')) return undefined;
  return send(env, 'sendMessage', {
    chat_id: targetUserId,
    text: '管理员发送了一条当前机器人暂未适配的消息类型。',
  });
}
