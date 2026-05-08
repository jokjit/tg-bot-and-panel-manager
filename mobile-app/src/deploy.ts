import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';
const STORAGE_KEY = 'tg_bot_mobile_deploy_config_v2';
const ASSET_PREFIX = '/deploy-assets';
const PANEL_ASSET_PREFIX = `${ASSET_PREFIX}/admin-panel`;
const DEFAULT_KV_NAMESPACE_TITLE = 'tg-bot-kv';
const DEFAULT_D1_DATABASE_NAME = 'tg-bot-history';
const DEFAULT_PAGES_BRANCH = 'main';

export interface DeployFormState {
  cfApiToken: string;
  cfAccountId: string;
  workerName: string;
  kvNamespaceTitle: string;
  d1DatabaseName: string;
  botToken: string;
  adminChatId: string;
  workerUrl: string;
  verifyPublicBaseUrl: string;
  panelUrl: string;
  deployPanel: boolean;
  pagesProjectName: string;
  pagesBranch: string;
}

export interface DeployRunResult {
  workerName: string;
  workerUrl: string;
  verifyPublicBaseUrl: string;
  kvNamespaceId: string;
  d1DatabaseId: string;
  webhookUrl: string;
  panelUrl: string;
  panelEntryUrl: string;
  pagesProjectName: string;
  bootstrapOk: boolean;
  bootstrapReason: string;
}

interface PanelAssetMeta {
  path: string;
  hash: string;
  contentType: string;
  sizeInBytes: number;
}

interface BundleAssets {
  workerCode: string;
  compatibilityDate: string;
  defaultWorkerName: string;
  defaultVars: Record<string, string>;
  migrations: Array<{ name: string; sql: string }>;
  panelAssets: PanelAssetMeta[];
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  jsonBody?: unknown;
  textBody?: string;
  timeoutMs?: number;
}

interface RequestResult {
  status: number;
  text: string;
  json: any;
}

interface CfResult<T = any> {
  ok: boolean;
  status: number;
  result: T | null;
  reason: string;
  resultInfo: any;
}

interface PageProjectResult {
  ok: boolean;
  reason: string;
  project: any;
}

interface PageDeployResult {
  ok: boolean;
  id: string;
  url: string;
  method: string;
  reason: string;
  warning: string;
}

let bundleAssetsPromise: Promise<BundleAssets> | null = null;

function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(text);
}

function normalizeHttpUrl(value: string): string {
  const text = String(value || '').trim();
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

function normalizeWebhookPath(value: string): string {
  const text = String(value || '').trim();
  if (!text) return '/webhook';
  const path = text.startsWith('/') ? text : `/${text}`;
  return path.replace(/\/+$/, '') || '/webhook';
}

function normalizePagesProjectName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 58)
    .replace(/-+$/g, '');
}

function suggestPagesProjectName(workerName: string): string {
  const base = normalizePagesProjectName(workerName || 'tg-bot');
  const candidate = normalizePagesProjectName(`${base || 'tg-bot'}-panel`);
  return candidate || 'tg-bot-panel';
}

function getUrlOrigin(value: string): string {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return '';
  try {
    return new URL(normalized).origin;
  } catch {
    return '';
  }
}

function buildAdminPanelEntryUrl(workerUrl: string): string {
  const origin = getUrlOrigin(workerUrl);
  return origin ? `${origin}/admin` : '';
}

function getCustomDomainHost(value: string): string {
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

function buildCfErrorReason(json: any, status: number, text = ''): string {
  const errors = Array.isArray(json?.errors) ? json.errors : [];
  if (errors.length > 0) {
    return errors
      .map((item: any) => `${item?.code ?? 'unknown'}:${item?.message ?? 'unknown'}`)
      .join('; ');
  }
  if (text) {
    return `http_${status}:${text.slice(0, 180)}`;
  }
  return `http_${status}`;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (item) => item.toString(16).padStart(2, '0')).join('');
}

function sanitizeWorkersSubdomain(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
}

function decodeJwtPayload(token: string): any {
  const payload = String(token || '').split('.')[1] || '';
  const padded = payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - payload.length % 4) % 4);
  return JSON.parse(atob(padded));
}

function isPagesUploadTokenExpired(token: string): boolean {
  try {
    return Number(decodeJwtPayload(token).exp || 0) <= Date.now() / 1000;
  } catch {
    return false;
  }
}

function maxPagesFileCountFromClaims(token: string): number {
  try {
    const maxFileCountAllowed = decodeJwtPayload(token).max_file_count_allowed;
    return typeof maxFileCountAllowed === 'number' ? maxFileCountAllowed : 20000;
  } catch {
    return 20000;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function request(url: string, options: RequestOptions = {}): Promise<RequestResult> {
  const method = options.method || 'GET';
  const timeoutMs = options.timeoutMs || 30000;
  const headers: Record<string, string> = { ...(options.headers || {}) };

  if (options.jsonBody !== undefined && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (isNativePlatform()) {
    const response = await CapacitorHttp.request({
      method,
      url,
      headers,
      data: options.jsonBody !== undefined ? options.jsonBody : options.textBody,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
    });

    if (typeof response.data === 'string') {
      const text = response.data;
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { status: response.status, text, json };
    }

    if (response.data === undefined || response.data === null) {
      return { status: response.status, text: '', json: null };
    }

    return {
      status: response.status,
      text: JSON.stringify(response.data),
      json: response.data,
    };
  }

  const response = await fetch(url, {
    method,
    headers,
    body: options.jsonBody !== undefined
      ? JSON.stringify(options.jsonBody)
      : options.textBody,
  });

  const text = await response.text().catch(() => '');
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    status: response.status,
    text,
    json,
  };
}

async function cfApi<T>(
  token: string,
  accountId: string,
  path: string,
  options: RequestOptions = {},
): Promise<CfResult<T>> {
  void accountId;
  const response = await request(`${CF_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const json = response.json;
  if (json?.success || (response.status >= 200 && response.status < 300 && !json?.errors)) {
    return {
      ok: true,
      status: response.status,
      result: (json?.result ?? null) as T,
      reason: '',
      resultInfo: json?.result_info ?? null,
    };
  }

  return {
    ok: false,
    status: response.status,
    result: (json?.result ?? null) as T,
    reason: buildCfErrorReason(json, response.status, response.text),
    resultInfo: json?.result_info ?? null,
  };
}

async function fetchAssetText(path: string): Promise<string> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`读取打包资源失败: ${path} (${response.status})`);
  }
  return response.text();
}

async function fetchAssetJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`读取打包资源失败: ${path} (${response.status})`);
  }
  return response.json() as Promise<T>;
}

async function fetchAssetArrayBuffer(path: string): Promise<ArrayBuffer> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`读取打包资源失败: ${path} (${response.status})`);
  }
  return response.arrayBuffer();
}

function extractTomlString(text: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matched = text.match(new RegExp(`^\\s*${escaped}\\s*=\\s*"([^"]*)"\\s*$`, 'm'));
  return matched ? matched[1].trim() : '';
}

function unescapeTomlQuotedText(value: string): string {
  return String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function parseWranglerVars(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const lines = content.replace(/\r/g, '').split('\n');
  let inVars = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inVars) {
      if (trimmed === '[vars]') inVars = true;
      continue;
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      break;
    }
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const matched = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*"(.*)"\s*$/);
    if (!matched) continue;
    vars[matched[1]] = unescapeTomlQuotedText(matched[2]);
  }

  return vars;
}

async function loadBundleAssets(): Promise<BundleAssets> {
  if (!bundleAssetsPromise) {
    bundleAssetsPromise = (async () => {
      const [workerCode, wranglerToml] = await Promise.all([
        fetchAssetText(`${ASSET_PREFIX}/worker.js`),
        fetchAssetText(`${ASSET_PREFIX}/wrangler.toml`),
      ]);

      let migrationFiles: string[] = [];
      try {
        const manifest = await fetchAssetJson<{ files?: string[] }>(`${ASSET_PREFIX}/migrations.json`);
        migrationFiles = Array.isArray(manifest.files)
          ? manifest.files.map((item) => String(item || '').trim()).filter(Boolean)
          : [];
      } catch {
        migrationFiles = [];
      }

      const migrations = await Promise.all(
        migrationFiles.map(async (name) => ({
          name,
          sql: await fetchAssetText(`${ASSET_PREFIX}/migrations/${name}`),
        })),
      );

      let panelAssets: PanelAssetMeta[] = [];
      try {
        const panelManifest = await fetchAssetJson<{ files?: PanelAssetMeta[] }>(`${ASSET_PREFIX}/panel-assets.json`);
        panelAssets = Array.isArray(panelManifest.files)
          ? panelManifest.files
            .map((item) => ({
              path: String(item?.path || '').replace(/^\/+/, ''),
              hash: String(item?.hash || '').trim(),
              contentType: String(item?.contentType || 'application/octet-stream').trim(),
              sizeInBytes: Number(item?.sizeInBytes || 0),
            }))
            .filter((item) => item.path && item.hash && Number.isFinite(item.sizeInBytes) && item.sizeInBytes >= 0)
          : [];
      } catch {
        panelAssets = [];
      }

      const defaultWorkerName = extractTomlString(wranglerToml, 'name') || 'telegram-private-chatbot';
      const compatibilityDate = extractTomlString(wranglerToml, 'compatibility_date') || '2026-04-16';
      const defaultVars = parseWranglerVars(wranglerToml);

      return {
        workerCode,
        compatibilityDate,
        defaultWorkerName,
        defaultVars,
        migrations,
        panelAssets,
      };
    })();
  }

  return bundleAssetsPromise;
}

function sanitizeFormState(input: Partial<DeployFormState>): DeployFormState {
  const workerName = String(input.workerName || '').trim();
  return {
    cfApiToken: String(input.cfApiToken || '').trim(),
    cfAccountId: String(input.cfAccountId || '').trim(),
    workerName,
    kvNamespaceTitle: String(input.kvNamespaceTitle || '').trim(),
    d1DatabaseName: String(input.d1DatabaseName || '').trim(),
    botToken: String(input.botToken || '').trim(),
    adminChatId: String(input.adminChatId || '').trim(),
    workerUrl: String(input.workerUrl || '').trim(),
    verifyPublicBaseUrl: String(input.verifyPublicBaseUrl || '').trim(),
    panelUrl: String(input.panelUrl || '').trim(),
    deployPanel: normalizeBoolean(input.deployPanel, true),
    pagesProjectName: normalizePagesProjectName(String(input.pagesProjectName || '').trim()) || suggestPagesProjectName(workerName),
    pagesBranch: String(input.pagesBranch || '').trim() || DEFAULT_PAGES_BRANCH,
  };
}

export async function createDefaultFormState(): Promise<DeployFormState> {
  const assets = await loadBundleAssets();
  const workerName = assets.defaultWorkerName;
  return {
    cfApiToken: '',
    cfAccountId: '',
    workerName,
    kvNamespaceTitle: DEFAULT_KV_NAMESPACE_TITLE,
    d1DatabaseName: DEFAULT_D1_DATABASE_NAME,
    botToken: '',
    adminChatId: '',
    workerUrl: '',
    verifyPublicBaseUrl: '',
    panelUrl: '',
    deployPanel: true,
    pagesProjectName: suggestPagesProjectName(workerName),
    pagesBranch: DEFAULT_PAGES_BRANCH,
  };
}

export async function loadSavedFormState(): Promise<Partial<DeployFormState>> {
  try {
    let raw = '';
    if (isNativePlatform()) {
      const response = await Preferences.get({ key: STORAGE_KEY });
      raw = String(response.value || '');
    } else {
      raw = String(localStorage.getItem(STORAGE_KEY) || '');
    }
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return sanitizeFormState(parsed);
  } catch {
    return {};
  }
}

export async function saveFormState(state: DeployFormState): Promise<void> {
  const payload = JSON.stringify(sanitizeFormState(state));
  if (isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: payload });
  } else {
    localStorage.setItem(STORAGE_KEY, payload);
  }
}

async function listKvNamespaces(token: string, accountId: string): Promise<Array<{ id: string; title: string }>> {
  const items: Array<{ id: string; title: string }> = [];
  let totalPages = 1;

  for (let page = 1; page <= totalPages && page <= 10; page += 1) {
    const query = new URLSearchParams({ page: String(page), per_page: '100' });
    const response = await cfApi<any[]>(token, accountId, `/accounts/${accountId}/storage/kv/namespaces?${query.toString()}`);
    if (!response.ok) {
      throw new Error(`KV namespace 列表读取失败: ${response.reason}`);
    }

    for (const item of Array.isArray(response.result) ? response.result : []) {
      const id = String(item?.id || '').trim();
      const title = String(item?.title || '').trim();
      if (id && title) items.push({ id, title });
    }

    totalPages = Number(response.resultInfo?.total_pages || 1);
  }

  return items;
}

async function ensureKvNamespace(
  token: string,
  accountId: string,
  namespaceTitle: string,
  onLog: (text: string) => void,
): Promise<{ namespaceId: string }> {
  onLog('正在初始化 KV 命名空间...');
  let namespaces = await listKvNamespaces(token, accountId);
  let found = namespaces.find((item) => item.title === namespaceTitle);

  if (!found) {
    const created = await cfApi<{ id: string; title: string }>(token, accountId, `/accounts/${accountId}/storage/kv/namespaces`, {
      method: 'POST',
      jsonBody: { title: namespaceTitle },
    });

    if (!created.ok) {
      if (!/already exists|10013|10014/i.test(created.reason)) {
        throw new Error(`KV namespace 创建失败: ${created.reason}`);
      }
      namespaces = await listKvNamespaces(token, accountId);
      found = namespaces.find((item) => item.title === namespaceTitle);
    } else if (created.result?.id) {
      found = { id: String(created.result.id), title: namespaceTitle };
    }
  }

  if (!found?.id) {
    throw new Error(`找不到 KV namespace id: ${namespaceTitle}`);
  }

  onLog(`KV 就绪: ${namespaceTitle} (${found.id})`);
  return { namespaceId: found.id };
}

function getD1DatabaseId(item: any): string {
  return String(item?.uuid || item?.id || item?.database_id || '').trim();
}

async function listD1Databases(token: string, accountId: string): Promise<Array<{ id: string; name: string }>> {
  const items: Array<{ id: string; name: string }> = [];
  let totalPages = 1;

  for (let page = 1; page <= totalPages && page <= 10; page += 1) {
    const query = new URLSearchParams({ page: String(page), per_page: '100' });
    const response = await cfApi<any[]>(token, accountId, `/accounts/${accountId}/d1/database?${query.toString()}`);
    if (!response.ok) {
      throw new Error(`D1 数据库列表读取失败: ${response.reason}`);
    }

    for (const item of Array.isArray(response.result) ? response.result : []) {
      const id = getD1DatabaseId(item);
      const name = String(item?.name || '').trim();
      if (id && name) items.push({ id, name });
    }

    totalPages = Number(response.resultInfo?.total_pages || 1);
  }

  return items;
}

async function executeD1Sql(token: string, accountId: string, databaseId: string, sql: string): Promise<any> {
  const response = await cfApi<any>(
    token,
    accountId,
    `/accounts/${accountId}/d1/database/${encodeURIComponent(databaseId)}/query`,
    {
      method: 'POST',
      jsonBody: { sql },
    },
  );

  if (!response.ok) {
    throw new Error(`D1 SQL 执行失败: ${response.reason}`);
  }
  return response.result;
}

function escapeSqlString(value: string): string {
  return String(value || '').replaceAll("'", "''");
}

async function applyMigrations(
  token: string,
  accountId: string,
  databaseId: string,
  migrations: Array<{ name: string; sql: string }>,
  onLog: (text: string) => void,
): Promise<void> {
  if (migrations.length === 0) {
    onLog('未找到迁移文件，跳过 D1 migration。');
    return;
  }

  await executeD1Sql(
    token,
    accountId,
    databaseId,
    `CREATE TABLE IF NOT EXISTS d1_migrations(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );`,
  );

  const listed = await executeD1Sql(token, accountId, databaseId, 'SELECT name FROM d1_migrations ORDER BY id');
  const rows = Array.isArray(listed?.[0]?.results)
    ? listed[0].results
    : Array.isArray(listed?.results)
      ? listed.results
      : [];
  const existing = new Set(rows.map((row: any) => String(row?.name || '').trim()).filter(Boolean));

  for (const migration of migrations) {
    if (existing.has(migration.name)) continue;
    const sql = String(migration.sql || '').trim();
    if (!sql) continue;

    const statement = `${sql.replace(/\s+$/, '')}\n\nINSERT INTO d1_migrations (name) VALUES ('${escapeSqlString(migration.name)}');`;
    await executeD1Sql(token, accountId, databaseId, statement);
    onLog(`D1 migration 已执行: ${migration.name}`);
  }
}

async function ensureD1Database(
  token: string,
  accountId: string,
  databaseName: string,
  migrations: Array<{ name: string; sql: string }>,
  onLog: (text: string) => void,
): Promise<{ databaseId: string }> {
  onLog('正在初始化 D1 数据库...');

  let databases = await listD1Databases(token, accountId);
  let found = databases.find((item) => item.name === databaseName);

  if (!found) {
    const created = await cfApi<any>(token, accountId, `/accounts/${accountId}/d1/database`, {
      method: 'POST',
      jsonBody: { name: databaseName },
    });

    if (!created.ok) {
      if (!/already exists|10013|10014|7502/i.test(created.reason)) {
        throw new Error(`D1 数据库创建失败: ${created.reason}`);
      }
      databases = await listD1Databases(token, accountId);
      found = databases.find((item) => item.name === databaseName);
    } else {
      const id = getD1DatabaseId(created.result);
      if (id) found = { id, name: databaseName };
    }
  }

  if (!found?.id) {
    throw new Error(`找不到 D1 database id: ${databaseName}`);
  }

  onLog(`D1 就绪: ${databaseName} (${found.id})`);
  await applyMigrations(token, accountId, found.id, migrations, onLog);
  return { databaseId: found.id };
}

function buildWorkerUploadMetadata(options: {
  compatibilityDate: string;
  vars: Record<string, string>;
  namespaceId: string;
  databaseId: string;
}): Record<string, unknown> {
  const bindings: Array<Record<string, unknown>> = [];
  const sortedKeys = Object.keys(options.vars).sort((a, b) => a.localeCompare(b));

  for (const key of sortedKeys) {
    bindings.push({
      type: 'plain_text',
      name: key,
      text: String(options.vars[key] || ''),
    });
  }

  bindings.push({ type: 'kv_namespace', name: 'BOT_KV', namespace_id: options.namespaceId });
  bindings.push({ type: 'd1', name: 'DB', database_id: options.databaseId });

  return {
    main_module: 'worker.js',
    compatibility_date: options.compatibilityDate,
    keep_bindings: ['secret_text'],
    bindings,
  };
}

function buildMultipartBody(parts: Array<{
  name: string;
  contentType: string;
  value: string;
  filename?: string;
}>): { boundary: string; body: string } {
  const boundary = `----tg-bot-${Date.now()}-${randomHex(6)}`;
  const chunks: string[] = [];

  for (const part of parts) {
    chunks.push(`--${boundary}`);
    if (part.filename) {
      chunks.push(`Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"`);
    } else {
      chunks.push(`Content-Disposition: form-data; name="${part.name}"`);
    }
    chunks.push(`Content-Type: ${part.contentType}`);
    chunks.push('');
    chunks.push(part.value);
  }

  chunks.push(`--${boundary}--`);
  chunks.push('');
  return {
    boundary,
    body: chunks.join('\r\n'),
  };
}

async function uploadWorker(
  token: string,
  accountId: string,
  workerName: string,
  workerCode: string,
  metadata: Record<string, unknown>,
  onLog: (text: string) => void,
): Promise<void> {
  const { boundary, body } = buildMultipartBody([
    {
      name: 'metadata',
      contentType: 'application/json',
      value: JSON.stringify(metadata),
    },
    {
      name: 'worker.js',
      filename: 'worker.js',
      contentType: 'application/javascript+module',
      value: workerCode,
    },
  ]);

  const response = await cfApi<any>(
    token,
    accountId,
    `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      textBody: body,
      timeoutMs: 120000,
    },
  );

  if (!response.ok) {
    throw new Error(`Worker 上传失败: ${response.reason}`);
  }

  onLog(`Worker 上传完成: ${workerName}`);
}

async function ensureWorkersAccountSubdomain(
  token: string,
  accountId: string,
  onLog: (text: string) => void,
): Promise<string> {
  const current = await cfApi<any>(token, accountId, `/accounts/${accountId}/workers/subdomain`);
  const currentSubdomain = String(current.result?.subdomain || '').trim();
  if (current.ok && currentSubdomain) {
    return currentSubdomain;
  }

  const candidates = [
    `tg-${accountId.slice(0, 8)}`,
    `bot-${accountId.slice(0, 6)}-${randomHex(2)}`,
    `chat-${accountId.slice(0, 6)}-${randomHex(2)}`,
    `worker-${accountId.slice(0, 6)}-${randomHex(2)}`,
  ]
    .map((item) => sanitizeWorkersSubdomain(item))
    .filter((item) => item.length >= 3);

  for (const candidate of candidates) {
    const created = await cfApi<any>(token, accountId, `/accounts/${accountId}/workers/subdomain`, {
      method: 'PUT',
      jsonBody: { subdomain: candidate },
    });
    const createdSubdomain = String(created.result?.subdomain || '').trim();
    if (created.ok && createdSubdomain) {
      onLog(`Workers 子域已启用: ${createdSubdomain}.workers.dev`);
      return createdSubdomain;
    }
  }

  throw new Error(`Workers account 子域初始化失败: ${current.reason || 'unknown'}`);
}

async function ensureWorkersDevEndpoint(
  token: string,
  accountId: string,
  workerName: string,
  onLog: (text: string) => void,
): Promise<string> {
  const subdomain = await ensureWorkersAccountSubdomain(token, accountId, onLog);

  const current = await cfApi<any>(
    token,
    accountId,
    `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/subdomain`,
  );

  if (!(current.ok && current.result?.enabled)) {
    const updated = await cfApi<any>(
      token,
      accountId,
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/subdomain`,
      {
        method: 'POST',
        jsonBody: { enabled: true, previews_enabled: true },
      },
    );
    if (!updated.ok || !updated.result?.enabled) {
      throw new Error(`workers.dev 启用失败: ${updated.reason || 'unknown'}`);
    }
  }

  const url = normalizeHttpUrl(`https://${workerName}.${subdomain}.workers.dev`);
  if (!url) {
    throw new Error('workers.dev URL 生成失败');
  }

  onLog(`Worker 入口已就绪: ${url}`);
  return url;
}

function buildZoneCandidates(hostname: string): string[] {
  const host = String(hostname || '').toLowerCase();
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return [];
  const candidates: string[] = [];
  for (let index = 0; index <= parts.length - 2; index += 1) {
    const zoneName = parts.slice(index).join('.');
    if (zoneName.includes('.')) candidates.push(zoneName);
  }
  return [...new Set(candidates)];
}

async function resolveZoneId(
  token: string,
  accountId: string,
  hostname: string,
): Promise<{ zoneId: string; zoneName: string }> {
  const candidates = buildZoneCandidates(hostname);
  for (const candidate of candidates) {
    const query = new URLSearchParams({ name: candidate, status: 'active', per_page: '50' });
    const response = await cfApi<any[]>(token, accountId, `/zones?${query.toString()}`);
    if (!response.ok) continue;

    const zones = (Array.isArray(response.result) ? response.result : []).filter(
      (item) => String(item?.name || '').toLowerCase() === candidate,
    );

    if (zones.length === 0) continue;

    const matched = zones.find((item) => String(item?.account?.id || '') === accountId) || zones[0];
    const zoneId = String(matched?.id || '').trim();
    if (zoneId) {
      return { zoneId, zoneName: String(matched?.name || candidate) };
    }
  }

  throw new Error(`未找到匹配的 Cloudflare Zone: ${hostname}`);
}

async function ensureWorkerCustomDomainByHost(
  token: string,
  accountId: string,
  workerName: string,
  hostname: string,
  onLog: (text: string) => void,
): Promise<void> {
  const { zoneId } = await resolveZoneId(token, accountId, hostname);

  const primary = await cfApi<any>(token, accountId, `/accounts/${accountId}/workers/domains`, {
    method: 'PUT',
    jsonBody: {
      environment: 'production',
      hostname,
      service: workerName,
      zone_id: zoneId,
    },
  });

  if (primary.ok) {
    onLog(`自定义域名已绑定: ${hostname} -> ${workerName}`);
    return;
  }

  const fallback = await cfApi<any>(
    token,
    accountId,
    `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/domains/records`,
    {
      method: 'PUT',
      jsonBody: {
        override_scope: true,
        override_existing_origin: true,
        override_existing_dns_record: true,
        origins: [
          {
            hostname,
            zone_id: zoneId,
            enabled: true,
          },
        ],
      },
    },
  );

  if (!fallback.ok) {
    throw new Error(`自定义域名绑定失败: primary=${primary.reason}; fallback=${fallback.reason}`);
  }

  onLog(`自定义域名已通过兜底接口绑定: ${hostname} -> ${workerName}`);
}

async function upsertWorkerSecrets(
  token: string,
  accountId: string,
  workerName: string,
  secrets: Record<string, string>,
  onLog: (text: string) => void,
): Promise<void> {
  const names = Object.entries(secrets)
    .map(([name, value]) => [name, String(value || '').trim()] as const)
    .filter(([, value]) => Boolean(value));

  for (const [name, value] of names) {
    const response = await cfApi<any>(
      token,
      accountId,
      `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/secrets`,
      {
        method: 'PUT',
        jsonBody: {
          name,
          text: value,
          type: 'secret_text',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Secret 写入失败 (${name}): ${response.reason}`);
    }
  }

  onLog(`Worker Secrets 已更新: ${names.map(([name]) => name).join(', ')}`);
}

async function waitForWorkerHealth(workerUrl: string, onLog: (text: string) => void): Promise<void> {
  const origin = getUrlOrigin(workerUrl);
  if (!origin) return;

  const url = `${origin}/health`;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const response = await request(url, {
        method: 'GET',
        timeoutMs: 15000,
      });
      const ok = response.status >= 200 && response.status < 300;
      if (ok) {
        onLog('Worker 健康检查通过。');
        return;
      }
    } catch {
      // ignore and retry
    }

    if (attempt < 12) {
      onLog(`等待 Worker 生效 (${attempt}/12)...`);
      await sleep(3000);
    }
  }

  throw new Error('Worker 健康检查超时，请稍后重试。');
}

async function triggerDeployBootstrap(
  workerUrl: string,
  bootstrapToken: string,
): Promise<{ ok: boolean; webhookUrl: string; reason: string }> {
  const origin = getUrlOrigin(workerUrl);
  if (!origin || !bootstrapToken) {
    return { ok: false, webhookUrl: '', reason: 'missing_worker_url_or_bootstrap_token' };
  }

  try {
    const response = await request(`${origin}/deploy/bootstrap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-deploy-bootstrap-token': bootstrapToken,
      },
      jsonBody: { token: bootstrapToken },
      timeoutMs: 30000,
    });

    const data = response.json || {};
    const webhookUrl = String(data?.webhookUrl || '').trim();
    if (response.status >= 200 && response.status < 300 && data) {
      const ok = Boolean(data.ok);
      const reason = ok
        ? ''
        : String(data.webhookError || data.commandsError || data.bootstrapNotifyError || `http_${response.status}`);
      return { ok, webhookUrl, reason };
    }

    return {
      ok: false,
      webhookUrl,
      reason: String(data?.error || `http_${response.status}`),
    };
  } catch (error) {
    return {
      ok: false,
      webhookUrl: '',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getPagesProject(token: string, accountId: string, projectName: string): Promise<PageProjectResult> {
  if (!projectName) return { ok: false, reason: 'missing_project_name', project: null };

  const response = await cfApi<any>(
    token,
    accountId,
    `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}`,
  );

  return {
    ok: response.ok,
    reason: response.reason,
    project: response.result,
  };
}

async function createPagesProject(token: string, accountId: string, projectName: string): Promise<PageProjectResult> {
  const response = await cfApi<any>(token, accountId, `/accounts/${accountId}/pages/projects`, {
    method: 'POST',
    jsonBody: {
      name: projectName,
      production_branch: 'main',
    },
  });

  return {
    ok: response.ok,
    reason: response.reason,
    project: response.result,
  };
}

async function ensurePagesProject(
  token: string,
  accountId: string,
  projectName: string,
  onLog: (text: string) => void,
): Promise<any> {
  const current = await getPagesProject(token, accountId, projectName);
  if (current.ok && current.project) {
    onLog(`Pages 项目已存在: ${projectName}`);
    return current.project;
  }

  if (String(current.reason || '').includes('8000007')) {
    onLog(`Pages 项目不存在，正在创建: ${projectName}`);
    const created = await createPagesProject(token, accountId, projectName);
    if (!created.ok) {
      throw new Error(`Pages 项目创建失败: ${created.reason || 'unknown'}`);
    }
    onLog(`Pages 项目创建完成: ${projectName}`);

    const checked = await getPagesProject(token, accountId, projectName);
    if (!checked.ok || !checked.project) {
      throw new Error(`Pages 项目创建后校验失败: ${checked.reason || 'unknown'}`);
    }
    return checked.project;
  }

  throw new Error(`Pages 项目前置校验失败: ${current.reason || 'unknown'}`);
}

async function getPagesUploadToken(token: string, accountId: string, projectName: string): Promise<string> {
  const response = await cfApi<any>(
    token,
    accountId,
    `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/upload-token`,
  );

  const jwt = String(response.result?.jwt || '').trim();
  if (!response.ok || !jwt) {
    throw new Error(`Pages upload token 获取失败: ${response.reason || 'unknown'}`);
  }
  return jwt;
}

function buildPagesManifest(files: PanelAssetMeta[]): Record<string, string> {
  return Object.fromEntries(files.map((file) => [`/${file.path}`, file.hash]));
}

async function pagesAssetsApi(uploadToken: string, resource: string, body: unknown): Promise<any> {
  const response = await request(`${CF_API_BASE}${resource}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${uploadToken}`,
      'Content-Type': 'application/json',
    },
    jsonBody: body,
    timeoutMs: 120000,
  });

  if (response.json?.success) {
    return response.json.result;
  }

  const reason = buildCfErrorReason(response.json, response.status, response.text);
  const error = new Error(reason) as Error & { status?: number; code?: string | number };
  error.status = response.status;
  error.code = Array.isArray(response.json?.errors) ? response.json.errors[0]?.code : undefined;
  throw error;
}

function isPagesUploadAuthError(error: any): boolean {
  const text = String(error?.message || '');
  return error?.status === 401 || String(error?.code || '') === '8000013' || text.includes('8000013');
}

function normalizeHashListResult(result: any, fallback: string[]): string[] {
  if (Array.isArray(result)) return result.map(String);
  if (Array.isArray(result?.hashes)) return result.hashes.map(String);
  return fallback;
}

async function checkMissingPagesAssets(uploadToken: string, hashes: string[]): Promise<string[]> {
  if (hashes.length === 0) return [];
  const result = await pagesAssetsApi(uploadToken, '/pages/assets/check-missing', { hashes });
  return normalizeHashListResult(result, hashes);
}

function buildPagesUploadBatches(files: PanelAssetMeta[]): PanelAssetMeta[][] {
  const maxBatchBytes = 20 * 1024 * 1024;
  const maxBatchFiles = 500;
  const batches: PanelAssetMeta[][] = [];
  let current: PanelAssetMeta[] = [];
  let currentBytes = 0;

  for (const file of files) {
    const wouldExceedBytes = current.length > 0 && currentBytes + file.sizeInBytes > maxBatchBytes;
    const wouldExceedCount = current.length >= maxBatchFiles;
    if (wouldExceedBytes || wouldExceedCount) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(file);
    currentBytes += file.sizeInBytes;
  }
  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

async function loadPanelAssetBase64(asset: PanelAssetMeta): Promise<string> {
  const filePath = `${PANEL_ASSET_PREFIX}/${asset.path}`;
  const buffer = await fetchAssetArrayBuffer(filePath);
  return arrayBufferToBase64(buffer);
}

async function uploadPagesAssetBatch(uploadToken: string, batch: PanelAssetMeta[]): Promise<void> {
  const payload: Array<{ key: string; value: string; metadata: { contentType: string }; base64: true }> = [];
  for (const file of batch) {
    payload.push({
      key: file.hash,
      value: await loadPanelAssetBase64(file),
      metadata: { contentType: file.contentType },
      base64: true,
    });
  }
  await pagesAssetsApi(uploadToken, '/pages/assets/upload', payload);
}

async function upsertPagesAssetHashes(uploadToken: string, hashes: string[]): Promise<void> {
  if (hashes.length === 0) return;
  await pagesAssetsApi(uploadToken, '/pages/assets/upsert-hashes', { hashes });
}

async function createPagesDeploymentFromManifest(
  token: string,
  accountId: string,
  projectName: string,
  manifest: Record<string, string>,
  branch: string,
): Promise<any> {
  const { boundary, body } = buildMultipartBody([
    {
      name: 'manifest',
      contentType: 'application/json',
      value: JSON.stringify(manifest || {}),
    },
    {
      name: 'branch',
      contentType: 'text/plain',
      value: branch || 'main',
    },
    {
      name: 'commit_dirty',
      contentType: 'text/plain',
      value: 'true',
    },
  ]);

  const response = await cfApi<any>(
    token,
    accountId,
    `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/deployments`,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      textBody: body,
      timeoutMs: 120000,
    },
  );

  if (!response.ok) {
    throw new Error(`Pages deployment 创建失败: ${response.reason}`);
  }

  return response.result || {};
}

async function listPagesDeployments(
  token: string,
  accountId: string,
  projectName: string,
): Promise<{ ok: boolean; reason: string; deployments: any[] }> {
  const response = await cfApi<any[]>(
    token,
    accountId,
    `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/deployments?per_page=5`,
  );

  return {
    ok: response.ok,
    reason: response.reason,
    deployments: Array.isArray(response.result) ? response.result : [],
  };
}

async function verifyPagesDeployment(
  token: string,
  accountId: string,
  projectName: string,
  previousIds: Set<string>,
  fallbackUrl: string,
  onLog: (text: string) => void,
): Promise<PageDeployResult> {
  const delays = [1000, 2500, 5000, 8000, 12000];
  let lastReason = 'unknown';

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const list = await listPagesDeployments(token, accountId, projectName);
    if (list.ok) {
      const latest = list.deployments.find((item) => !previousIds.has(String(item?.id || ''))) || list.deployments[0];
      if (latest) {
        const latestId = String(latest?.id || '');
        const stage = latest?.latest_stage || {};
        if (stage?.name === 'deploy' && stage?.status === 'failure') {
          return {
            ok: false,
            id: latestId,
            url: '',
            method: 'deployments-list',
            reason: `latest_deployment_failed:${latestId || 'unknown'}`,
            warning: '',
          };
        }

        if (previousIds.size === 0 || !previousIds.has(latestId)) {
          return {
            ok: true,
            id: latestId,
            url: normalizeHttpUrl(String(latest?.url || '')) || fallbackUrl,
            method: 'deployments-list',
            reason: '',
            warning: '',
          };
        }

        lastReason = `no_new_pages_deployment_found; latest=${latestId || 'unknown'}`;
      } else {
        lastReason = 'no_pages_deployments_found';
      }
    } else {
      lastReason = `deployment_list_failed:${list.reason || 'unknown'}`;
    }

    if (attempt < delays.length) {
      const delayMs = delays[attempt];
      onLog(`Pages 部署列表暂未就绪: ${lastReason}，${Math.round(delayMs / 1000)} 秒后重试...`);
      await sleep(delayMs);
    }
  }

  if (fallbackUrl) {
    return {
      ok: true,
      id: 'verified-by-fallback-url',
      url: fallbackUrl,
      method: 'fallback-url',
      reason: '',
      warning: lastReason,
    };
  }

  return {
    ok: false,
    id: '',
    url: '',
    method: '',
    reason: lastReason,
    warning: '',
  };
}

async function deployPanelViaDirectUpload(
  token: string,
  accountId: string,
  projectName: string,
  branch: string,
  panelAssets: PanelAssetMeta[],
  onLog: (text: string) => void,
): Promise<PageDeployResult> {
  if (panelAssets.length === 0) {
    throw new Error('未找到面板静态资源，请先执行 npm run sync-assets。');
  }

  let uploadToken = await getPagesUploadToken(token, accountId, projectName);
  const withFreshUploadToken = async (operation: (nextToken: string) => Promise<any>) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (isPagesUploadTokenExpired(uploadToken)) {
        uploadToken = await getPagesUploadToken(token, accountId, projectName);
      }
      try {
        return await operation(uploadToken);
      } catch (error) {
        if (attempt === 0 && isPagesUploadAuthError(error)) {
          uploadToken = await getPagesUploadToken(token, accountId, projectName);
          continue;
        }
        throw error;
      }
    }
    throw new Error('pages_upload_token_refresh_failed');
  };

  const maxFiles = maxPagesFileCountFromClaims(uploadToken);
  if (panelAssets.length > maxFiles) {
    throw new Error(`Pages 资源文件数超限: ${panelAssets.length}/${maxFiles}`);
  }

  const hashes = panelAssets.map((item) => item.hash);
  const manifest = buildPagesManifest(panelAssets);
  const fileCount = Object.keys(manifest).length;
  if (fileCount === 0) {
    throw new Error('manifest_empty');
  }

  onLog(`Pages 直传: 共 ${fileCount} 个文件。`);

  const missingHashes = await withFreshUploadToken((nextToken) => checkMissingPagesAssets(nextToken, hashes));
  const missingSet = new Set(missingHashes.map(String));
  const missingFiles = panelAssets.filter((file) => missingSet.has(file.hash));

  onLog(`Pages 直传: 需上传 ${missingFiles.length} 个文件，已命中缓存 ${fileCount - missingFiles.length} 个。`);

  const batches = buildPagesUploadBatches(missingFiles);
  let uploaded = 0;
  for (const batch of batches) {
    await withFreshUploadToken((nextToken) => uploadPagesAssetBatch(nextToken, batch));
    uploaded += batch.length;
    onLog(`Pages 直传: 已上传 ${uploaded}/${missingFiles.length} 个文件。`);
  }

  try {
    await withFreshUploadToken((nextToken) => upsertPagesAssetHashes(nextToken, hashes));
  } catch (error) {
    onLog(`Pages hash 缓存更新警告: ${error instanceof Error ? error.message : String(error)}`);
  }

  onLog('Pages 直传: 正在创建部署...');
  const deployment = await createPagesDeploymentFromManifest(token, accountId, projectName, manifest, branch || 'main');

  return {
    ok: true,
    id: String(deployment?.id || ''),
    url: normalizeHttpUrl(String(deployment?.url || '')),
    method: 'direct-upload',
    reason: '',
    warning: '',
  };
}

async function deployPanelToPages(
  token: string,
  accountId: string,
  projectName: string,
  branch: string,
  panelAssets: PanelAssetMeta[],
  onLog: (text: string) => void,
): Promise<{ panelUrl: string; projectName: string }> {
  const project = await ensurePagesProject(token, accountId, projectName, onLog);
  const subdomain = String(project?.subdomain || '').trim();
  if (subdomain) {
    onLog(`Pages 项目已校验: ${projectName} -> https://${subdomain}`);
  } else {
    onLog(`Pages 项目已校验: ${projectName}`);
  }

  const fallbackProjectUrl = subdomain ? normalizeHttpUrl(`https://${subdomain}`) : '';
  const beforeDeployments = await listPagesDeployments(token, accountId, projectName);
  const beforeIds = new Set((beforeDeployments.deployments || []).map((item) => String(item?.id || '')).filter(Boolean));

  const direct = await deployPanelViaDirectUpload(token, accountId, projectName, branch, panelAssets, onLog);
  const checked = await verifyPagesDeployment(
    token,
    accountId,
    projectName,
    beforeIds,
    direct.url || fallbackProjectUrl,
    onLog,
  );

  if (!checked.ok) {
    throw new Error(`Pages 部署验证失败: ${checked.reason || 'unknown'}`);
  }

  const deployedUrl = checked.url || direct.url || fallbackProjectUrl;
  onLog(`Pages 部署已验证: ${checked.id || direct.id || projectName}${deployedUrl ? ` -> ${deployedUrl}` : ''}${checked.method ? ` (${checked.method})` : ''}`);
  if (checked.warning) {
    onLog(`Pages 部署列表警告: ${checked.warning}`);
  }

  return {
    panelUrl: normalizeHttpUrl(deployedUrl),
    projectName,
  };
}

export async function runDeploy(
  formInput: DeployFormState,
  onLog: (text: string) => void,
): Promise<DeployRunResult> {
  const form = sanitizeFormState(formInput);
  const token = form.cfApiToken;
  const accountId = form.cfAccountId;

  if (!token) throw new Error('请填写 Cloudflare API Token。');
  if (!accountId) throw new Error('请填写 Cloudflare Account ID。');
  if (!form.botToken) throw new Error('请填写 BOT_TOKEN。');
  if (!form.adminChatId) throw new Error('请填写 ADMIN_CHAT_ID。');

  const assets = await loadBundleAssets();
  const workerName = form.workerName || assets.defaultWorkerName || 'telegram-private-chatbot';
  const kvNamespaceTitle = form.kvNamespaceTitle || DEFAULT_KV_NAMESPACE_TITLE;
  const d1DatabaseName = form.d1DatabaseName || DEFAULT_D1_DATABASE_NAME;

  const workerUrlInput = normalizeHttpUrl(form.workerUrl);
  const verifyPublicBaseUrl = normalizeHttpUrl(form.verifyPublicBaseUrl);
  const manualPanelUrl = normalizeHttpUrl(form.panelUrl);
  const deployPanel = Boolean(form.deployPanel);
  const pagesProjectName = normalizePagesProjectName(form.pagesProjectName) || suggestPagesProjectName(workerName);
  const pagesBranch = String(form.pagesBranch || DEFAULT_PAGES_BRANCH).trim() || DEFAULT_PAGES_BRANCH;

  onLog('步骤 1/6: 初始化 KV 和 D1');
  const kv = await ensureKvNamespace(token, accountId, kvNamespaceTitle, onLog);
  const d1 = await ensureD1Database(token, accountId, d1DatabaseName, assets.migrations, onLog);

  onLog('步骤 2/6: 初次上传 Worker');
  const firstVars: Record<string, string> = {
    ...assets.defaultVars,
  };
  if (workerUrlInput) firstVars.PUBLIC_BASE_URL = workerUrlInput;
  if (verifyPublicBaseUrl) firstVars.VERIFY_PUBLIC_BASE_URL = verifyPublicBaseUrl;
  if (manualPanelUrl) firstVars.ADMIN_PANEL_URL = manualPanelUrl;

  await uploadWorker(
    token,
    accountId,
    workerName,
    assets.workerCode,
    buildWorkerUploadMetadata({
      compatibilityDate: assets.compatibilityDate,
      vars: firstVars,
      namespaceId: kv.namespaceId,
      databaseId: d1.databaseId,
    }),
    onLog,
  );

  onLog('步骤 3/6: 配置 Worker 公开入口');
  let workerUrl = workerUrlInput;
  const customHost = getCustomDomainHost(workerUrlInput);
  if (customHost) {
    await ensureWorkerCustomDomainByHost(token, accountId, workerName, customHost, onLog);
  } else {
    workerUrl = await ensureWorkersDevEndpoint(token, accountId, workerName, onLog);
  }

  const verifyHost = getCustomDomainHost(verifyPublicBaseUrl);
  if (verifyHost && verifyHost !== customHost) {
    await ensureWorkerCustomDomainByHost(token, accountId, workerName, verifyHost, onLog);
  }

  let effectivePanelUrl = manualPanelUrl;
  if (deployPanel) {
    onLog('步骤 4/6: 部署 Pages 管理面板');
    const pagesResult = await deployPanelToPages(
      token,
      accountId,
      pagesProjectName,
      pagesBranch,
      assets.panelAssets,
      onLog,
    );
    if (!effectivePanelUrl) {
      effectivePanelUrl = pagesResult.panelUrl;
    }
  } else {
    onLog('步骤 4/6: 跳过 Pages 管理面板部署（已关闭）。');
  }

  onLog('步骤 5/6: 回写最终运行变量并更新 Worker');
  const finalVars: Record<string, string> = {
    ...firstVars,
    PUBLIC_BASE_URL: workerUrl,
  };
  if (effectivePanelUrl) {
    finalVars.ADMIN_PANEL_URL = effectivePanelUrl;
  }

  await uploadWorker(
    token,
    accountId,
    workerName,
    assets.workerCode,
    buildWorkerUploadMetadata({
      compatibilityDate: assets.compatibilityDate,
      vars: finalVars,
      namespaceId: kv.namespaceId,
      databaseId: d1.databaseId,
    }),
    onLog,
  );

  onLog('步骤 6/6: 更新 Worker Secrets + 触发部署引导');
  const bootstrapToken = randomHex(24);
  await upsertWorkerSecrets(
    token,
    accountId,
    workerName,
    {
      BOT_TOKEN: form.botToken,
      ADMIN_CHAT_ID: form.adminChatId,
      DEPLOY_BOOTSTRAP_TOKEN: bootstrapToken,
    },
    onLog,
  );

  await waitForWorkerHealth(workerUrl, onLog);
  const bootstrap = await triggerDeployBootstrap(workerUrl, bootstrapToken);
  if (bootstrap.ok) {
    onLog(`Webhook 已设置: ${bootstrap.webhookUrl || `${getUrlOrigin(workerUrl)}/webhook`}`);
  } else {
    onLog(`部署引导警告: ${bootstrap.reason}`);
  }

  const finalVerifyBaseUrl = verifyPublicBaseUrl || workerUrl;
  const panelEntryUrl = buildAdminPanelEntryUrl(workerUrl) || effectivePanelUrl;

  return {
    workerName,
    workerUrl,
    verifyPublicBaseUrl: finalVerifyBaseUrl,
    kvNamespaceId: kv.namespaceId,
    d1DatabaseId: d1.databaseId,
    webhookUrl: bootstrap.webhookUrl || `${getUrlOrigin(workerUrl)}${normalizeWebhookPath(finalVars.WEBHOOK_PATH || '/webhook')}`,
    panelUrl: effectivePanelUrl,
    panelEntryUrl,
    pagesProjectName,
    bootstrapOk: bootstrap.ok,
    bootstrapReason: bootstrap.reason,
  };
}
