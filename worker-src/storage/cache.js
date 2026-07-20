export const LOCAL_CACHE_MAX_ENTRIES = 2048;

export function readTimedCacheValue(cache, key, nowMs = Date.now()) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (!Number.isFinite(hit.expiresAt) || hit.expiresAt <= nowMs) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

export function writeTimedCacheValue(cache, key, value, ttlMs, nowMs = Date.now()) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
  cache.set(key, { value, expiresAt: nowMs + ttlMs });
  pruneTimedCache(cache, LOCAL_CACHE_MAX_ENTRIES, nowMs);
}

export function pruneTimedCache(cache, maxEntries, nowMs = Date.now()) {
  if (cache.size <= maxEntries) return;
  for (const [key, value] of cache.entries()) {
    if (!value || !Number.isFinite(value.expiresAt) || value.expiresAt <= nowMs) cache.delete(key);
  }
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey === 'undefined') break;
    cache.delete(oldestKey);
  }
}
