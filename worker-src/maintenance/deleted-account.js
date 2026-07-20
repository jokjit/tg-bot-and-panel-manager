import { telegram } from '../telegram/api.js';
import { normalizeDeletedAccountMarker } from './config.js';

function formatErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function probeDeletedTelegramUser(env, userId, send = telegram) {
  try {
    const chat = await send(env, 'getChat', { chat_id: userId });
    const marker = normalizeDeletedAccountMarker(chat?.first_name || chat?.title || chat?.description || '');
    const deletedByMarker = marker.includes('deleted account') || marker === 'deleted';
    return {
      deleted: deletedByMarker,
      reason: deletedByMarker ? 'deleted_marker' : 'active',
      chat,
    };
  } catch (error) {
    const message = formatErrorMessage(error);
    if (message.toLowerCase().includes('deactivated')) {
      return { deleted: true, reason: 'deactivated_error', error: message };
    }
    return { deleted: false, reason: 'probe_failed', error: message };
  }
}
