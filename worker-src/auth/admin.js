import { parseIdList } from '../config/values.js';

const ADMIN_META_MODE_NEW_TOPIC = 'new-topic';
const ADMIN_META_MODE_ALWAYS = 'always';
const ADMIN_META_MODE_OFF = 'off';

export function getRootAdminIds(env = {}) {
  const ids = parseIdList(env.ADMIN_IDS || env.ADMIN_ID);
  if (ids.length === 0 && env.ADMIN_CHAT_ID && !String(env.ADMIN_CHAT_ID).startsWith('-')) {
    ids.push(Number(env.ADMIN_CHAT_ID));
  }
  return Array.from(new Set(ids));
}

export function isRootAdmin(env, userId) {
  return getRootAdminIds(env).includes(Number(userId));
}

export function getAdminMetaMode(env = {}) {
  const raw = String(env.ADMIN_META_MODE || ADMIN_META_MODE_NEW_TOPIC).trim().toLowerCase();
  if (['always', 'all', 'every', 'each'].includes(raw)) return ADMIN_META_MODE_ALWAYS;
  if (['off', 'none', 'never', 'silent'].includes(raw)) return ADMIN_META_MODE_OFF;
  return ADMIN_META_MODE_NEW_TOPIC;
}

export function shouldSendUserMetaMessage(env, topicModeEnabled, topicRecord, topicModeActive) {
  if (!topicModeEnabled || !topicModeActive) return true;
  const mode = getAdminMetaMode(env);
  if (mode === ADMIN_META_MODE_ALWAYS) return true;
  if (mode === ADMIN_META_MODE_OFF) return false;
  if (topicRecord?.adminMetaSentAt) return false;
  return Boolean(topicRecord?._createdNow);
}
