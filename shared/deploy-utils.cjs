const DEFAULT_PAGES_PROJECT_NAME = 'tg-admin-panel';
const DEFAULT_PAGES_BRANCH = 'main';
const DEFAULT_WEBHOOK_PATH = '/webhook';
const LEGACY_DEFAULT_PAGES_PANEL_URL = 'https://tg-admin-panel.pages.dev';
const CF_API_BASE = 'https://api.cloudflare.com/client/v4';
const PAGES_MAX_BATCH_BYTES = 20 * 1024 * 1024;
const PAGES_MAX_BATCH_FILES = 500;
const PAGES_MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function buildCfErrorReason(json, status, text = '') {
  const errors = Array.isArray(json?.errors) ? json.errors : [];
  if (errors.length > 0) {
    return errors
      .map((item) => `${item?.code ?? 'unknown'}:${item?.message ?? 'unknown'}`)
      .join('; ');
  }
  if (text) {
    return `http_${status}:${String(text).slice(0, 180)}`;
  }
  return `http_${status}`;
}

function parseCfApiResult(status, text, json) {
  if (json?.success || (status >= 200 && status < 300 && !json?.errors)) {
    return {
      ok: true,
      status,
      result: json?.result ?? null,
      resultInfo: json?.result_info ?? null,
    };
  }

  return {
    ok: false,
    status,
    reason: json ? buildCfErrorReason(json, status, text) : buildCfErrorReason(null, status, text),
    result: json?.result ?? null,
    resultInfo: json?.result_info ?? null,
  };
}

async function cfApiFetch(token, resource, options = {}) {
  const headers = {
    Authorization: `Bearer ${String(token || '').trim()}`,
    ...(options.headers || {}),
  };
  let body = options.body;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && body !== null && typeof body !== 'string' && !isFormData) {
    body = JSON.stringify(body);
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const response = await fetch(`${CF_API_BASE}${resource}`, {
    method: options.method || 'GET',
    headers,
    body,
  });
  const text = await response.text().catch(() => '');
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return parseCfApiResult(response.status, text, json);
}

function normalizeHttpUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  try {
    const normalized = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    const url = new URL(normalized);
    if (!/^https?:$/i.test(url.protocol)) return '';
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function normalizePanelUrl(raw) {
  const normalized = normalizeHttpUrl(raw);
  if (!normalized || normalized === LEGACY_DEFAULT_PAGES_PANEL_URL) return '';
  return normalized;
}

function getUrlOrigin(raw) {
  const normalized = normalizeHttpUrl(raw);
  if (!normalized) return '';
  try {
    return new URL(normalized).origin;
  } catch {
    return '';
  }
}

function buildAdminPanelEntryUrl(workerUrl) {
  const origin = getUrlOrigin(workerUrl);
  return origin ? `${origin}/admin` : '';
}

function buildPanelTargetUrl(panelUrl, workerUrl) {
  const normalizedPanelUrl = normalizePanelUrl(panelUrl) || normalizeHttpUrl(panelUrl);
  if (!normalizedPanelUrl) return '';
  const workerOrigin = getUrlOrigin(workerUrl);
  if (!workerOrigin) return normalizedPanelUrl;

  try {
    const url = new URL(normalizedPanelUrl);
    if (!url.searchParams.get('worker_origin')) {
      url.searchParams.set('worker_origin', workerOrigin);
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return normalizedPanelUrl;
  }
}

function normalizeWebhookPath(value) {
  const text = String(value || '').trim();
  if (!text) return DEFAULT_WEBHOOK_PATH;
  const path = text.startsWith('/') ? text : `/${text}`;
  return path.replace(/\/+$/, '') || DEFAULT_WEBHOOK_PATH;
}

function normalizePagesProjectName(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 58)
    .replace(/-+$/g, '');
}

function suggestPagesProjectName(workerName) {
  const base = normalizePagesProjectName(workerName || 'tg-bot');
  const candidate = normalizePagesProjectName(`${base || 'tg-bot'}-panel`);
  return candidate || 'tg-bot-panel';
}

function normalizePagesBranch(raw) {
  const text = String(raw || '').trim();
  return text || DEFAULT_PAGES_BRANCH;
}

function normalizeWorkerName(raw) {
  return String(raw || '').trim();
}

function normalizeKvNamespaceTitle(raw) {
  return String(raw || '').trim();
}

function normalizeD1DatabaseName(raw) {
  return String(raw || '').trim();
}

function getPagesProjectName(env = {}, params = {}) {
  const fromParams = normalizePagesProjectName(params?.pagesProjectName || params?.projectName || '');
  if (fromParams) return fromParams;
  return normalizePagesProjectName(env.PAGES_PROJECT_NAME || DEFAULT_PAGES_PROJECT_NAME) || DEFAULT_PAGES_PROJECT_NAME;
}

function getPagesDeployBranch(env = {}, params = {}) {
  return normalizePagesBranch(params?.pagesBranch || params?.branch || env.PAGES_BRANCH || DEFAULT_PAGES_BRANCH);
}

function getCustomDomainHost(value) {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return '';
  try {
    const host = new URL(normalized).hostname.toLowerCase();
    if (!host || host.endsWith('.workers.dev') || host.endsWith('.pages.dev')) return '';
    return host;
  } catch {
    return '';
  }
}

function getPagesAssetName(file = {}) {
  return String(file.name || file.path || '').replace(/\\/g, '/');
}

function getPagesMimeType(name) {
  const normalized = String(name || '').replace(/\\/g, '/');
  const match = normalized.match(/\.[^./\\]+$/);
  const ext = match ? match[0].toLowerCase() : '';
  return PAGES_MIME_TYPES[ext] || 'application/octet-stream';
}

function shouldIgnorePagesAsset(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (['_worker.js', '_redirects', '_headers', '_routes.json'].includes(normalized)) return true;
  if (normalized === 'functions' || normalized.startsWith('functions/')) return true;
  return parts.includes('.DS_Store') ||
    parts.includes('node_modules') ||
    parts.includes('.git') ||
    parts.includes('.wrangler');
}

function buildPagesManifest(files) {
  return Object.fromEntries(
    (Array.isArray(files) ? files : []).map((file) => [`/${getPagesAssetName(file)}`, file.hash]),
  );
}

function isPagesUploadAuthError(error) {
  const text = String(error?.message || '');
  return error?.status === 401 || String(error?.code || '') === '8000013' || text.includes('8000013');
}

function normalizeHashListResult(result, fallback = []) {
  if (Array.isArray(result)) return result.map(String);
  if (Array.isArray(result?.hashes)) return result.hashes.map(String);
  return fallback;
}

function buildPagesUploadBatches(files, options = {}) {
  const maxBatchBytes = Number(options.maxBatchBytes || PAGES_MAX_BATCH_BYTES);
  const maxBatchFiles = Number(options.maxBatchFiles || PAGES_MAX_BATCH_FILES);
  const batches = [];
  let current = [];
  let currentBytes = 0;

  for (const file of Array.isArray(files) ? files : []) {
    const sizeInBytes = Number(file?.sizeInBytes || 0);
    const wouldExceedBytes = current.length > 0 && currentBytes + sizeInBytes > maxBatchBytes;
    const wouldExceedCount = current.length >= maxBatchFiles;
    if (wouldExceedBytes || wouldExceedCount) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(file);
    currentBytes += sizeInBytes;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function buildWorkerUploadMetadata(options = {}) {
  const bindings = [];
  const vars = options.vars && typeof options.vars === 'object' ? options.vars : {};
  const varEntries = Object.entries(vars);
  if (options.sortVars) {
    varEntries.sort(([left], [right]) => left.localeCompare(right));
  }

  for (const [key, value] of varEntries) {
    bindings.push({
      type: 'plain_text',
      name: key,
      text: String(value || ''),
    });
  }

  if (options.kvNamespaceId) {
    bindings.push({
      type: 'kv_namespace',
      name: options.kvBindingName || 'BOT_KV',
      namespace_id: options.kvNamespaceId,
    });
  }

  if (options.d1DatabaseId) {
    bindings.push({
      type: 'd1',
      name: options.d1BindingName || 'DB',
      [options.d1BindingField || 'database_id']: options.d1DatabaseId,
    });
  }

  return {
    main_module: options.mainModule || 'worker.js',
    compatibility_date: options.compatibilityDate,
    keep_bindings: options.keepBindings || ['secret_text'],
    bindings,
  };
}

module.exports = {
  CF_API_BASE,
  PAGES_MAX_BATCH_BYTES,
  PAGES_MAX_BATCH_FILES,
  DEFAULT_PAGES_BRANCH,
  DEFAULT_PAGES_PROJECT_NAME,
  DEFAULT_WEBHOOK_PATH,
  LEGACY_DEFAULT_PAGES_PANEL_URL,
  buildCfErrorReason,
  buildAdminPanelEntryUrl,
  buildPanelTargetUrl,
  buildPagesManifest,
  buildPagesUploadBatches,
  buildWorkerUploadMetadata,
  cfApiFetch,
  getCustomDomainHost,
  getPagesMimeType,
  getPagesDeployBranch,
  getPagesProjectName,
  getUrlOrigin,
  isPagesUploadAuthError,
  normalizeD1DatabaseName,
  normalizeHashListResult,
  normalizeHttpUrl,
  normalizeKvNamespaceTitle,
  normalizePagesBranch,
  normalizePagesProjectName,
  normalizePanelUrl,
  normalizeWebhookPath,
  normalizeWorkerName,
  parseCfApiResult,
  shouldIgnorePagesAsset,
  suggestPagesProjectName,
};
