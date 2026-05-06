const { app, BrowserWindow, ipcMain, safeStorage, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')
const crypto = require('crypto')

const DEPLOY_TOOL_VERSION = 'v1.2.0'

// paths
function findRepoRoot() {
  if (!app.isPackaged) return path.join(__dirname, '..')
  return process.resourcesPath
}

let _repoRoot, _scriptsDir, _adminPanelDir
function getRepoRoot() { return _repoRoot || (_repoRoot = findRepoRoot()) }
function getScriptsDir() { return _scriptsDir || (_scriptsDir = app.isPackaged ? path.join(process.resourcesPath, 'scripts') : path.join(__dirname, '..', 'scripts')) }
function getAdminPanelDir() { return _adminPanelDir || (_adminPanelDir = app.isPackaged ? path.join(process.resourcesPath, 'admin-panel') : path.join(__dirname, '..', 'admin-panel')) }

function safePathSegment(value) {
  return String(value || 'default').replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80) || 'default'
}

function getAccountConfigDir(account) {
  const accountKey = safePathSegment(account?.accountId || account?.id || 'default')
  return path.join(app.getPath('userData'), 'cf-accounts', accountKey)
}

function getLocalWranglerPath(env = {}) {
  return env.TG_BOT_LOCAL_WRANGLER || path.join(getRepoRoot(), 'wrangler.local.toml')
}

function getPrivateWranglerPath(env = {}) {
  return env.TG_BOT_PRIVATE_WRANGLER || path.join(getRepoRoot(), '.wrangler.private.toml')
}

function getPagesProjectName(env = {}) {
  return String(env.PAGES_PROJECT_NAME || 'tg-admin-panel').trim() || 'tg-admin-panel'
}

// accounts
const accountsFile = () => path.join(app.getPath('userData'), 'accounts.json')
const activeFile = () => path.join(app.getPath('userData'), 'active-account.txt')
let activeAccountId = null

function loadAccounts() {
  try {
    const raw = fs.readFileSync(accountsFile())
    if (safeStorage.isEncryptionAvailable()) {
      return JSON.parse(safeStorage.decryptString(Buffer.from(raw)))
    }
    return JSON.parse(raw.toString())
  } catch { return [] }
}

function saveAccounts(accounts) {
  const json = JSON.stringify(accounts)
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(accountsFile(), safeStorage.encryptString(json))
  } else {
    fs.writeFileSync(accountsFile(), json)
  }
}

function getActiveAccount() {
  const accounts = loadAccounts()
  return accounts.find(a => a.id === activeAccountId) || accounts[0] || null
}

function normalizeDeployPrefs(input = {}) {
  const asText = (value) => String(value ?? '').trim()
  const openPanelInClient = Boolean(input.openPanelInClient ?? input.useBuiltinPanel)
  const workerUrl = asText(input.workerUrl)
  const panelUrl = asText(input.panelUrl)
  return {
    botToken: asText(input.botToken),
    adminChatId: asText(input.adminChatId),
    workerUrl,
    panelUrl,
    panelEntryUrl: asText(input.panelEntryUrl) || buildAdminPanelEntryUrl(workerUrl) || panelUrl,
    openPanelInClient,
  }
}

function saveActiveDeployPrefsPatch(patch = {}) {
  const accounts = loadAccounts()
  const index = accounts.findIndex((item) => item.id === activeAccountId)
  if (index < 0) return null

  const currentPrefs = normalizeDeployPrefs(accounts[index]?.deployPrefs || {})
  const nextPrefs = normalizeDeployPrefs({ ...currentPrefs, ...patch })
  accounts[index] = { ...accounts[index], deployPrefs: nextPrefs }
  saveAccounts(accounts)
  return nextPrefs
}

// env injection
let _fakeBinDir = null
function getFakeBinDir() {
  if (_fakeBinDir) return _fakeBinDir
  _fakeBinDir = path.join(os.tmpdir(), 'tg-bot-bin')
  if (!fs.existsSync(_fakeBinDir)) fs.mkdirSync(_fakeBinDir, { recursive: true })
  // Copy Electron binary as node.exe (ASCII path, no spaces/Chinese chars)
  const nodeExe = path.join(_fakeBinDir, 'node.exe')
  if (!fs.existsSync(nodeExe)) fs.copyFileSync(process.execPath, nodeExe)
  fs.writeFileSync(path.join(_fakeBinDir, 'node.cmd'),
    '@echo off\r\n"%~dp0node.exe" %*\r\n')
  fs.writeFileSync(path.join(_fakeBinDir, 'npx.cmd'),
    '@echo off\r\nfor /f "tokens=1,*" %%a in ("%*") do %%a %%b\r\n')
  return _fakeBinDir
}

function buildEnv(account) {
  const binDir = app.isPackaged
    ? path.join(process.resourcesPath, 'node_modules', '.bin')
    : null
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE: process.execPath,
    NODE_PATH: app.isPackaged ? path.join(process.resourcesPath, 'node_modules') : path.join(__dirname, '..', 'electron-app', 'node_modules')
  }
  if (account) {
    const configDir = getAccountConfigDir(account)
    fs.mkdirSync(configDir, { recursive: true })
    env.TG_BOT_ACCOUNT_CONFIG_DIR = configDir
    env.TG_BOT_LOCAL_WRANGLER = path.join(configDir, 'wrangler.local.toml')
    env.TG_BOT_PRIVATE_WRANGLER = path.join(configDir, '.wrangler.private.toml')
    if (account.apiToken) {
      env.CLOUDFLARE_API_TOKEN = account.apiToken
      env.CF_API_TOKEN = account.apiToken
    }
    if (account.accountId) {
      env.CLOUDFLARE_ACCOUNT_ID = account.accountId
      env.CF_ACCOUNT_ID = account.accountId
    }
  }
  const fakeBin = getFakeBinDir()
  const dirs = [fakeBin, binDir].filter(Boolean)
  env.PATH = dirs.join(path.delimiter) + path.delimiter + (env.PATH || '')
  return env
}

function normalizeHttpUrl(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`
  try {
    const parsed = new URL(withProtocol)
    if (!/^https?:$/.test(parsed.protocol)) return ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

function getUrlOrigin(raw) {
  const normalized = normalizeHttpUrl(raw)
  if (!normalized) return ''
  try {
    return new URL(normalized).origin.replace(/\/$/, '')
  } catch {
    return ''
  }
}

function buildAdminPanelEntryUrl(workerUrl) {
  const origin = getUrlOrigin(workerUrl)
  return origin ? `${origin}/admin` : ''
}

function normalizeWebhookPath(value) {
  const text = String(value || '/webhook').trim() || '/webhook'
  return text.startsWith('/') ? text : `/${text}`
}

function ensureLocalWranglerFile(env = {}) {
  const localPath = getLocalWranglerPath(env)
  if (!fs.existsSync(localPath)) {
    fs.mkdirSync(path.dirname(localPath), { recursive: true })
    fs.writeFileSync(localPath, ['# Account private deployment config', '', '[vars]', ''].join('\n'), 'utf8')
  }
  return localPath
}

function getWorkerCustomDomainHost(workerUrl) {
  const normalized = normalizeHttpUrl(workerUrl)
  if (!normalized) return ''
  try {
    const host = new URL(normalized).hostname.toLowerCase()
    if (!host || host.endsWith('.workers.dev') || host.endsWith('.pages.dev')) return ''
    return host
  } catch {
    return ''
  }
}

function stripManagedWorkerRouteBlock(content) {
  return String(content || '').replace(/\n?# TG_BOT_WORKER_ROUTE_START[\s\S]*?# TG_BOT_WORKER_ROUTE_END\n?/m, '\n')
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function upsertTomlBindingBlock(content, tableName, binding, block) {
  const current = String(content || '')
  const blockPattern = new RegExp(`\\[\\[${escapeRegExp(tableName)}\\]\\][\\s\\S]*?(?=\\n\\[\\[|\\n\\[|$)`, 'g')
  const matches = [...current.matchAll(blockPattern)]
  for (const match of matches) {
    if (new RegExp(`^[ \\t]*binding[ \\t]*=[ \\t]*"${escapeRegExp(binding)}"[ \\t]*$`, 'm').test(match[0])) {
      return current.replace(match[0], block)
    }
  }

  const prefix = current.replace(/\s+$/, '')
  return prefix ? `${prefix}\n\n${block}\n` : `${block}\n`
}

function upsertKvBindingInLocalConfig(binding, namespaceId, env = {}) {
  const localPath = ensureLocalWranglerFile(env)
  const current = fs.readFileSync(localPath, 'utf8')
  const block = `[[kv_namespaces]]\nbinding = "${binding}"\nid = "${namespaceId}"`
  const next = upsertTomlBindingBlock(current, 'kv_namespaces', binding, block)
  if (next !== current) fs.writeFileSync(localPath, next.replace(/\s+$/, '') + '\n', 'utf8')
  return localPath
}

function upsertD1BindingInLocalConfig(binding, databaseName, databaseId, env = {}) {
  const localPath = ensureLocalWranglerFile(env)
  const current = fs.readFileSync(localPath, 'utf8')
  const block = `[[d1_databases]]\nbinding = "${binding}"\ndatabase_name = "${databaseName}"\ndatabase_id = "${databaseId}"`
  const next = upsertTomlBindingBlock(current, 'd1_databases', binding, block)
  if (next !== current) fs.writeFileSync(localPath, next.replace(/\s+$/, '') + '\n', 'utf8')
  return localPath
}

function upsertVarsBlock(content, updates) {
  const entries = Object.entries(updates).filter(([, value]) => String(value || '').trim())
  if (entries.length === 0) return { content, updatedKeys: [] }

  const formatLine = (key, value) => `${key} = ${JSON.stringify(String(value))}`
  const varsPattern = /\[vars\]([\s\S]*?)(?=\n\[|$)/
  const updatedKeys = []

  if (varsPattern.test(content)) {
    const next = content.replace(varsPattern, (full, body) => {
      const lines = String(body)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      const result = [...lines]
      for (const [key, value] of entries) {
        const line = formatLine(key, value)
        const index = result.findIndex((item) => item.split('=')[0]?.trim() === key)
        if (index >= 0) {
          if (result[index] !== line) updatedKeys.push(key)
          result[index] = line
        } else {
          updatedKeys.push(key)
          result.push(line)
        }
      }
      return `[vars]\n${result.join('\n')}`
    })
    return { content: next, updatedKeys }
  }

  const lines = entries.map(([key, value]) => formatLine(key, value))
  const prefix = content.replace(/\s+$/, '')
  return {
    content: `${prefix}\n\n[vars]\n${lines.join('\n')}\n`,
    updatedKeys: entries.map(([key]) => key),
  }
}

function syncRuntimeUrlsToLocalConfig(workerUrl, panelUrl, env = {}, extraUpdates = {}) {
  const localPath = ensureLocalWranglerFile(env)

  const updates = { ...extraUpdates }
  const normalizedWorker = normalizeHttpUrl(workerUrl)
  const normalizedPanel = normalizeHttpUrl(panelUrl)
  if (normalizedWorker) updates.PUBLIC_BASE_URL = normalizedWorker
  if (normalizedPanel) updates.ADMIN_PANEL_URL = normalizedPanel

  const current = fs.readFileSync(localPath, 'utf8')
  let { content, updatedKeys } = upsertVarsBlock(current, updates)
  const withoutManagedRoute = stripManagedWorkerRouteBlock(content).replace(/\n{3,}/g, '\n\n')
  if (withoutManagedRoute !== content) {
    content = withoutManagedRoute
    updatedKeys.push('WORKER_CUSTOM_DOMAIN_CONFIG_REMOVED')
  }
  if (content !== current) {
    fs.writeFileSync(localPath, content.replace(/\s+$/, '') + '\n', 'utf8')
  }
  return updatedKeys
}

async function getPagesProject(env, projectName) {
  const token = String(env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || '').trim()
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim()
  if (!token || !accountId || !projectName) {
    return { ok: false, reason: 'missing_token_or_account_or_project' }
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  const json = await response.json().catch(() => null)
  if (!json?.success) {
    const errors = Array.isArray(json?.errors) ? json.errors : []
    const reason = errors.length > 0
      ? errors.map((item) => `${item.code || 'unknown'}:${item.message || 'unknown'}`).join('; ')
      : `http_${response.status}`
    return { ok: false, reason }
  }
  return { ok: true, project: json.result || null }
}

function buildCfErrorReason(json, status) {
  const errors = Array.isArray(json?.errors) ? json.errors : []
  return errors.length > 0
    ? errors.map((item) => `${item.code || 'unknown'}:${item.message || 'unknown'}`).join('; ')
    : `http_${status}`
}

function getCfTokenAndAccount(env = {}, requireAccount = true) {
  const token = String(env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || '').trim()
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim()
  if (!token) {
    throw new Error('missing_cloudflare_api_token')
  }
  if (requireAccount && !accountId) {
    throw new Error('missing_cloudflare_account_id')
  }
  return { token, accountId }
}

async function cfApiRequest(env, resource, options = {}) {
  const { token } = getCfTokenAndAccount(env, options.requireAccount !== false)
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  }
  let body = options.body
  if (body !== undefined && body !== null && typeof body !== 'string' && !(body instanceof FormData)) {
    body = JSON.stringify(body)
    headers['Content-Type'] = headers['Content-Type'] || 'application/json'
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4${resource}`, {
    method: options.method || 'GET',
    headers,
    body,
  })
  const text = await response.text().catch(() => '')
  let json = null
  try { json = text ? JSON.parse(text) : null } catch {}

  if (json?.success || (response.ok && !json?.errors)) {
    return {
      ok: true,
      status: response.status,
      result: json?.result ?? null,
      resultInfo: json?.result_info ?? null,
    }
  }

  return {
    ok: false,
    status: response.status,
    reason: json ? buildCfErrorReason(json, response.status) : `http_${response.status}${text ? `:${text.slice(0, 180)}` : ''}`,
    result: json?.result ?? null,
  }
}

function getZoneNameCandidatesForHostname(hostname) {
  const labels = String(hostname || '')
    .toLowerCase()
    .replace(/\.$/, '')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
  const candidates = []
  for (let index = 0; index < labels.length - 1; index += 1) {
    candidates.push(labels.slice(index).join('.'))
  }
  return [...new Set(candidates)]
}

async function findZoneForHostname(env, hostname, onProgress) {
  const { accountId } = getCfTokenAndAccount(env)
  const candidates = getZoneNameCandidatesForHostname(hostname)
  if (candidates.length === 0) {
    return { ok: false, reason: `invalid_hostname:${hostname}` }
  }

  for (const candidate of candidates) {
    const query = new URLSearchParams({ name: candidate, per_page: '50' })
    const response = await cfApiRequest(env, `/zones?${query.toString()}`, { requireAccount: false })
    if (!response.ok) {
      return { ok: false, reason: `zone_lookup_failed:${candidate}:${response.reason || 'unknown'}` }
    }

    const zones = Array.isArray(response.result) ? response.result : []
    const exactZones = zones.filter((zone) => String(zone?.name || '').toLowerCase() === candidate)
    const accountZone = exactZones.find((zone) => String(zone?.account?.id || '') === accountId)
    const zone = accountZone || exactZones[0]
    if (zone?.id) {
      onProgress?.(`Cloudflare zone matched: ${hostname} -> ${zone.name}`)
      return { ok: true, zoneId: String(zone.id), zoneName: String(zone.name || candidate) }
    }
  }

  return { ok: false, reason: `zone_not_found_for_hostname:${hostname}; candidates=${candidates.join(',')}` }
}

async function putWorkerCustomDomain(env, workerName, hostname, zoneId) {
  const { accountId } = getCfTokenAndAccount(env)
  return cfApiRequest(env, `/accounts/${accountId}/workers/domains`, {
    method: 'PUT',
    body: {
      environment: 'production',
      hostname,
      service: workerName,
      zone_id: zoneId,
    },
  })
}

async function putWorkerCustomDomainRecords(env, workerName, hostname, zoneId) {
  const { accountId } = getCfTokenAndAccount(env)
  return cfApiRequest(env, `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/domains/records`, {
    method: 'PUT',
    body: {
      override_scope: true,
      override_existing_origin: true,
      override_existing_dns_record: true,
      origins: [{
        hostname,
        zone_id: zoneId,
        enabled: true,
      }],
    },
  })
}

async function putWorkerSecretViaApi(env, workerName, name, value) {
  const { accountId } = getCfTokenAndAccount(env)
  return cfApiRequest(env, `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/secrets`, {
    method: 'PUT',
    body: {
      name,
      text: String(value || ''),
      type: 'secret_text',
    },
  })
}

async function listWorkerSecretsViaApi(env, workerName) {
  const { accountId } = getCfTokenAndAccount(env)
  return cfApiRequest(env, `/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/secrets`)
}

async function updateWorkerSecretsViaApi(env, configPath, secrets, onProgress) {
  const workerName = getWorkerNameFromConfig(configPath)
  if (!workerName) {
    throw new Error('Worker secret update failed: missing_worker_name_in_config')
  }

  const entries = Object.entries(secrets || {})
    .map(([name, value]) => [String(name || '').trim(), String(value || '').trim()])
    .filter(([name, value]) => name && value)
  if (entries.length === 0) {
    return { ok: true, names: [] }
  }

  for (const [name, value] of entries) {
    const updated = await putWorkerSecretViaApi(env, workerName, name, value)
    if (!updated.ok) {
      throw new Error(`Worker secret update failed (${name}): ${updated.reason || 'unknown'}`)
    }
  }

  const listed = await listWorkerSecretsViaApi(env, workerName)
  if (listed.ok) {
    const visibleNames = (Array.isArray(listed.result) ? listed.result : [])
      .map((item) => String(item.name || item.binding || item.id || '').trim())
      .filter(Boolean)
    const missing = entries.map(([name]) => name).filter((name) => !visibleNames.includes(name))
    if (missing.length > 0) {
      throw new Error(`Worker secret verification failed: missing ${missing.join(', ')}`)
    }
  } else {
    onProgress?.(`Worker secret list warning: ${listed.reason || 'unknown'}`)
  }

  onProgress?.(`Worker Secrets 已通过 Cloudflare API 更新：${entries.map(([name]) => name).join(', ')}`)
  return { ok: true, names: entries.map(([name]) => name) }
}

async function listKvNamespacesViaApi(env) {
  const { accountId } = getCfTokenAndAccount(env)
  const namespaces = []
  let totalPages = 1
  for (let page = 1; page <= totalPages && page <= 10; page += 1) {
    const query = new URLSearchParams({ page: String(page), per_page: '100' })
    const response = await cfApiRequest(env, `/accounts/${accountId}/storage/kv/namespaces?${query.toString()}`)
    if (!response.ok) {
      throw new Error(`KV namespace list failed: ${response.reason || 'unknown'}`)
    }
    namespaces.push(...(Array.isArray(response.result) ? response.result : []))
    totalPages = Number(response.resultInfo?.total_pages || 1)
  }
  return namespaces
}

async function ensureKvBindingViaApi(env, options = {}, onProgress) {
  const { accountId } = getCfTokenAndAccount(env)
  const namespaceTitle = String(options.namespaceTitle || env.KV_NAMESPACE_TITLE || env.KV_NAMESPACE_NAME || 'tg-bot-kv').trim()
  const binding = String(options.binding || env.KV_BINDING || 'BOT_KV').trim()
  if (!namespaceTitle || !binding) {
    throw new Error('KV initialization failed: missing_namespace_title_or_binding')
  }

  onProgress?.('正在通过 Cloudflare API 初始化 KV...')
  let namespaces = await listKvNamespacesViaApi(env)
  let namespace = namespaces.find((item) => String(item.title || '') === namespaceTitle)
  if (!namespace?.id) {
    const created = await cfApiRequest(env, `/accounts/${accountId}/storage/kv/namespaces`, {
      method: 'POST',
      body: { title: namespaceTitle },
    })
    if (!created.ok) {
      const reason = String(created.reason || '')
      if (!/already exists|10013|10014/i.test(reason)) {
        throw new Error(`KV namespace create failed (${namespaceTitle}): ${reason || 'unknown'}`)
      }
      namespaces = await listKvNamespacesViaApi(env)
      namespace = namespaces.find((item) => String(item.title || '') === namespaceTitle)
    } else {
      namespace = created.result || null
    }
  }

  const namespaceId = String(namespace?.id || '').trim()
  if (!namespaceId) {
    throw new Error(`KV namespace id not found: ${namespaceTitle}`)
  }

  const targetPath = upsertKvBindingInLocalConfig(binding, namespaceId, env)
  onProgress?.(`KV 已就绪：${namespaceTitle} (${namespaceId}) -> ${binding}`)
  onProgress?.(`KV 绑定已写入账号配置：${targetPath}`)
  return { ok: true, namespaceTitle, binding, namespaceId, targetPath }
}

async function listD1DatabasesViaApi(env) {
  const { accountId } = getCfTokenAndAccount(env)
  const databases = []
  let totalPages = 1
  for (let page = 1; page <= totalPages && page <= 10; page += 1) {
    const query = new URLSearchParams({ page: String(page), per_page: '100' })
    const response = await cfApiRequest(env, `/accounts/${accountId}/d1/database?${query.toString()}`)
    if (!response.ok) {
      throw new Error(`D1 database list failed: ${response.reason || 'unknown'}`)
    }
    databases.push(...(Array.isArray(response.result) ? response.result : []))
    totalPages = Number(response.resultInfo?.total_pages || 1)
  }
  return databases
}

function getD1DatabaseId(database) {
  return String(database?.uuid || database?.id || database?.database_id || '').trim()
}

async function executeD1SqlViaApi(env, databaseId, sql) {
  const { accountId } = getCfTokenAndAccount(env)
  return cfApiRequest(env, `/accounts/${accountId}/d1/database/${encodeURIComponent(databaseId)}/query`, {
    method: 'POST',
    body: { sql },
  })
}

function escapeSqlString(value) {
  return String(value || '').replaceAll("'", "''")
}

async function applyD1MigrationsViaApi(env, databaseId, onProgress) {
  const migrationsPath = path.join(getRepoRoot(), 'migrations')
  if (!fs.existsSync(migrationsPath)) {
    onProgress?.('D1 迁移已跳过：未找到 migrations 目录。')
    return { ok: true, applied: [], skipped: true }
  }

  const migrationFiles = fs.readdirSync(migrationsPath)
    .filter((name) => /\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
  if (migrationFiles.length === 0) {
    onProgress?.('D1 迁移已跳过：没有 SQL 迁移文件。')
    return { ok: true, applied: [] }
  }

  const migrationTableSql = `CREATE TABLE IF NOT EXISTS d1_migrations(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );`
  const init = await executeD1SqlViaApi(env, databaseId, migrationTableSql)
  if (!init.ok) {
    throw new Error(`D1 migration table initialization failed: ${init.reason || 'unknown'}`)
  }

  const listed = await executeD1SqlViaApi(env, databaseId, 'SELECT name FROM d1_migrations ORDER BY id')
  const rows = Array.isArray(listed.result?.[0]?.results)
    ? listed.result[0].results
    : Array.isArray(listed.result?.results)
      ? listed.result.results
      : []
  const appliedNames = new Set(rows.map((row) => String(row.name || '').trim()).filter(Boolean))
  const appliedNow = []

  for (const filename of migrationFiles) {
    if (appliedNames.has(filename)) continue

    const filepath = path.join(migrationsPath, filename)
    const sql = fs.readFileSync(filepath, 'utf8').trim()
    if (!sql) continue

    const migrationSql = `${sql.replace(/\s+$/, '')}\n\nINSERT INTO d1_migrations (name) VALUES ('${escapeSqlString(filename)}');`
    const migrated = await executeD1SqlViaApi(env, databaseId, migrationSql)
    if (!migrated.ok) {
      throw new Error(`D1 migration failed (${filename}): ${migrated.reason || 'unknown'}`)
    }
    appliedNow.push(filename)
    onProgress?.(`D1 迁移已执行：${filename}`)
  }

  if (appliedNow.length === 0) {
    onProgress?.('D1 迁移已是最新。')
  }
  return { ok: true, applied: appliedNow }
}

async function ensureD1BindingViaApi(env, options = {}, onProgress) {
  const { accountId } = getCfTokenAndAccount(env)
  const databaseName = String(options.databaseName || env.D1_DATABASE_NAME || 'tg-bot-history').trim()
  const binding = String(options.binding || env.D1_BINDING || 'DB').trim()
  if (!databaseName || !binding) {
    throw new Error('D1 initialization failed: missing_database_name_or_binding')
  }

  onProgress?.('正在通过 Cloudflare API 初始化 D1...')
  let databases = await listD1DatabasesViaApi(env)
  let database = databases.find((item) => String(item.name || '') === databaseName)
  if (!getD1DatabaseId(database)) {
    const created = await cfApiRequest(env, `/accounts/${accountId}/d1/database`, {
      method: 'POST',
      body: { name: databaseName },
    })
    if (!created.ok) {
      const reason = String(created.reason || '')
      if (!/already exists|10013|10014|7502/i.test(reason)) {
        throw new Error(`D1 database create failed (${databaseName}): ${reason || 'unknown'}`)
      }
      databases = await listD1DatabasesViaApi(env)
      database = databases.find((item) => String(item.name || '') === databaseName)
    } else {
      database = created.result || null
    }
  }

  const databaseId = getD1DatabaseId(database)
  if (!databaseId) {
    throw new Error(`D1 database id not found: ${databaseName}`)
  }

  const targetPath = upsertD1BindingInLocalConfig(binding, databaseName, databaseId, env)
  onProgress?.(`D1 已就绪：${databaseName} (${databaseId}) -> ${binding}`)
  onProgress?.(`D1 绑定已写入账号配置：${targetPath}`)

  if (!options.skipMigrate) {
    await applyD1MigrationsViaApi(env, databaseId, onProgress)
  }

  return { ok: true, databaseName, binding, databaseId, targetPath }
}

async function ensureWorkerCustomDomain(env, configPath, workerUrl, onProgress) {
  const hostname = getWorkerCustomDomainHost(workerUrl)
  if (!hostname) {
    return { ok: true, skipped: true, reason: 'worker_url_is_not_custom_domain' }
  }

  const workerName = getWorkerNameFromConfig(configPath)
  if (!workerName) {
    throw new Error('Worker custom domain binding failed: missing_worker_name_in_config')
  }

  const zone = await findZoneForHostname(env, hostname, onProgress)
  if (!zone.ok) {
    throw new Error(`Worker custom domain binding failed (${hostname} -> ${workerName}): ${zone.reason}`)
  }

  const primary = await putWorkerCustomDomain(env, workerName, hostname, zone.zoneId)
  if (primary.ok) {
    onProgress?.(`Worker 自定义域名已绑定：${hostname} -> ${workerName}`)
    return { ok: true, hostname, workerName, zoneId: zone.zoneId, method: 'workers-domains' }
  }

  onProgress?.(`Worker 自定义域名主接口失败（${primary.reason || 'unknown'}），尝试覆盖绑定接口...`)
  const fallback = await putWorkerCustomDomainRecords(env, workerName, hostname, zone.zoneId)
  if (fallback.ok) {
    onProgress?.(`Worker 自定义域名已通过覆盖接口绑定：${hostname} -> ${workerName}`)
    return { ok: true, hostname, workerName, zoneId: zone.zoneId, method: 'domains-records' }
  }

  throw new Error(`Worker custom domain binding failed (${hostname} -> ${workerName}): ${primary.reason || 'unknown'}; fallback=${fallback.reason || 'unknown'}`)
}

async function createPagesProject(env, projectName) {
  const token = String(env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || '').trim()
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim()
  if (!token || !accountId || !projectName) {
    return { ok: false, reason: 'missing_token_or_account_or_project' }
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName,
      production_branch: 'main',
    }),
  })

  const json = await response.json().catch(() => null)
  if (!json?.success) {
    const errors = Array.isArray(json?.errors) ? json.errors : []
    const reason = errors.length > 0
      ? errors.map((item) => `${item.code || 'unknown'}:${item.message || 'unknown'}`).join('; ')
      : `http_${response.status}`
    return { ok: false, reason }
  }
  return { ok: true, project: json.result || null }
}

async function getPagesUploadToken(env, projectName) {
  const token = String(env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || '').trim()
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim()
  if (!token || !accountId || !projectName) {
    throw new Error('missing_token_or_account_or_project')
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/upload-token`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await response.json().catch(() => null)
  if (!json?.success || !json.result?.jwt) {
    throw new Error(buildCfErrorReason(json, response.status))
  }
  return json.result.jwt
}

async function createPagesDeploymentFromManifest(env, projectName, manifest, branch = 'main') {
  const token = String(env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || '').trim()
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim()
  if (!token || !accountId || !projectName) {
    throw new Error('missing_token_or_account_or_project')
  }

  const form = new FormData()
  form.append('manifest', JSON.stringify(manifest || {}))
  form.append('branch', branch || 'main')
  form.append('commit_dirty', 'true')

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const json = await response.json().catch(() => null)
  if (!json?.success) {
    throw new Error(buildCfErrorReason(json, response.status))
  }
  return json.result || {}
}

async function listPagesDeployments(env, projectName) {
  const token = String(env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || '').trim()
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim()
  if (!token || !accountId || !projectName) {
    return { ok: false, reason: 'missing_token_or_account_or_project', deployments: [] }
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments?per_page=5`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await response.json().catch(() => null)
  if (!json?.success) {
    return { ok: false, reason: buildCfErrorReason(json, response.status), deployments: [] }
  }
  return { ok: true, deployments: Array.isArray(json.result) ? json.result : [] }
}

function extractPagesDeployUrls(output) {
  const urls = [...String(output || '').matchAll(/https?:\/\/[^\s"'<>]+/g)]
    .map((match) => match[0].replace(/[),.;]+$/, ''))
    .filter((url) => /\.pages\.dev\b/i.test(url))
  return [...new Set(urls.map((url) => normalizeHttpUrl(url)).filter(Boolean))]
}

async function verifyPagesDeployment(env, projectName, previousIds = new Set(), options = {}) {
  const outputUrls = extractPagesDeployUrls(options.deployOutput || '')
  const fallbackUrl = normalizeHttpUrl(outputUrls[0] || options.projectUrl || '')
  const delays = [1000, 2500, 5000, 8000, 12000]
  let lastReason = 'unknown'

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const list = await listPagesDeployments(env, projectName)
    if (list.ok) {
      const latest = list.deployments.find((item) => !previousIds.has(String(item.id || ''))) || list.deployments[0]
      if (latest) {
        const latestId = String(latest.id || '')
        const stage = latest.latest_stage || {}
        if (stage.name === 'deploy' && stage.status === 'failure') {
          return { ok: false, reason: `latest_deployment_failed:${latestId || 'unknown'}` }
        }
        if (previousIds.size === 0 || !previousIds.has(latestId)) {
          return {
            ok: true,
            id: latestId,
            url: normalizeHttpUrl(latest.url || '') || fallbackUrl,
            environment: latest.environment || '',
            stage: stage.status || '',
            method: 'deployments-list',
          }
        }
        lastReason = `no_new_pages_deployment_found; latest=${latestId || 'unknown'}`
      } else {
        lastReason = 'no_pages_deployments_found'
      }
    } else {
      lastReason = `deployment_list_failed:${list.reason || 'unknown'}`
    }

    if (attempt < delays.length) {
      const delayMs = delays[attempt]
      options.onProgress?.(`Pages 部署列表暂未就绪（${projectName}）：${lastReason}。${Math.round(delayMs / 1000)} 秒后重试...`)
      await sleep(delayMs)
    }
  }

  if (fallbackUrl) {
    return {
      ok: true,
      id: 'verified-by-fallback-url',
      url: fallbackUrl,
      method: 'fallback-url',
      warning: lastReason,
    }
  }

  return { ok: false, reason: lastReason }
}

let _blake3Wasm = null
function requireResourceModule(name) {
  const candidates = [
    () => require(name),
    () => require(path.join(__dirname, 'node_modules', name)),
    () => require(path.join(getRepoRoot(), 'node_modules', name)),
    () => app.isPackaged ? require(path.join(process.resourcesPath, 'node_modules', name)) : null,
  ]
  let lastError = null
  for (const load of candidates) {
    try {
      const loaded = load()
      if (loaded) return loaded
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error(`module_not_found:${name}`)
}

function getBlake3Wasm() {
  if (!_blake3Wasm) _blake3Wasm = requireResourceModule('blake3-wasm')
  return _blake3Wasm
}

function hashPagesFile(filepath) {
  const contents = fs.readFileSync(filepath)
  const base64Contents = contents.toString('base64')
  const extension = path.extname(filepath).substring(1)
  return getBlake3Wasm().hash(base64Contents + extension).toString('hex').slice(0, 32)
}

function getPagesMimeType(name) {
  const ext = path.extname(name).toLowerCase()
  const types = {
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
  }
  return types[ext] || 'application/octet-stream'
}

function normalizePagesRelativePath(rootDir, filepath) {
  return path.relative(rootDir, filepath).split(path.sep).join('/')
}

function shouldIgnorePagesAsset(relativePath) {
  const normalized = String(relativePath || '').split('\\').join('/')
  const parts = normalized.split('/').filter(Boolean)
  if (['_worker.js', '_redirects', '_headers', '_routes.json'].includes(normalized)) return true
  if (normalized === 'functions' || normalized.startsWith('functions/')) return true
  if (parts.includes('.DS_Store') || parts.includes('node_modules') || parts.includes('.git') || parts.includes('.wrangler')) return true
  return false
}

function decodeJwtPayload(token) {
  const payload = String(token || '').split('.')[1] || ''
  const padded = payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - payload.length % 4) % 4)
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
}

function maxPagesFileCountFromClaims(token) {
  try {
    const maxFileCountAllowed = decodeJwtPayload(token).max_file_count_allowed
    return typeof maxFileCountAllowed === 'number' ? maxFileCountAllowed : 20000
  } catch {
    return 20000
  }
}

function isPagesUploadTokenExpired(token) {
  try {
    return Number(decodeJwtPayload(token).exp || 0) <= Date.now() / 1000
  } catch {
    return false
  }
}

function collectPagesAssets(rootDir, uploadToken) {
  const root = path.resolve(rootDir)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`pages_dist_not_found:${root}`)
  }

  const files = []
  const maxFiles = maxPagesFileCountFromClaims(uploadToken)
  const maxAssetSize = 25 * 1024 * 1024

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filepath = path.join(dir, entry.name)
      const relativePath = normalizePagesRelativePath(root, filepath)
      if (shouldIgnorePagesAsset(relativePath) || entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        walk(filepath)
        continue
      }
      if (!entry.isFile()) continue

      const stat = fs.statSync(filepath)
      if (stat.size > maxAssetSize) {
        throw new Error(`pages_asset_too_large:${relativePath}:${stat.size}`)
      }
      files.push({
        name: relativePath,
        path: filepath,
        contentType: getPagesMimeType(relativePath),
        sizeInBytes: stat.size,
        hash: hashPagesFile(filepath),
      })
    }
  }

  walk(root)
  files.sort((a, b) => a.name.localeCompare(b.name))
  if (files.length > maxFiles) {
    throw new Error(`pages_asset_count_exceeded:${files.length}/${maxFiles}`)
  }
  return files
}

function buildPagesManifest(files) {
  return Object.fromEntries(files.map((file) => [`/${file.name}`, file.hash]))
}

async function pagesAssetsApi(uploadToken, resource, body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${resource}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${uploadToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const text = await response.text().catch(() => '')
  let json = null
  try { json = text ? JSON.parse(text) : null } catch {}
  if (json?.success) return json.result

  const error = new Error(json ? buildCfErrorReason(json, response.status) : `http_${response.status}${text ? `:${text.slice(0, 180)}` : ''}`)
  error.status = response.status
  error.code = Array.isArray(json?.errors) ? json.errors[0]?.code : undefined
  throw error
}

function isPagesUploadAuthError(error) {
  const text = String(error?.message || '')
  return error?.status === 401 || String(error?.code || '') === '8000013' || text.includes('8000013')
}

function normalizeHashListResult(result, fallback) {
  if (Array.isArray(result)) return result.map(String)
  if (Array.isArray(result?.hashes)) return result.hashes.map(String)
  return fallback
}

async function checkMissingPagesAssets(uploadToken, hashes) {
  if (hashes.length === 0) return []
  const result = await pagesAssetsApi(uploadToken, '/pages/assets/check-missing', { hashes })
  return normalizeHashListResult(result, hashes)
}

function buildPagesUploadBatches(files) {
  const maxBatchBytes = 20 * 1024 * 1024
  const maxBatchFiles = 500
  const batches = []
  let current = []
  let currentBytes = 0

  for (const file of files) {
    const wouldExceedBytes = current.length > 0 && currentBytes + file.sizeInBytes > maxBatchBytes
    const wouldExceedCount = current.length >= maxBatchFiles
    if (wouldExceedBytes || wouldExceedCount) {
      batches.push(current)
      current = []
      currentBytes = 0
    }
    current.push(file)
    currentBytes += file.sizeInBytes
  }
  if (current.length > 0) batches.push(current)
  return batches
}

async function uploadPagesAssetBatch(uploadToken, batch) {
  const payload = batch.map((file) => ({
    key: file.hash,
    value: fs.readFileSync(file.path).toString('base64'),
    metadata: { contentType: file.contentType },
    base64: true,
  }))
  await pagesAssetsApi(uploadToken, '/pages/assets/upload', payload)
}

async function upsertPagesAssetHashes(uploadToken, hashes) {
  if (hashes.length === 0) return
  await pagesAssetsApi(uploadToken, '/pages/assets/upsert-hashes', { hashes })
}

async function deployPagesViaDirectUpload(tempDist, projectName, branch, env, onProgress) {
  let uploadToken = await getPagesUploadToken(env, projectName)
  const withFreshUploadToken = async (operation) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (isPagesUploadTokenExpired(uploadToken)) {
        uploadToken = await getPagesUploadToken(env, projectName)
      }
      try {
        return await operation(uploadToken)
      } catch (error) {
        if (attempt === 0 && isPagesUploadAuthError(error)) {
          uploadToken = await getPagesUploadToken(env, projectName)
          continue
        }
        throw error
      }
    }
    throw new Error('pages_upload_token_refresh_failed')
  }

  const files = collectPagesAssets(tempDist, uploadToken)
  const hashes = files.map((file) => file.hash)
  const manifest = buildPagesManifest(files)
  const fileCount = Object.keys(manifest).length
  if (fileCount === 0) {
    throw new Error('manifest_empty')
  }

  onProgress?.(`Pages 直传：已收集 ${fileCount} 个文件。`)
  const missingHashes = await withFreshUploadToken((token) => checkMissingPagesAssets(token, hashes))
  const missingSet = new Set(missingHashes.map(String))
  const missingFiles = files.filter((file) => missingSet.has(file.hash))
  onProgress?.(`Pages 直传：需要上传 ${missingFiles.length} 个缺失文件（${fileCount - missingFiles.length} 个已缓存）。`)

  const batches = buildPagesUploadBatches(missingFiles)
  let uploaded = 0
  for (const batch of batches) {
    await withFreshUploadToken((token) => uploadPagesAssetBatch(token, batch))
    uploaded += batch.length
    onProgress?.(`Pages 直传：已上传 ${uploaded}/${missingFiles.length} 个缺失文件。`)
  }

  try {
    await withFreshUploadToken((token) => upsertPagesAssetHashes(token, hashes))
  } catch (error) {
    onProgress?.(`Pages 直传警告：Hash 缓存更新失败：${error instanceof Error ? error.message : String(error)}`)
  }

  onProgress?.(`Pages 直传：正在用 ${fileCount} 个文件创建部署。`)
  const deployment = await createPagesDeploymentFromManifest(env, projectName, manifest, branch || 'main')
  return {
    ok: true,
    id: String(deployment.id || ''),
    url: normalizeHttpUrl(deployment.url || ''),
    method: 'direct-upload',
  }
}

function getWorkerNameFromConfig(configPath) {
  if (!fs.existsSync(configPath)) return ''
  const content = fs.readFileSync(configPath, 'utf8')
  const match = content.match(/^[ \t]*name[ \t]*=[ \t]*"([^"]+)"/m)
  return match?.[1]?.trim() || ''
}

function getTomlString(content, key) {
  const match = String(content || '').match(new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*("[^"\\\\]*(?:\\\\.[^"\\\\]*)*"|[^\\r\\n#]+)`, 'm'))
  if (!match) return ''
  const raw = match[1].trim()
  if (raw.startsWith('"')) {
    try { return JSON.parse(raw) } catch {}
    return raw.slice(1, -1)
  }
  return raw.trim()
}

function parseVarsBlock(content) {
  const vars = {}
  const match = String(content || '').match(/\[vars\]([\s\S]*?)(?=\n\[|$)/)
  if (!match) return vars
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const value = getTomlString(line, key)
    if (key && value !== '') vars[key] = value
  }
  return vars
}

function getBindingBlock(content, tableName, binding) {
  const escapedTable = String(tableName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedBinding = String(binding).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const blockPattern = new RegExp(`\\[\\[${escapedTable}\\]\\][\\s\\S]*?(?=\\n\\[\\[|\\n\\[|$)`, 'g')
  const matches = [...String(content || '').matchAll(blockPattern)]
  return matches.find((match) => new RegExp(`^[ \\t]*binding[ \\t]*=[ \\t]*"${escapedBinding}"[ \\t]*$`, 'm').test(match[0]))?.[0] || ''
}

function validatePrivateWranglerConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`部署配置不存在：${configPath}`)
  }

  const content = fs.readFileSync(configPath, 'utf8')
  const activeContent = content
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
  if (/<YOUR_[A-Z0-9_]+>/.test(activeContent)) {
    throw new Error('部署配置仍包含占位符，请先完成资源初始化。')
  }

  const kvBlock = getBindingBlock(content, 'kv_namespaces', 'BOT_KV')
  if (!kvBlock) {
    throw new Error('部署配置缺少 KV 绑定 BOT_KV，请先初始化 KV。')
  }
  if (!/^\s*id\s*=\s*"[^"]+"\s*$/m.test(kvBlock)) {
    throw new Error('部署配置中的 BOT_KV 缺少 namespace id，请先初始化 KV。')
  }
}

function buildWorkerUploadMetadata(configPath) {
  const content = fs.readFileSync(configPath, 'utf8')
  const compatibilityDate = getTomlString(content, 'compatibility_date') || '2026-04-16'
  const metadata = {
    main_module: 'worker.js',
    compatibility_date: compatibilityDate,
    bindings: [],
    keep_bindings: ['secret_text'],
  }

  for (const [key, value] of Object.entries(parseVarsBlock(content))) {
    metadata.bindings.push({ type: 'plain_text', name: key, text: String(value) })
  }

  const kvBlock = getBindingBlock(content, 'kv_namespaces', 'BOT_KV')
  const kvId = getTomlString(kvBlock, 'id')
  if (kvId) {
    metadata.bindings.push({ type: 'kv_namespace', name: 'BOT_KV', namespace_id: kvId })
  }

  const d1Block = getBindingBlock(content, 'd1_databases', 'DB')
  const databaseId = getTomlString(d1Block, 'database_id')
  if (databaseId) {
    metadata.bindings.push({ type: 'd1', name: 'DB', id: databaseId })
  }

  return metadata
}

async function uploadWorkerViaApi(env, configPath, onProgress) {
  const token = String(env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || '').trim()
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim()
  const workerName = getWorkerNameFromConfig(configPath)
  if (!token || !accountId || !workerName) {
    throw new Error('缺少 Cloudflare Token、Account ID 或 Worker name，无法上传 Worker。')
  }

  const existing = await listWorkerScripts(env)
  if (!existing.ok) {
    throw new Error(`Worker 列表检查失败：${existing.reason || 'unknown'}`)
  }
  onProgress?.(existing.names.includes(workerName)
    ? `Worker 已存在，正在覆盖上传：${workerName}`
    : `Worker 不存在，正在创建并上传：${workerName}`)

  const workerPath = path.join(getRepoRoot(), 'worker.js')
  if (!fs.existsSync(workerPath)) {
    throw new Error(`缺少 Worker 代码文件：${workerPath}`)
  }

  const metadata = buildWorkerUploadMetadata(configPath)
  const form = new FormData()
  form.append('metadata', JSON.stringify(metadata))
  form.append(
    'worker.js',
    new Blob([fs.readFileSync(workerPath, 'utf8')], { type: 'application/javascript+module' }),
    'worker.js',
  )

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const json = await response.json().catch(() => null)
  if (!json?.success) {
    throw new Error(`Worker API 上传失败：${buildCfErrorReason(json, response.status)}`)
  }

  onProgress?.(`Worker API 上传完成：${workerName}`)
  return { ok: true, workerName }
}

async function getWorkerScript(env, workerName) {
  const token = String(env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || '').trim()
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim()
  if (!token || !accountId || !workerName) {
    return { ok: false, reason: 'missing_token_or_account_or_worker_name' }
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/deployments`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (response.ok) return { ok: true }

  const text = await response.text().catch(() => '')
  try {
    const json = JSON.parse(text)
    return { ok: false, reason: buildCfErrorReason(json, response.status) }
  } catch {
    return { ok: false, reason: `http_${response.status}` }
  }
}

async function listWorkerScripts(env) {
  const token = String(env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || '').trim()
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim()
  if (!token || !accountId) {
    return { ok: false, reason: 'missing_token_or_account' }
  }

  const names = []
  let totalPages = 1
  for (let page = 1; page <= totalPages && page <= 10; page += 1) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts?page=${page}&per_page=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await response.json().catch(() => null)
    if (!json?.success) {
      return { ok: false, reason: buildCfErrorReason(json, response.status), names }
    }

    const scripts = Array.isArray(json.result) ? json.result : []
    for (const item of scripts) {
      const name = String(item.id || item.name || '').trim()
      if (name) names.push(name)
    }
    totalPages = Number(json.result_info?.total_pages || 1)
  }
  return { ok: true, names }
}

function extractWorkerUrls(output, workerName) {
  const urls = [...String(output || '').matchAll(/https?:\/\/[^\s"'<>]+/g)]
    .map((match) => match[0].replace(/[),.;]+$/, ''))
    .filter((url) => /\.workers\.dev\b/i.test(url) || String(workerName || '') && url.includes(workerName))
  return [...new Set(urls)]
}

async function checkWorkerHealth(rawUrl) {
  const normalized = normalizeHttpUrl(rawUrl)
  if (!normalized) return { ok: false, reason: 'missing_worker_url' }

  let healthUrl = ''
  try {
    const parsed = new URL(normalized)
    healthUrl = `${parsed.origin}/health`
  } catch {
    return { ok: false, reason: `invalid_worker_url:${rawUrl}` }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(healthUrl, { signal: controller.signal })
    if (response.ok) {
      return { ok: true, url: healthUrl }
    }
    return { ok: false, reason: `health_http_${response.status}` }
  } catch (error) {
    return { ok: false, reason: `health_${error instanceof Error ? error.message : String(error)}` }
  } finally {
    clearTimeout(timer)
  }
}

async function waitForWorkerHealth(rawUrl, onProgress, label = 'Worker custom domain') {
  const normalized = normalizeHttpUrl(rawUrl)
  if (!normalized) return { ok: false, reason: 'missing_worker_url' }

  const delays = [1200, 2500, 5000, 8000, 12000]
  let lastReason = 'unknown'
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const health = await checkWorkerHealth(normalized)
    if (health.ok) {
      onProgress?.(`${label} 已就绪：${health.url}`)
      return health
    }
    lastReason = health.reason || 'unknown'
    if (attempt < delays.length) {
      const delayMs = delays[attempt]
      onProgress?.(`${label} 暂未就绪（${lastReason}）。${Math.round(delayMs / 1000)} 秒后重试...`)
      await sleep(delayMs)
    }
  }
  return { ok: false, reason: lastReason }
}

async function getWorkerRuntimeStatus(workerUrl) {
  const origin = getUrlOrigin(workerUrl)
  if (!origin) return { ok: false, reason: 'missing_worker_url' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`${origin}/`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.ok) {
      return { ok: false, reason: data?.error || `status_http_${response.status}` }
    }
    return { ok: true, status: data }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

async function waitForWorkerBotConfig(workerUrl, expectedAdminChatId, onProgress) {
  const origin = getUrlOrigin(workerUrl)
  if (!origin) return { ok: false, reason: 'missing_worker_url' }

  const expectedChatId = String(expectedAdminChatId || '').trim()
  const delays = [1000, 2500, 5000, 8000, 12000, 15000]
  let lastReason = 'unknown'
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const result = await getWorkerRuntimeStatus(origin)
    if (result.ok) {
      const status = result.status || {}
      const hasToken = Boolean(status.hasToken)
      const adminChatId = String(status.adminChatId || '').trim()
      const chatIdReady = !expectedChatId || adminChatId === expectedChatId
      if (hasToken && chatIdReady) {
        onProgress?.(`Worker 机器人配置已生效：hasToken=true，adminChatId=${adminChatId || '已设置'}`)
        return { ok: true, status }
      }
      lastReason = `hasToken=${hasToken}; adminChatId=${adminChatId || 'missing'}`
    } else {
      lastReason = result.reason || 'unknown'
    }

    if (attempt < delays.length) {
      const delayMs = delays[attempt]
      onProgress?.(`Worker 机器人配置暂未生效（${lastReason}）。${Math.round(delayMs / 1000)} 秒后重试...`)
      await sleep(delayMs)
    }
  }
  return { ok: false, reason: lastReason }
}

async function triggerDeployBootstrap(workerUrl, bootstrapToken, onProgress) {
  const origin = getUrlOrigin(workerUrl)
  const token = String(bootstrapToken || '').trim()
  if (!origin || !token) return { ok: false, reason: 'missing_worker_url_or_bootstrap_token' }

  const bootstrapUrl = `${origin}/deploy/bootstrap`
  const delays = [1200, 3000, 6000, 10000]
  let lastReason = 'unknown'
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      const response = await fetch(bootstrapUrl, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json; charset=UTF-8',
          'x-deploy-bootstrap-token': token,
        },
        body: JSON.stringify({}),
      })
      const data = await response.json().catch(() => null)
      if (response.ok && data?.ok) {
        onProgress?.(`Worker 部署引导已完成：${data.webhookUrl || `${origin}/webhook`}`)
        return { ok: true, data }
      }

      lastReason = data?.error ||
        data?.webhookError ||
        data?.bootstrapNotifyError ||
        data?.commandsError ||
        `bootstrap_http_${response.status}`
      if (response.ok && data?.passwordReady && data?.bootstrapNotifyError) {
        onProgress?.(`后台临时密码已生成，但 Telegram 通知失败：${data.bootstrapNotifyError}`)
        return { ok: false, reason: data.bootstrapNotifyError, data }
      }
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error)
    }

    if (attempt < delays.length) {
      const delayMs = delays[attempt]
      onProgress?.(`Worker 部署引导暂未就绪（${lastReason}）。${Math.round(delayMs / 1000)} 秒后重试...`)
      await sleep(delayMs)
    }
  }
  return { ok: false, reason: lastReason }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isWorkerVerifyRetryable(reason) {
  const text = String(reason || '')
  return text.includes('10007') || text.startsWith('http_5') || text === 'http_429'
}

async function verifyWorkerDeployment(env, configPath, onProgress, options = {}) {
  const workerName = getWorkerNameFromConfig(configPath)
  if (!workerName) {
    return { ok: false, workerName: '', reason: 'missing_worker_name_in_config' }
  }

  const healthCandidates = [
    normalizeHttpUrl(options.workerUrl || ''),
    ...extractWorkerUrls(options.deployOutput, workerName),
  ].filter(Boolean)

  for (const candidate of [...new Set(healthCandidates)]) {
    const health = await checkWorkerHealth(candidate)
    if (health.ok) {
      return { ok: true, workerName, method: 'health', url: health.url }
    }
    onProgress?.(`Worker 健康检查未通过（${candidate}）：${health.reason}`)
  }

  const delays = [1200, 2200, 4000, 7000]
  let lastReason = 'unknown'

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const list = await listWorkerScripts(env)
    if (list.ok) {
      if (list.names.includes(workerName)) {
        return { ok: true, workerName, method: 'workers-list' }
      }
      lastReason = `worker_not_in_scripts_list:${workerName}; visible_workers=${list.names.slice(0, 10).join(',') || 'none'}`
    } else {
      lastReason = `workers_list_failed:${list.reason || 'unknown'}`
    }

    const deployments = await getWorkerScript(env, workerName)
    if (deployments.ok) {
      return { ok: true, workerName, method: 'deployments' }
    }
    lastReason = `${lastReason}; deployments_check_failed:${deployments.reason || 'unknown'}`

    if (!isWorkerVerifyRetryable(lastReason) || attempt >= delays.length) {
      break
    }

    const delayMs = delays[attempt]
    onProgress?.(`Worker 验证等待中（${workerName}）：${lastReason}。${Math.round(delayMs / 1000)} 秒后重试...`)
    await sleep(delayMs)
  }

  if (String(lastReason).includes('10007')) {
    const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim() || 'unknown'
    lastReason = `${lastReason}; worker script "${workerName}" still not found under account "${accountId}". Check token/account binding.`
  }

  return { ok: false, workerName, reason: lastReason }
}

// process runner
function runProc(bin, args, opts) {
  return new Promise((resolve, reject) => {
    const commandText = [bin, ...args].join(' ')
    BrowserWindow.getAllWindows()[0]?.webContents.send('output', `\n> ${commandText}\n`)
    const proc = spawn(bin, args, { cwd: getRepoRoot(), windowsHide: true, ...opts })
    let output = ''
    let outputTail = ''
    const send = (data) => {
      const text = data.toString()
      if (/cache_util_win|gpu_disk_cache|disk_cache\.cc|Unable to (move|create) cache|Gpu Cache/.test(text)) return
      output += text
      outputTail = `${outputTail}${text}`.slice(-5000)
      BrowserWindow.getAllWindows()[0]?.webContents.send('output', text)
    }
    proc.stdout?.on('data', send)
    proc.stderr?.on('data', send)
    proc.on('error', (err) => {
      send('Start failed: ' + err.message + '\n')
      reject(new Error(`Command start failed: ${commandText}\n${err.message}`))
    })
    proc.on('close', (code) => {
      if (code !== 0) {
        send(`\n[Exit code ${code}]\n`)
        const detail = outputTail.trim()
        reject(new Error(`Command failed (exit ${code}): ${commandText}${detail ? `\n\nLast output:\n${detail}` : ''}`))
        return
      }
      resolve({ code: code ?? 0, output })
    })
  })
}
function runScript(scriptName, args = [], env) {
  return runProc(process.execPath, [path.join(getScriptsDir(), scriptName), ...args], {
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' }
  })
}
// actions
async function runAction(action, params, env) {
  const send = (msg) => BrowserWindow.getAllWindows()[0]?.webContents.send('output', msg + '\n')
  send(`部署工具版本：${DEPLOY_TOOL_VERSION}`)

  switch (action) {
    case 'show-config': {
      const toml = fs.existsSync(path.join(getRepoRoot(), 'wrangler.toml'))
        ? fs.readFileSync(path.join(getRepoRoot(), 'wrangler.toml'), 'utf8') : 'missing wrangler.toml'
      const localPath = getLocalWranglerPath(env)
      const privatePath = getPrivateWranglerPath(env)
      const local = fs.existsSync(localPath)
        ? fs.readFileSync(localPath, 'utf8') : `missing account wrangler.local.toml: ${localPath}`
      const privateToml = fs.existsSync(privatePath)
        ? fs.readFileSync(privatePath, 'utf8') : `missing account .wrangler.private.toml: ${privatePath}`
      send('=== wrangler.toml ===\n' + toml)
      send('\n=== wrangler.local.toml ===\n' + local)
      send('\n=== .wrangler.private.toml ===\n' + privateToml)
      return
    }
    case 'merge-config':
      await runScript('merge-wrangler-config.mjs', [], env)
      return
    case 'setup-d1':
      await ensureD1BindingViaApi(env, { skipMigrate: false }, send)
      await runScript('merge-wrangler-config.mjs', [], env)
      return
    case 'setup-kv':
      await ensureKvBindingViaApi(env, {}, send)
      await runScript('merge-wrangler-config.mjs', [], env)
      return
    case 'deploy-worker':
      {
        const runtimeUpdates = syncRuntimeUrlsToLocalConfig(params?.workerUrl || '', params?.panelUrl || '', env)
        if (runtimeUpdates.length > 0) send(`已更新账号运行配置：${runtimeUpdates.join(', ')}`)
      }
      send('正在初始化 KV 和 D1...')
      await ensureKvBindingViaApi(env, {}, send)
      await ensureD1BindingViaApi(env, { skipMigrate: false }, send)
      {
        const runtimeUpdates = syncRuntimeUrlsToLocalConfig(params?.workerUrl || '', params?.panelUrl || '', env)
        if (runtimeUpdates.length > 0) send(`已更新账号运行配置：${runtimeUpdates.join(', ')}`)
      }
      await runScript('merge-wrangler-config.mjs', [], env)
      const workerConfigPath = getPrivateWranglerPath(env)
      validatePrivateWranglerConfig(workerConfigPath)
      await uploadWorkerViaApi(env, workerConfigPath, send)
      await ensureWorkerCustomDomain(env, workerConfigPath, params?.workerUrl || '', send)
      {
        const check = await verifyWorkerDeployment(env, workerConfigPath, send, {
          deployOutput: '',
          workerUrl: params?.workerUrl || '',
        })
        if (!check.ok) {
          throw new Error(`Worker deployment verification failed (${check.workerName || 'unknown'}): ${check.reason}`)
        }
        send(`Worker 已验证：${check.workerName}${check.method ? ` (${check.method})` : ''}`)
      }
      return
    case 'deploy-panel': {
      const workerUrl = normalizeHttpUrl(params?.workerUrl || '')
      const panelUrl = normalizeHttpUrl(params?.panelUrl || '')
      const tempDist = path.join(os.tmpdir(), 'tg-bot-panel-dist-' + Date.now())
      const viteBin = path.join(getAdminPanelDir(), 'node_modules', 'vite', 'bin', 'vite.js')
      const viteEnv = { ...env, ELECTRON_RUN_AS_NODE: '1', VITE_WORKER_BASE_URL: workerUrl }
      try { if (panelUrl) viteEnv.VITE_CANONICAL_HOST = new URL(panelUrl).host } catch {}
      send('正在构建 admin-panel...\n')
      await runProc(process.execPath, [viteBin, 'build', '--outDir', tempDist], { env: viteEnv, cwd: getAdminPanelDir() })
      send('正在上传到 Cloudflare Pages...\n')
      const projectName = getPagesProjectName(env)
      const projectBeforeDeploy = await getPagesProject(env, projectName)
      if (!projectBeforeDeploy?.ok) {
        if (String(projectBeforeDeploy.reason || '').includes('8000007')) {
          send(`Pages 项目不存在，正在自动创建：${projectName}`)
          const created = await createPagesProject(env, projectName)
          if (!created?.ok) {
            throw new Error(`创建 Pages 项目失败 ${projectName}: ${created?.reason || 'unknown'}`)
          }
          send(`Pages 项目已创建：${projectName}`)
        } else {
          throw new Error(`Pages 项目前置检查失败：${projectBeforeDeploy.reason || 'unknown'}`)
        }
      } else {
        send(`Pages 项目已存在，正在覆盖上传：${projectName}`)
      }

      const check = await getPagesProject(env, projectName)
      if (!check?.ok || !check.project) {
        throw new Error(`Pages 项目验证失败：${check?.reason || 'unknown'}`)
      }
      const project = check.project
      const subdomain = String(project.subdomain || '').trim()
      if (subdomain) {
        send(`Pages 项目已验证：${projectName} -> https://${subdomain}`)
      } else {
        send(`Pages 项目已验证：${projectName}`)
      }

      const deployedPanelUrl = subdomain ? normalizeHttpUrl(`https://${subdomain}`) : ''
      const beforeDeployments = await listPagesDeployments(env, projectName)
      const beforeDeploymentIds = new Set((beforeDeployments.deployments || []).map((item) => String(item.id || '')).filter(Boolean))
      let deployment
      try {
        const directDeployment = await deployPagesViaDirectUpload(tempDist, projectName, params?.branch || 'main', env, send)
        const directCheck = await verifyPagesDeployment(env, projectName, beforeDeploymentIds, {
          deployOutput: directDeployment.url || '',
          projectUrl: directDeployment.url || deployedPanelUrl,
          onProgress: send,
        })
        const method = directCheck.method === 'fallback-url' ? directDeployment.method : (directCheck.method || directDeployment.method)
        deployment = directCheck.ok
          ? { ...directCheck, method, url: directCheck.url || directDeployment.url || deployedPanelUrl, id: directCheck.id || directDeployment.id }
          : { ...directDeployment, url: directDeployment.url || deployedPanelUrl, warning: directCheck.reason || 'direct_upload_created_but_list_not_ready' }
      } catch (error) {
        throw new Error(`Pages 直传失败：${error instanceof Error ? error.message : String(error)}`)
      }
      if (!deployment.ok) {
        throw new Error(`Pages 部署验证失败：${deployment.reason || 'unknown'}`)
      }
      send(`Pages 部署已验证：${deployment.id || projectName}${deployment.url ? ` -> ${deployment.url}` : ''}${deployment.method ? ` (${deployment.method})` : ''}`)
      if (deployment.warning) {
        send(`Pages 部署列表警告：${deployment.warning}`)
      }

      const effectivePanelUrl = panelUrl || deployedPanelUrl || deployment.url
      const panelEntryUrl = buildAdminPanelEntryUrl(workerUrl) || effectivePanelUrl
      if (workerUrl || effectivePanelUrl) {
        const updatedVars = syncRuntimeUrlsToLocalConfig(workerUrl, effectivePanelUrl, env)
        if (updatedVars.length > 0) {
          send(`已更新账号变量配置：${updatedVars.join(', ')}`)
          await runScript('merge-wrangler-config.mjs', [], env)
        }
      }
      saveActiveDeployPrefsPatch({
        workerUrl: workerUrl || undefined,
        panelUrl: effectivePanelUrl || undefined,
        panelEntryUrl: panelEntryUrl || undefined,
      })

      try { fs.rmSync(tempDist, { recursive: true }) } catch {}
      if (panelEntryUrl && panelEntryUrl !== effectivePanelUrl) {
        send(`面板入口地址：${panelEntryUrl}`)
      }
      return { projectName, panelUrl: effectivePanelUrl, panelEntryUrl, subdomain }
    }
    case 'deploy-all': {
      const workerResult = await runAction('deploy-worker', params, env)
      const panelResult = await runAction('deploy-panel', params, env)
      return { worker: workerResult || null, panel: panelResult || null }
    }
    case 'first-deploy': {
      const { botToken, adminChatId, workerUrl, panelUrl } = params || {}
      let effectiveWorkerUrl = normalizeHttpUrl(workerUrl || '')
      const effectivePanelUrl = normalizeHttpUrl(panelUrl || '')
      const deployBootstrapToken = crypto.randomBytes(24).toString('hex')
      const workerSecrets = {
        BOT_TOKEN: botToken,
        ADMIN_CHAT_ID: adminChatId,
        DEPLOY_BOOTSTRAP_TOKEN: deployBootstrapToken,
      }
      send('步骤 1/4：合并配置...')
      await runScript('merge-wrangler-config.mjs', [], env)

      const updatedVars = syncRuntimeUrlsToLocalConfig(effectiveWorkerUrl, effectivePanelUrl, env, { TOPIC_MODE: 'true' })
      if (updatedVars.length > 0) {
        send(`已更新账号运行配置：${updatedVars.join(', ')}`)
        await runScript('merge-wrangler-config.mjs', [], env)
      }

      send('步骤 2/4：初始化 KV 和 D1...')
      await ensureKvBindingViaApi(env, {}, send)
      await ensureD1BindingViaApi(env, { skipMigrate: false }, send)
      {
        const postInitUpdates = syncRuntimeUrlsToLocalConfig(effectiveWorkerUrl, effectivePanelUrl, env)
        if (postInitUpdates.length > 0) {
          send(`已更新账号运行配置：${postInitUpdates.join(', ')}`)
        }
      }
      await runScript('merge-wrangler-config.mjs', [], env)
      send('步骤 3/4：部署 Worker...')
      const workerConfigPath = getPrivateWranglerPath(env)
      validatePrivateWranglerConfig(workerConfigPath)
      await uploadWorkerViaApi(env, workerConfigPath, send)
      await ensureWorkerCustomDomain(env, workerConfigPath, effectiveWorkerUrl, send)
      {
        const check = await verifyWorkerDeployment(env, workerConfigPath, send, {
          deployOutput: '',
          workerUrl: effectiveWorkerUrl,
        })
        if (!check.ok) {
          throw new Error(`Worker deployment verification failed (${check.workerName || 'unknown'}): ${check.reason}`)
        }
        send(`Worker 已验证：${check.workerName}${check.method ? ` (${check.method})` : ''}`)
      }
      if (!effectiveWorkerUrl) {
        try {
          const privateVars = parseVarsBlock(fs.readFileSync(workerConfigPath, 'utf8'))
          effectiveWorkerUrl = normalizeHttpUrl(privateVars.PUBLIC_BASE_URL || '')
        } catch {}
      }
      if (botToken || adminChatId) {
        await updateWorkerSecretsViaApi(env, workerConfigPath, workerSecrets, send)
        if (effectiveWorkerUrl) {
          const configReady = await waitForWorkerBotConfig(effectiveWorkerUrl, adminChatId, send)
          if (!configReady.ok) {
            send(`Worker 机器人配置警告：${configReady.reason || 'unknown'}`)
          }
        } else {
          send('Worker 机器人配置警告：缺少 Worker URL，已跳过运行时检查。')
        }
      }
      send('步骤 4/4：部署 Pages 面板...')
      const panelResult = await runAction('deploy-panel', { workerUrl: effectiveWorkerUrl, panelUrl: effectivePanelUrl }, env)
      if (panelResult?.panelUrl) {
        send(`Pages 面板地址：${panelResult.panelUrl}`)
      }
      if (panelResult?.panelEntryUrl) {
        send(`面板入口地址：${panelResult.panelEntryUrl}`)
      }
      const finalPanelUrl = panelResult?.panelUrl || effectivePanelUrl
      const finalPanelEntryUrl = panelResult?.panelEntryUrl || buildAdminPanelEntryUrl(effectiveWorkerUrl) || finalPanelUrl
      const finalRuntimeUpdates = syncRuntimeUrlsToLocalConfig(effectiveWorkerUrl, finalPanelUrl, env)
      if (finalRuntimeUpdates.length > 0) {
        send(`Pages 部署后正在更新 Worker 运行变量：${finalRuntimeUpdates.join(', ')}`)
        await runScript('merge-wrangler-config.mjs', [], env)
        await uploadWorkerViaApi(env, workerConfigPath, send)
        await ensureWorkerCustomDomain(env, workerConfigPath, effectiveWorkerUrl, send)
        const finalCheck = await verifyWorkerDeployment(env, workerConfigPath, send, {
          deployOutput: '',
          workerUrl: effectiveWorkerUrl,
        })
        if (!finalCheck.ok) {
          throw new Error(`Worker final runtime URL update failed (${finalCheck.workerName || 'unknown'}): ${finalCheck.reason}`)
        }
        send(`Worker 运行地址已更新：${finalCheck.workerName}`)
        if (botToken || adminChatId) {
          await updateWorkerSecretsViaApi(env, workerConfigPath, workerSecrets, send)
          if (effectiveWorkerUrl) {
            const configReady = await waitForWorkerBotConfig(effectiveWorkerUrl, adminChatId, send)
            if (!configReady.ok) {
              send(`Worker 机器人配置警告：${configReady.reason || 'unknown'}`)
            }
          } else {
            send('Worker 机器人配置警告：缺少 Worker URL，已跳过运行时检查。')
          }
        }
      }
      if (effectiveWorkerUrl) {
        await waitForWorkerHealth(effectiveWorkerUrl, send, 'Worker 入口')
      }
      if (botToken && effectiveWorkerUrl) {
        const bootstrap = await triggerDeployBootstrap(effectiveWorkerUrl, deployBootstrapToken, send)
        if (!bootstrap.ok) {
          send(`Worker 部署引导警告：${bootstrap.reason || 'unknown'}`)
        }
      }
      saveActiveDeployPrefsPatch({
        botToken: botToken || undefined,
        adminChatId: adminChatId || undefined,
        workerUrl: effectiveWorkerUrl || undefined,
        panelUrl: finalPanelUrl || undefined,
        panelEntryUrl: finalPanelEntryUrl || undefined,
        openPanelInClient: Boolean(params?.openPanelInClient),
      })
      send('\n首次部署完成。')
      return { panelUrl: finalPanelUrl, panelEntryUrl: finalPanelEntryUrl, workerUrl: effectiveWorkerUrl }
    }
  }
}

// window
function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 720,
    title: 'TG Bot Deploy Tool',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  })
  win.loadFile(path.join(__dirname, 'index.html'))
  win.setMenu(null)
}

// IPC
ipcMain.handle('run-action', async (_, action, params) => {
  const account = getActiveAccount()
  const env = buildEnv(account)
  return await runAction(action, params, env)
})

ipcMain.handle('accounts:list', () => loadAccounts())
ipcMain.handle('accounts:add', (_, account) => {
  const accounts = loadAccounts()
  const newAccount = { ...account, id: crypto.randomUUID(), deployPrefs: normalizeDeployPrefs(account?.deployPrefs) }
  accounts.push(newAccount)
  saveAccounts(accounts)
  if (!activeAccountId) {
    activeAccountId = newAccount.id
    fs.writeFileSync(activeFile(), activeAccountId)
  }
  return accounts
})
ipcMain.handle('accounts:delete', (_, id) => {
  const before = loadAccounts()
  const removed = before.find(a => a.id === id)
  const accounts = before.filter(a => a.id !== id)
  saveAccounts(accounts)
  if (removed?.accountId && !accounts.some((item) => item.accountId === removed.accountId)) {
    try { fs.rmSync(getAccountConfigDir(removed), { recursive: true, force: true }) } catch {}
  }
  if (activeAccountId === id) {
    activeAccountId = accounts[0]?.id || null
    if (activeAccountId) fs.writeFileSync(activeFile(), activeAccountId)
    else try { fs.rmSync(activeFile(), { force: true }) } catch {}
  }
  return accounts
})
ipcMain.handle('accounts:setActive', (_, id) => {
  activeAccountId = id
  fs.writeFileSync(activeFile(), id)
  return id
})
ipcMain.handle('accounts:getActive', () => activeAccountId)
ipcMain.handle('accounts:saveDeployPrefs', (_, prefs) => {
  return saveActiveDeployPrefsPatch(prefs)
})
ipcMain.handle('data:clear', () => {
  const dir = app.getPath('userData')
  try { fs.rmSync(path.join(dir, 'accounts.json'), { force: true }) } catch {}
  try { fs.rmSync(path.join(dir, 'active-account.txt'), { force: true }) } catch {}
  try { fs.rmSync(path.join(dir, 'cf-accounts'), { recursive: true, force: true }) } catch {}
  activeAccountId = null
})
ipcMain.handle('get-repo-root', () => getRepoRoot())

app.whenReady().then(() => {
  try { activeAccountId = fs.readFileSync(activeFile(), 'utf8').trim() } catch {}
  createWindow()
})
app.on('window-all-closed', () => app.quit())

