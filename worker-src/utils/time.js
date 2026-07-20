export function parseIsoTimeMs(value) {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function normalizeIsoTime(value) {
  const ms = parseIsoTimeMs(value);
  return ms ? new Date(ms).toISOString() : null;
}
