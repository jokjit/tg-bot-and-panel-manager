const DEFAULT_PAGES_PROJECT_NAME = 'tg-admin-panel';
const DEFAULT_PAGES_BRANCH = 'main';
const DEFAULT_WEBHOOK_PATH = '/webhook';
const LEGACY_DEFAULT_PAGES_PANEL_URL = 'https://tg-admin-panel.pages.dev';
const CF_API_BASE = 'https://api.cloudflare.com/client/v4';
const PAGES_MAX_BATCH_BYTES = 20 * 1024 * 1024;
const PAGES_MAX_BATCH_FILES = 500;
const IMAGE_CACHE_RULE_DESCRIPTION_PREFIX = 'TG Bot image hosting cache:';
const IMAGE_CACHE_RULE_REF_PREFIX = 'tg_bot_image_host_';
const IMAGE_CACHE_TTL_SECONDS = 365 * 24 * 60 * 60;
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
  if (/^[a-z][a-z\d+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) return '';
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

function normalizeR2BucketName(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
}

function suggestImageBucketName(workerName) {
  const base = normalizeR2BucketName(workerName || 'tg-bot');
  const candidate = normalizeR2BucketName(`${base || 'tg-bot'}-images`);
  return candidate.length >= 3 ? candidate : 'tg-bot-images';
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

function getZoneNameCandidatesForHostname(hostname) {
  const labels = String(hostname || '')
    .toLowerCase()
    .replace(/\.$/, '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
  const candidates = [];
  for (let index = 0; index < labels.length - 1; index += 1) {
    candidates.push(labels.slice(index).join('.'));
  }
  return [...new Set(candidates)];
}

function buildImageCacheRuleRef(hostname) {
  const suffix = String(hostname || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return `${IMAGE_CACHE_RULE_REF_PREFIX}${suffix || 'domain'}`;
}

function buildImageCacheRule(hostname) {
  const normalizedHost = String(hostname || '').trim().toLowerCase();
  if (!normalizedHost || !/^[a-z0-9.-]+$/.test(normalizedHost)) {
    throw new Error(`invalid_image_hostname:${hostname}`);
  }
  return {
    action: 'set_cache_settings',
    action_parameters: {
      cache: true,
      edge_ttl: {
        mode: 'override_origin',
        default: IMAGE_CACHE_TTL_SECONDS,
      },
    },
    expression: `(http.host eq "${normalizedHost}")`,
    description: `${IMAGE_CACHE_RULE_DESCRIPTION_PREFIX} ${normalizedHost}`,
    enabled: true,
    ref: buildImageCacheRuleRef(normalizedHost),
  };
}

async function resolveZoneForHostname(options = {}) {
  const apiRequest = options.apiRequest;
  const accountId = String(options.accountId || '').trim();
  const hostname = String(options.hostname || '').trim().toLowerCase();
  if (typeof apiRequest !== 'function') throw new Error('image_delivery_api_request_required');
  if (!accountId) throw new Error('image_delivery_account_id_required');

  const candidates = getZoneNameCandidatesForHostname(hostname);
  if (candidates.length === 0) throw new Error(`invalid_image_hostname:${hostname}`);

  for (const candidate of candidates) {
    const query = new URLSearchParams({ name: candidate, per_page: '50' });
    const response = await apiRequest(`/zones?${query.toString()}`);
    if (!response?.ok) {
      throw new Error(`image_zone_lookup_failed:${candidate}:${response?.reason || 'unknown'}`);
    }
    const zones = Array.isArray(response.result) ? response.result : [];
    const exact = zones.filter((zone) => String(zone?.name || '').toLowerCase() === candidate);
    const zone = exact.find((item) => String(item?.account?.id || '') === accountId) || exact[0];
    if (zone?.id) {
      return {
        zoneId: String(zone.id),
        zoneName: String(zone.name || candidate),
      };
    }
  }

  throw new Error(`image_zone_not_found:${hostname}; candidates=${candidates.join(',')}`);
}

async function ensureR2CustomDomain(options = {}) {
  const apiRequest = options.apiRequest;
  const accountId = String(options.accountId || '').trim();
  const bucketName = String(options.bucketName || '').trim();
  const hostname = String(options.hostname || '').trim().toLowerCase();
  const zoneId = String(options.zoneId || '').trim();
  if (typeof apiRequest !== 'function') throw new Error('image_delivery_api_request_required');
  if (!accountId || !bucketName || !hostname || !zoneId) {
    throw new Error('image_delivery_domain_parameters_missing');
  }

  const base = `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}/domains/custom`;
  const listed = await apiRequest(base);
  if (!listed?.ok) {
    throw new Error(`image_domain_list_failed:${listed?.reason || 'unknown'}`);
  }
  const domains = Array.isArray(listed.result?.domains) ? listed.result.domains : [];
  const existing = domains.find((item) => String(item?.domain || '').toLowerCase() === hostname);

  if (existing) {
    if (existing.enabled !== false) return { action: 'reused', domain: existing };
    const enabled = await apiRequest(`${base}/${encodeURIComponent(hostname)}`, {
      method: 'PUT',
      body: { enabled: true, minTLS: '1.2' },
    });
    if (!enabled?.ok) {
      throw new Error(`image_domain_enable_failed:${enabled?.reason || 'unknown'}`);
    }
    return { action: 'enabled', domain: enabled.result || existing };
  }

  const created = await apiRequest(base, {
    method: 'POST',
    body: {
      domain: hostname,
      enabled: true,
      zoneId,
      minTLS: '1.2',
    },
  });
  if (!created?.ok) {
    throw new Error(`image_domain_attach_failed:${created?.reason || 'unknown'}`);
  }
  return { action: 'created', domain: created.result || { domain: hostname, enabled: true, zoneId } };
}

async function ensureImageCacheRule(options = {}) {
  const apiRequest = options.apiRequest;
  const zoneId = String(options.zoneId || '').trim();
  const hostname = String(options.hostname || '').trim().toLowerCase();
  if (typeof apiRequest !== 'function') throw new Error('image_delivery_api_request_required');
  if (!zoneId || !hostname) throw new Error('image_cache_rule_parameters_missing');

  const base = `/zones/${encodeURIComponent(zoneId)}/rulesets`;
  const listed = await apiRequest(`${base}?per_page=50`);
  if (!listed?.ok) {
    throw new Error(`image_cache_ruleset_list_failed:${listed?.reason || 'unknown'}`);
  }
  const rulesets = Array.isArray(listed.result) ? listed.result : [];
  const ruleset = rulesets.find((item) => (
    item?.kind === 'zone' && item?.phase === 'http_request_cache_settings'
  ));
  const rule = buildImageCacheRule(hostname);

  if (!ruleset?.id) {
    const created = await apiRequest(base, {
      method: 'POST',
      body: {
        name: 'TG Bot image hosting cache',
        description: 'Cache immutable R2 image assets managed by TG Bot Deploy Tool.',
        kind: 'zone',
        phase: 'http_request_cache_settings',
        rules: [rule],
      },
    });
    if (!created?.ok) {
      throw new Error(`image_cache_ruleset_create_failed:${created?.reason || 'unknown'}`);
    }
    return { action: 'ruleset_created', rulesetId: String(created.result?.id || ''), rule };
  }

  const rulesetId = String(ruleset.id);
  const detail = await apiRequest(`${base}/${encodeURIComponent(rulesetId)}`);
  if (!detail?.ok) {
    throw new Error(`image_cache_ruleset_read_failed:${detail?.reason || 'unknown'}`);
  }
  const rules = Array.isArray(detail.result?.rules) ? detail.result.rules : [];
  const existing = rules.find((item) => (
    item?.ref === rule.ref || item?.description === rule.description
  ));

  if (existing?.id) {
    const updated = await apiRequest(
      `${base}/${encodeURIComponent(rulesetId)}/rules/${encodeURIComponent(String(existing.id))}`,
      { method: 'PATCH', body: rule },
    );
    if (!updated?.ok) {
      throw new Error(`image_cache_rule_update_failed:${updated?.reason || 'unknown'}`);
    }
    return { action: 'updated', rulesetId, ruleId: String(existing.id), rule };
  }

  const created = await apiRequest(`${base}/${encodeURIComponent(rulesetId)}/rules`, {
    method: 'POST',
    body: rule,
  });
  if (!created?.ok) {
    throw new Error(`image_cache_rule_create_failed:${created?.reason || 'unknown'}`);
  }
  return {
    action: 'created',
    rulesetId,
    ruleId: String(created.result?.id || ''),
    rule,
  };
}

async function pollR2CustomDomain(options = {}) {
  const apiRequest = options.apiRequest;
  const accountId = String(options.accountId || '').trim();
  const bucketName = String(options.bucketName || '').trim();
  const hostname = String(options.hostname || '').trim().toLowerCase();
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
  const delays = Array.isArray(options.pollDelaysMs)
    ? options.pollDelaysMs
    : [0, 2000, 5000, 10000, 20000, 30000];
  const resource = `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}/domains/custom/${encodeURIComponent(hostname)}`;
  let lastDomain = null;

  for (const rawDelay of delays) {
    const delay = Math.max(0, Number(rawDelay || 0));
    if (delay > 0) await sleep(delay);
    const response = await apiRequest(resource);
    if (!response?.ok) {
      throw new Error(`image_domain_status_failed:${response?.reason || 'unknown'}`);
    }
    lastDomain = response.result || null;
    const ownership = String(lastDomain?.status?.ownership || 'unknown').toLowerCase();
    const ssl = String(lastDomain?.status?.ssl || 'unknown').toLowerCase();
    if (ownership === 'active' && ssl === 'active' && lastDomain?.enabled !== false) {
      return { active: true, domain: lastDomain };
    }
    if (['blocked', 'error', 'deactivated'].includes(ownership) || ['error', 'deactivated'].includes(ssl)) {
      throw new Error(`image_domain_activation_failed:ownership=${ownership};ssl=${ssl}`);
    }
  }

  return { active: false, domain: lastDomain };
}

async function ensureImageDelivery(options = {}) {
  const imagePublicBaseUrl = normalizeHttpUrl(options.imagePublicBaseUrl);
  if (!imagePublicBaseUrl) {
    return { skipped: true, reason: 'image_public_base_url_empty' };
  }
  const hostname = getCustomDomainHost(imagePublicBaseUrl);
  if (!hostname) throw new Error(`invalid_image_public_base_url:${options.imagePublicBaseUrl || ''}`);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

  try {
    onProgress(`正在识别图床域名所属 Zone：${hostname}`);
    const zone = await resolveZoneForHostname({ ...options, hostname });
    onProgress(`图床 Zone 已识别：${hostname} -> ${zone.zoneName}`);
    const domain = await ensureR2CustomDomain({ ...options, hostname, zoneId: zone.zoneId });
    onProgress(`R2 图床域名已${domain.action === 'created' ? '绑定' : '确认'}：${hostname} -> ${options.bucketName}`);
    const cacheRule = await ensureImageCacheRule({ ...options, hostname, zoneId: zone.zoneId });
    onProgress(`图床边缘缓存规则已${cacheRule.action.includes('created') ? '创建' : '更新'}：${hostname}`);
    const activation = await pollR2CustomDomain({ ...options, hostname });
    if (activation.active) {
      onProgress(`图床域名已激活：https://${hostname}`);
    } else {
      const ownership = activation.domain?.status?.ownership || 'pending';
      const ssl = activation.domain?.status?.ssl || 'pending';
      onProgress(`图床域名仍在 Cloudflare 后台激活中：ownership=${ownership}, ssl=${ssl}`);
    }
    return {
      skipped: false,
      imagePublicBaseUrl,
      hostname,
      ...zone,
      domainAction: domain.action,
      cacheRuleAction: cacheRule.action,
      active: activation.active,
      domainStatus: activation.domain?.status || null,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cloudflare 图床自动配置失败：${reason}。Token 需要 Account/R2 Edit、Zone Read、Zone Cache Rules Edit；部分账户还要求 Zone DNS Edit。`,
    );
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

  if (options.r2BucketName) {
    bindings.push({
      type: 'r2_bucket',
      name: options.r2BindingName || 'IMAGE_BUCKET',
      bucket_name: options.r2BucketName,
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
  IMAGE_CACHE_RULE_DESCRIPTION_PREFIX,
  IMAGE_CACHE_TTL_SECONDS,
  PAGES_MAX_BATCH_BYTES,
  PAGES_MAX_BATCH_FILES,
  DEFAULT_PAGES_BRANCH,
  DEFAULT_PAGES_PROJECT_NAME,
  DEFAULT_WEBHOOK_PATH,
  LEGACY_DEFAULT_PAGES_PANEL_URL,
  buildCfErrorReason,
  buildAdminPanelEntryUrl,
  buildImageCacheRule,
  buildImageCacheRuleRef,
  buildPanelTargetUrl,
  buildPagesManifest,
  buildPagesUploadBatches,
  buildWorkerUploadMetadata,
  cfApiFetch,
  ensureImageCacheRule,
  ensureImageDelivery,
  ensureR2CustomDomain,
  getCustomDomainHost,
  getZoneNameCandidatesForHostname,
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
  normalizeR2BucketName,
  normalizeWebhookPath,
  normalizeWorkerName,
  parseCfApiResult,
  pollR2CustomDomain,
  resolveZoneForHostname,
  shouldIgnorePagesAsset,
  suggestImageBucketName,
  suggestPagesProjectName,
};
