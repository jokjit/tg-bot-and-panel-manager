export const MAX_LIST_LIMIT = 100;

export function parseIdList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

export function normalizeWebhookPath(path) {
  if (!path) return '/webhook';
  return path.startsWith('/') ? path : `/${path}`;
}

export function parseLimit(value, fallback) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return fallback;
  return clamp(limit, 1, MAX_LIST_LIMIT);
}

export function parseOffset(value, fallback = 0) {
  const offset = Number(value);
  if (!Number.isFinite(offset) || offset < 0) return fallback;
  return Math.floor(offset);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(Number(value), min), max);
}
