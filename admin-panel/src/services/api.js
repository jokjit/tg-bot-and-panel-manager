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
    return;
  }
  localStorage.setItem(ADMIN_KEY_STORAGE, next);
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

export function fetchAuthState() {
  return api.get('/admin/api/auth/me').then((r) => r.data);
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
    .then((r) => r.data);
}

export function logout() {
  setAdminApiKey('');
  return api.post('/admin/logout').then((r) => r.data);
}

export function fetchStatus() {
  return api.get('/admin/api/status').then((r) => r.data);
}

export function fetchUsers(limit = 50) {
  return api.get('/admin/api/users', { params: { limit } }).then((r) => r.data);
}

export function updateUserAction(payload) {
  return api.post('/admin/api/users/action', payload).then((r) => r.data);
}

export function fetchBlacklist(limit = 50) {
  return api.get('/admin/api/blacklist', { params: { limit } }).then((r) => r.data);
}

export function updateBlacklist(payload) {
  return api.post('/admin/api/blacklist', payload).then((r) => r.data);
}

export function fetchTrust(limit = 50) {
  return api.get('/admin/api/trust', { params: { limit } }).then((r) => r.data);
}

export function updateTrust(payload) {
  return api.post('/admin/api/trust', payload).then((r) => r.data);
}

export function fetchAdmins(limit = 50) {
  return api.get('/admin/api/admins', { params: { limit } }).then((r) => r.data);
}

export function updateAdmins(payload) {
  return api.post('/admin/api/admins', payload).then((r) => r.data);
}

export function fetchSystemConfig() {
  return api.get('/admin/api/system-config').then((r) => r.data);
}

export function saveSystemConfig(payload) {
  return api.post('/admin/api/system-config', payload).then((r) => r.data);
}

export function runMaintenanceCleanup(payload = {}) {
  return api.post('/admin/api/maintenance/cleanup', payload).then((r) => r.data);
}

export function runDeletedAccountSweep(payload = {}) {
  return api.post('/admin/api/maintenance/deleted-account-sweep', payload).then((r) => r.data);
}

export function setWebhook() {
  return api.get('/setWebhook').then((r) => r.data);
}

export function deleteWebhook() {
  return api.get('/deleteWebhook').then((r) => r.data);
}

export function getWebhookInfo() {
  return api.get('/getWebhookInfo').then((r) => r.data);
}

export function syncBotCommands() {
  return api.get('/setCommands').then((r) => r.data);
}

export function sendReply(payload) {
  return api.post('/admin/api/reply', payload).then((r) => r.data);
}

export function fetchHistory(params = {}) {
  return api.get('/admin/api/history', { params }).then((r) => r.data);
}
