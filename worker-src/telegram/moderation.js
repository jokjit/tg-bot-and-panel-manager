export function getKeywordFilters(env) {
  return String(env.KEYWORD_FILTERS || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function matchKeywordFilter(env, message) {
  const keywords = getKeywordFilters(env);
  if (keywords.length === 0) return null;

  const textPool = [message.text, message.caption]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  if (!textPool) return null;

  return keywords.find((item) => textPool.includes(String(item).toLowerCase())) || null;
}
