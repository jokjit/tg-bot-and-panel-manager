const { app, BrowserWindow, ipcMain, safeStorage, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')
const crypto = require('crypto')

// paths
function findRepoRoot() {
  if (!app.isPackaged) return path.join(__dirname, '..')
  return process.resourcesPath
}

let _repoRoot, _scriptsDir, _adminPanelDir
function getRepoRoot() { return _repoRoot || (_repoRoot = findRepoRoot()) }
function getScriptsDir() { return _scriptsDir || (_scriptsDir = app.isPackaged ? path.join(process.resourcesPath, 'scripts') : path.join(__dirname, '..', 'scripts')) }
function getAdminPanelDir() { return _adminPanelDir || (_adminPanelDir = app.isPackaged ? path.join(process.resourcesPath, 'admin-panel') : path.join(__dirname, '..', 'admin-panel')) }

function getWranglerJs() {
  return path.join(getScriptsDir(), 'wrangler-runner.cjs')
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
  return {
    botToken: asText(input.botToken),
    adminChatId: asText(input.adminChatId),
    workerUrl: asText(input.workerUrl),
    panelUrl: asText(input.panelUrl),
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
    // setup-d1.mjs expects this wrapper to normalize argv in Electron node mode
    WRANGLER_JS: getWranglerJs(),
    NODE_PATH: app.isPackaged ? path.join(process.resourcesPath, 'node_modules') : path.join(__dirname, '..', 'electron-app', 'node_modules')
  }
  if (account) {
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
  try {
    const parsed = new URL(text)
    if (!/^https?:$/.test(parsed.protocol)) return ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
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

function syncRuntimeUrlsToLocalConfig(workerUrl, panelUrl) {
  const localPath = path.join(getRepoRoot(), 'wrangler.local.toml')
  if (!fs.existsSync(localPath)) return []

  const updates = {}
  const normalizedWorker = normalizeHttpUrl(workerUrl)
  const normalizedPanel = normalizeHttpUrl(panelUrl)
  if (normalizedWorker) updates.PUBLIC_BASE_URL = normalizedWorker
  if (normalizedPanel) updates.ADMIN_PANEL_URL = normalizedPanel

  const current = fs.readFileSync(localPath, 'utf8')
  const { content, updatedKeys } = upsertVarsBlock(current, updates)
  if (updatedKeys.length > 0 && content !== current) {
    fs.writeFileSync(localPath, content, 'utf8')
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

function getWorkerNameFromConfig(configPath) {
  if (!fs.existsSync(configPath)) return ''
  const content = fs.readFileSync(configPath, 'utf8')
  const match = content.match(/^\s*name\s*=\s*"([^"]+)"/m)
  return match?.[1]?.trim() || ''
}

async function getWorkerScript(env, workerName) {
  const token = String(env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || '').trim()
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim()
  if (!token || !accountId || !workerName) {
    return { ok: false, reason: 'missing_token_or_account_or_worker_name' }
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (response.ok) return { ok: true }

  const text = await response.text().catch(() => '')
  try {
    const json = JSON.parse(text)
    const errors = Array.isArray(json?.errors) ? json.errors : []
    const reason = errors.length > 0
      ? errors.map((item) => `${item.code || 'unknown'}:${item.message || 'unknown'}`).join('; ')
      : `http_${response.status}`
    return { ok: false, reason }
  } catch {
    return { ok: false, reason: `http_${response.status}` }
  }
}

async function verifyWorkerDeployment(env, configPath) {
  const workerName = getWorkerNameFromConfig(configPath)
  if (!workerName) {
    return { ok: false, workerName: '', reason: 'missing_worker_name_in_config' }
  }
  const check = await getWorkerScript(env, workerName)
  if (!check.ok) {
    return { ok: false, workerName, reason: check.reason || 'unknown' }
  }
  return { ok: true, workerName }
}

// process runner
function runProc(bin, args, opts) {
  return new Promise((resolve, reject) => {
    const commandText = [bin, ...args].join(' ')
    BrowserWindow.getAllWindows()[0]?.webContents.send('output', `\n> ${commandText}\n`)
    const proc = spawn(bin, args, { cwd: getRepoRoot(), windowsHide: true, ...opts })
    const send = (data) => {
      const text = data.toString()
      if (/cache_util_win|gpu_disk_cache|disk_cache\.cc|Unable to (move|create) cache|Gpu Cache/.test(text)) return
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
        reject(new Error(`Command failed (exit ${code}): ${commandText}`))
        return
      }
      resolve(code ?? 0)
    })
  })
}
function runScript(scriptName, args = [], env) {
  return runProc(process.execPath, [path.join(getScriptsDir(), scriptName), ...args], {
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' }
  })
}

function runWrangler(args, env) {
  return runProc(process.execPath, [getWranglerJs(), ...args], {
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' }
  })
}

function runWranglerSecret(key, value, env) {
  return new Promise((resolve, reject) => {
    const args = [getWranglerJs(), 'secret', 'put', key, '--config', '.wrangler.private.toml']
    const commandText = [process.execPath, ...args].join(' ')
    const proc = spawn(process.execPath, args, {
      cwd: getRepoRoot(), windowsHide: true,
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const send = (data) => BrowserWindow.getAllWindows()[0]?.webContents.send('output', data.toString())
    proc.stdout?.on('data', send)
    proc.stderr?.on('data', send)
    proc.stdin.write(value + '\n')
    proc.stdin.end()
    proc.on('error', (err) => {
      send('Start failed: ' + err.message + '\n')
      reject(new Error(`Command start failed: ${commandText}\n${err.message}`))
    })
    proc.on('close', (code) => {
      if (code !== 0) {
        send(`\n[Exit code ${code}]\n`)
        reject(new Error(`Command failed (exit ${code}): ${commandText}`))
        return
      }
      resolve(code ?? 0)
    })
  })
}
// actions
async function runAction(action, params, env) {
  const send = (msg) => BrowserWindow.getAllWindows()[0]?.webContents.send('output', msg + '\n')

  switch (action) {
    case 'show-config': {
      const toml = fs.existsSync(path.join(getRepoRoot(), 'wrangler.toml'))
        ? fs.readFileSync(path.join(getRepoRoot(), 'wrangler.toml'), 'utf8') : 'missing wrangler.toml'
      const local = fs.existsSync(path.join(getRepoRoot(), 'wrangler.local.toml'))
        ? fs.readFileSync(path.join(getRepoRoot(), 'wrangler.local.toml'), 'utf8') : 'missing wrangler.local.toml'
      send('=== wrangler.toml ===\n' + toml)
      send('\n=== wrangler.local.toml ===\n' + local)
      return
    }
    case 'merge-config':
      await runScript('merge-wrangler-config.mjs', [], env)
      return
    case 'setup-d1':
      await runScript('merge-wrangler-config.mjs', [], env)
      await runScript('setup-d1.mjs', [], env)
      return
    case 'deploy-worker':
      await runScript('merge-wrangler-config.mjs', [], env)
      await runWrangler(['deploy', '--config', '.wrangler.private.toml'], env)
      {
        const check = await verifyWorkerDeployment(env, path.join(getRepoRoot(), '.wrangler.private.toml'))
        if (!check.ok) {
          throw new Error(`Worker deployment verification failed (${check.workerName || 'unknown'}): ${check.reason}`)
        }
        send(`Worker verified: ${check.workerName}`)
      }
      return
    case 'deploy-panel': {
      const workerUrl = params?.workerUrl || ''
      const panelUrl = normalizeHttpUrl(params?.panelUrl || '')
      const tempDist = path.join(os.tmpdir(), 'tg-bot-panel-dist-' + Date.now())
      const viteBin = path.join(getAdminPanelDir(), 'node_modules', 'vite', 'bin', 'vite.js')
      const viteEnv = { ...env, ELECTRON_RUN_AS_NODE: '1', VITE_WORKER_BASE_URL: workerUrl }
      try { if (panelUrl) viteEnv.VITE_CANONICAL_HOST = new URL(panelUrl).host } catch {}
      send('Building admin-panel...\n')
      await runProc(process.execPath, [viteBin, 'build', '--outDir', tempDist], { env: viteEnv, cwd: getAdminPanelDir() })
      send('Uploading to Cloudflare Pages...\n')
      const projectName = 'tg-admin-panel'
      const projectBeforeDeploy = await getPagesProject(env, projectName)
      if (!projectBeforeDeploy?.ok) {
        if (String(projectBeforeDeploy.reason || '').includes('8000007')) {
          send(`Pages project not found, creating automatically: ${projectName}`)
          const created = await createPagesProject(env, projectName)
          if (!created?.ok) {
            throw new Error(`Failed to create Pages project ${projectName}: ${created?.reason || 'unknown'}`)
          }
          send(`Pages project created: ${projectName}`)
        } else {
          throw new Error(`Pages project precheck failed: ${projectBeforeDeploy.reason || 'unknown'}`)
        }
      }

      const deployArgs = ['pages', 'deploy', tempDist, '--project-name', projectName]
      if (params?.branch) deployArgs.push('--branch', params.branch)
      await runWrangler(deployArgs, { ...env, ELECTRON_RUN_AS_NODE: '1' })

      const check = await getPagesProject(env, projectName)
      if (!check?.ok || !check.project) {
        throw new Error(`Pages upload command finished but project verification failed: ${check?.reason || 'unknown'}`)
      }
      const project = check.project
      const subdomain = String(project.subdomain || '').trim()
      if (subdomain) {
        send(`Pages project verified: ${projectName} -> https://${subdomain}`)
      } else {
        send(`Pages project verified: ${projectName}`)
      }

      const deployedPanelUrl = subdomain ? normalizeHttpUrl(`https://${subdomain}`) : ''
      const effectivePanelUrl = panelUrl || deployedPanelUrl
      if (workerUrl || effectivePanelUrl) {
        const updatedVars = syncRuntimeUrlsToLocalConfig(workerUrl, effectivePanelUrl)
        if (updatedVars.length > 0) {
          send(`Updated wrangler.local.toml vars: ${updatedVars.join(', ')}`)
          await runScript('merge-wrangler-config.mjs', [], env)
        }
      }
      saveActiveDeployPrefsPatch({
        workerUrl: workerUrl || undefined,
        panelUrl: effectivePanelUrl || undefined,
      })

      try { fs.rmSync(tempDist, { recursive: true }) } catch {}
      return { projectName, panelUrl: effectivePanelUrl, subdomain }
    }
    case 'deploy-all': {
      const workerResult = await runAction('deploy-worker', params, env)
      const panelResult = await runAction('deploy-panel', params, env)
      return { worker: workerResult || null, panel: panelResult || null }
    }
    case 'first-deploy': {
      const { botToken, adminChatId, workerUrl, panelUrl } = params || {}
      const effectivePanelUrl = normalizeHttpUrl(panelUrl || '')
      send('Step 1/4: Merging config...')
      await runScript('merge-wrangler-config.mjs', [], env)

      const updatedVars = syncRuntimeUrlsToLocalConfig(workerUrl, effectivePanelUrl)
      if (updatedVars.length > 0) {
        send(`Updated wrangler.local.toml vars: ${updatedVars.join(', ')}`)
        await runScript('merge-wrangler-config.mjs', [], env)
      }

      send('Step 2/4: Initializing D1...')
      await runScript('setup-d1.mjs', [], env)
      send('Step 3/4: Deploying Worker...')
      await runWrangler(['deploy', '--config', '.wrangler.private.toml'], env)
      {
        const check = await verifyWorkerDeployment(env, path.join(getRepoRoot(), '.wrangler.private.toml'))
        if (!check.ok) {
          throw new Error(`Worker deployment verification failed (${check.workerName || 'unknown'}): ${check.reason}`)
        }
        send(`Worker verified: ${check.workerName}`)
      }
      if (botToken) await runWranglerSecret('BOT_TOKEN', botToken, env)
      if (adminChatId) await runWranglerSecret('ADMIN_CHAT_ID', adminChatId, env)
      send('Step 4/4: Deploying Pages panel...')
      const panelResult = await runAction('deploy-panel', { workerUrl, panelUrl: effectivePanelUrl }, env)
      if (panelResult?.panelUrl) {
        send(`Panel URL: ${panelResult.panelUrl}`)
      }
      send('\nFirst deployment completed.')
      return { panelUrl: panelResult?.panelUrl || effectivePanelUrl }
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
  const accounts = loadAccounts().filter(a => a.id !== id)
  saveAccounts(accounts)
  if (activeAccountId === id) activeAccountId = accounts[0]?.id || null
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
  activeAccountId = null
})
ipcMain.handle('get-repo-root', () => getRepoRoot())

app.whenReady().then(() => {
  try { activeAccountId = fs.readFileSync(activeFile(), 'utf8').trim() } catch {}
  createWindow()
})
app.on('window-all-closed', () => app.quit())

