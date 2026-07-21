import axios from 'axios';

const WORKER_ORIGIN_QUERY_KEY = 'worker_origin';
const WORKER_ORIGIN_STORAGE_PREFIX = 'tg_admin_worker_origin:';

function normalizeHttpOrigin(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const normalized = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    const url = new URL(normalized);
    if (!/^https?:$/i.test(url.protocol)) return '';
    return url.origin.replace(/\/$/, '');
  } catch (error) {
    return '';
  }
}

function getWorkerOriginStorageKey() {
  if (typeof window === 'undefined') return '';
  const host = String(window.location.host || '').trim().toLowerCase();
  if (!host) return '';
  return `${WORKER_ORIGIN_STORAGE_PREFIX}${host}`;
}

function getStoredWorkerOrigin() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return '';
  const key = getWorkerOriginStorageKey();
  if (!key) return '';
  return normalizeHttpOrigin(localStorage.getItem(key) || '');
}

function setStoredWorkerOrigin(value = '') {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  const key = getWorkerOriginStorageKey();
  if (!key) return;

  const normalized = normalizeHttpOrigin(value);
  if (!normalized) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, normalized);
}

function resolveRuntimeWorkerBaseUrl() {
  if (typeof window === 'undefined') return '';
  const currentOrigin = normalizeHttpOrigin(window.location.origin);
  const search = new URLSearchParams(window.location.search);
  const fromQuery = normalizeHttpOrigin(search.get(WORKER_ORIGIN_QUERY_KEY) || '');
  if (fromQuery) {
    setStoredWorkerOrigin(fromQuery);
    return fromQuery;
  }

  const referrer = normalizeHttpOrigin(document.referrer || '');
  if (referrer && referrer !== currentOrigin) {
    setStoredWorkerOrigin(referrer);
    return referrer;
  }

  const fromStorage = getStoredWorkerOrigin();
  if (fromStorage && fromStorage !== currentOrigin) {
    return fromStorage;
  }

  return currentOrigin;
}

const runtimeOrigin = resolveRuntimeWorkerBaseUrl();
const baseURL = import.meta.env.VITE_WORKER_BASE_URL?.replace(/\/$/, '') || runtimeOrigin;
const ADMIN_KEY_STORAGE = 'tg_admin_api_key';
const apiReadCache = new Map();
const apiInflightReads = new Map();
let apiReadCacheVersion = 0;

const READ_CACHE_TTL = {
  auth: 5 * 1000,
  status: 8 * 1000,
  list: 30 * 1000,
  systemConfig: 30 * 1000,
  history: 8 * 1000,
};

export const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 15000,
});

export function getAdminApiKey() {
  return localStorage.getItem(ADMIN_KEY_STORAGE) || '';
}

export function setAdminApiKey(value) {
  const next = String(value || '').trim();
  if (!next) {
    localStorage.removeItem(ADMIN_KEY_STORAGE);
    clearCachedGets();
    return;
  }
  localStorage.setItem(ADMIN_KEY_STORAGE, next);
  clearCachedGets();
}

export function resolveApiUrl(path = '') {
  const raw = String(path || '').trim();
  if (!raw) return '';

  try {
    return new URL(raw).toString();
  } catch (error) {
    return new URL(raw.replace(/^\//, ''), `${baseURL}/`).toString();
  }
}

export function resolveProtectedMediaUrl(path = '') {
  const resolved = resolveApiUrl(path);
  if (!resolved) return '';

  const key = getAdminApiKey();
  if (!key) return resolved;

  const url = new URL(resolved);
  if (!url.searchParams.has('key')) {
    url.searchParams.set('key', key);
  }
  return url.toString();
}

api.interceptors.request.use((config) => {
  const key = getAdminApiKey();
  if (key) {
    config.headers = config.headers || {};
    config.headers['x-admin-key'] = key;
  }
  return config;
});

api.interceptors.response.use(
  (resp) => resp,
  (error) => {
    const message = error?.response?.data?.error || error?.message || '请求失败';
    return Promise.reject(new Error(message));
  },
);

function normalizeRequestParams(params = {}) {
  const entries = Object.entries(params || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.map(([key, value]) => [key, String(value)]);
}

function buildReadCacheKey(path, params = {}) {
  const query = new URLSearchParams(normalizeRequestParams(params)).toString();
  return query ? `${path}?${query}` : path;
}

function clearCachedGets(prefixes = []) {
  apiReadCacheVersion += 1;
  if (!prefixes.length) {
    apiReadCache.clear();
    apiInflightReads.clear();
    return;
  }

  for (const key of apiReadCache.keys()) {
    if (prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}?`))) {
      apiReadCache.delete(key);
    }
  }
  for (const key of apiInflightReads.keys()) {
    if (prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}?`))) {
      apiInflightReads.delete(key);
    }
  }
}

function cachedGet(path, options = {}) {
  const params = options.params || {};
  const ttlMs = Number(options.ttlMs || 0);
  const force = Boolean(options.force);
  const cacheKey = buildReadCacheKey(path, params);
  const cacheVersion = apiReadCacheVersion;
  const now = Date.now();

  if (!force && ttlMs > 0) {
    const cached = apiReadCache.get(cacheKey);
    if (cached?.expiresAt > now) {
      return Promise.resolve(cached.data);
    }

    const inflight = apiInflightReads.get(cacheKey);
    if (inflight) {
      return inflight;
    }
  }

  const request = api
    .get(path, { params })
    .then((r) => {
      const data = r.data;
      if (ttlMs > 0 && cacheVersion === apiReadCacheVersion) {
        apiReadCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + ttlMs,
        });
      }
      return data;
    })
    .finally(() => {
      apiInflightReads.delete(cacheKey);
    });

  if (ttlMs > 0) {
    apiInflightReads.set(cacheKey, request);
  }
  return request;
}

export function fetchAuthState() {
  return cachedGet('/admin/api/auth/me', { ttlMs: READ_CACHE_TTL.auth });
}

export function loginWithPassword(password) {
  return api
    .post('/admin/login', {
      username: 'admin',
      password: String(password || '').trim(),
    })
    .then((r) => r.data);
}

export function changeAdminPassword(newPassword) {
  return api
    .post('/admin/api/auth/change-password', {
      newPassword: String(newPassword || '').trim(),
    })
    .then((r) => {
      clearCachedGets();
      return r.data;
    });
}

export function logout() {
  setAdminApiKey('');
  return api.post('/admin/logout').then((r) => {
    clearCachedGets();
    return r.data;
  });
}

export function fetchStatus(options = {}) {
  return cachedGet('/admin/api/status', {
    ttlMs: READ_CACHE_TTL.status,
    force: Boolean(options.force),
  });
}

export function fetchUsers(options = 50) {
  const params =
    typeof options === 'object' && options !== null
      ? {
          limit: options.limit,
          offset: options.offset,
        }
      : { limit: options };
  return cachedGet('/admin/api/users', {
    params,
    ttlMs: READ_CACHE_TTL.list,
    force: Boolean(options?.force),
  });
}

export function updateUserAction(payload) {
  return api.post('/admin/api/users/action', payload).then((r) => {
    clearCachedGets(['/admin/api/users', '/admin/api/blacklist', '/admin/api/trust', '/admin/api/admins', '/admin/api/history']);
    return r.data;
  });
}

export function fetchBlacklist(options = 50, requestOptions = {}) {
  const params =
    typeof options === 'object' && options !== null
      ? { limit: options.limit, offset: options.offset }
      : { limit: options };
  return cachedGet('/admin/api/blacklist', {
    params,
    ttlMs: READ_CACHE_TTL.list,
    force: Boolean(options?.force ?? requestOptions.force),
  });
}

export function updateBlacklist(payload) {
  return api.post('/admin/api/blacklist', payload).then((r) => {
    clearCachedGets(['/admin/api/blacklist', '/admin/api/users']);
    return r.data;
  });
}

export function fetchTrust(options = 50, requestOptions = {}) {
  const params =
    typeof options === 'object' && options !== null
      ? { limit: options.limit, offset: options.offset }
      : { limit: options };
  return cachedGet('/admin/api/trust', {
    params,
    ttlMs: READ_CACHE_TTL.list,
    force: Boolean(options?.force ?? requestOptions.force),
  });
}

export function updateTrust(payload) {
  return api.post('/admin/api/trust', payload).then((r) => {
    clearCachedGets(['/admin/api/trust', '/admin/api/users']);
    return r.data;
  });
}

export function fetchAdmins(limit = 50, options = {}) {
  return cachedGet('/admin/api/admins', {
    params: { limit },
    ttlMs: READ_CACHE_TTL.list,
    force: Boolean(options.force),
  });
}

export function updateAdmins(payload) {
  return api.post('/admin/api/admins', payload).then((r) => {
    clearCachedGets(['/admin/api/admins', '/admin/api/status']);
    return r.data;
  });
}

export function fetchSystemConfig(options = {}) {
  return cachedGet('/admin/api/system-config', {
    ttlMs: READ_CACHE_TTL.systemConfig,
    force: Boolean(options.force),
  });
}

export function saveSystemConfig(payload) {
  return api.post('/admin/api/system-config', payload).then((r) => {
    clearCachedGets(['/admin/api/system-config', '/admin/api/status']);
    return r.data;
  });
}

export function runMaintenanceCleanup(payload = {}) {
  return api.post('/admin/api/maintenance/cleanup', payload).then((r) => {
    clearCachedGets(['/admin/api/users', '/admin/api/history']);
    return r.data;
  });
}

export function runDeletedAccountSweep(payload = {}) {
  return api.post('/admin/api/maintenance/deleted-account-sweep', payload).then((r) => {
    clearCachedGets(['/admin/api/users', '/admin/api/history']);
    return r.data;
  });
}

export function runDirectoryIndexBackfill(payload = {}) {
  return api.post('/admin/api/maintenance/directory-index-backfill', payload).then((r) => {
    clearCachedGets(['/admin/api/status', '/admin/api/users', '/admin/api/blacklist', '/admin/api/trust']);
    return r.data;
  });
}

export function setWebhook() {
  return api.get('/setWebhook').then((r) => {
    clearCachedGets(['/admin/api/status']);
    return r.data;
  });
}

export function deleteWebhook() {
  return api.get('/deleteWebhook').then((r) => {
    clearCachedGets(['/admin/api/status']);
    return r.data;
  });
}

export function getWebhookInfo() {
  return api.get('/getWebhookInfo').then((r) => r.data);
}

export function syncBotCommands() {
  return api.get('/setCommands').then((r) => {
    clearCachedGets(['/admin/api/status']);
    return r.data;
  });
}

export function sendReply(payload) {
  return api.post('/admin/api/reply', payload).then((r) => {
    clearCachedGets(['/admin/api/history']);
    return r.data;
  });
}

export function fetchHistory(params = {}, options = {}) {
  return cachedGet('/admin/api/history', {
    params,
    ttlMs: READ_CACHE_TTL.history,
    force: Boolean(options.force),
  });
}

export function fetchImages(options = {}) {
  return cachedGet('/admin/api/images', {
    params: {
      limit: options.limit,
      offset: options.offset,
    },
    ttlMs: READ_CACHE_TTL.list,
    force: Boolean(options.force),
  });
}

export function uploadImage(file) {
  const formData = new FormData();
  formData.set('file', file);
  return api
    .post('/admin/api/images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    })
    .then((r) => {
      clearCachedGets(['/admin/api/images']);
      return r.data;
    });
}

export function deleteImage(id) {
  return api.delete(`/admin/api/images/${encodeURIComponent(String(id || ''))}`).then((r) => {
    clearCachedGets(['/admin/api/images']);
    return r.data;
  });
}

export function uploadWelcomeMedia(type, file) {
  const formData = new FormData();
  formData.set('type', String(type || '').trim());
  formData.set('file', file);
  return api
    .post('/admin/api/welcome-media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => {
      clearCachedGets(['/admin/api/system-config']);
      return r.data;
    });
}
