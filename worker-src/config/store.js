export function createSystemConfigStore(options = {}, handlers = {}) {
  const key = String(options.key || 'sys:config');
  const ttlMs = Math.max(0, Number(options.ttlMs) || 0);
  let cache = { value: null, expiresAt: 0 };

  function readCache(nowMs = handlers.nowMs?.() ?? Date.now()) {
    if (!cache.value) return null;
    if (!Number.isFinite(cache.expiresAt) || cache.expiresAt <= nowMs) {
      cache = { value: null, expiresAt: 0 };
      return null;
    }
    return { ...cache.value };
  }

  function writeCache(config, nowMs = handlers.nowMs?.() ?? Date.now()) {
    const normalized = config && typeof config === 'object' && !Array.isArray(config)
      ? { ...config }
      : {};
    cache = { value: normalized, expiresAt: nowMs + ttlMs };
    return { ...normalized };
  }

  return {
    async get(env) {
      if (!env?.BOT_KV) return {};
      const cached = readCache();
      if (cached) return cached;

      const data = await handlers.readConfig(env, key);
      return writeCache(data && typeof data === 'object' && !Array.isArray(data) ? data : {});
    },

    async set(env, config) {
      handlers.ensureKv(env);
      const normalized = config && typeof config === 'object' && !Array.isArray(config)
        ? { ...config }
        : {};
      await handlers.writeConfig(env, key, normalized);
      return writeCache(normalized);
    },

    invalidate() {
      cache = { value: null, expiresAt: 0 };
    },
  };
}
