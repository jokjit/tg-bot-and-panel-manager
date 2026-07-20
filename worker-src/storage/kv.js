export async function collectKvKeys(kv, prefix, maxKeys = Infinity) {
  const names = [];
  let cursor;
  const limit = Number.isFinite(maxKeys) && maxKeys > 0 ? Math.floor(maxKeys) : Infinity;

  while (names.length < limit) {
    const remaining = limit === Infinity ? 1000 : Math.min(1000, limit - names.length);
    const result = await kv.list({ prefix, ...(cursor ? { cursor } : {}), limit: remaining });
    const pageNames = Array.isArray(result?.keys)
      ? result.keys.map((item) => item.name).filter(Boolean)
      : [];
    names.push(...pageNames);
    if (result.list_complete || !result.cursor || result.cursor === cursor) break;
    cursor = result.cursor;
  }

  return limit === Infinity ? names : names.slice(0, limit);
}
