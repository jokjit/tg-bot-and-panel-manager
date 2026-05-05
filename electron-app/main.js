const { app, BrowserWindow, ipcMain, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')
const crypto = require('crypto')

// ── paths ──────────────────────────────────────────────────────────────────
function findRepoRoot() {
  if (!app.isPackaged) return path.join(__dirname, '..')
  let dir = path.dirname(process.execPath)
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'wrangler.toml'))) return dir
    dir = path.dirname(dir)
  }
  return path.dirname(process.execPath)
}

let _repoRoot, _scriptsDir, _adminPanelDir
function getRepoRoot() { return _repoRoot || (_repoRoot = findRepoRoot()) }
function getScriptsDir() { return _scriptsDir || (_scriptsDir = app.isPackaged ? path.join(process.resourcesPath, 'scripts') : path.join(__dirname, '..', 'scripts')) }
function getAdminPanelDir() { return _adminPanelDir || (_adminPanelDir = app.isPackaged ? path.join(process.resourcesPath, 'admin-panel') : path.join(__dirname, '..', 'admin-panel')) }

function getWranglerBin() {
  if (!app.isPackaged) return process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler'
  return path.join(process.resourcesPath, 'node_modules', '.bin',
    process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler')
}

// ── accounts ───────────────────────────────────────────────────────────────
function getDataDir() {
  const dir = app.isPackaged
    ? path.join(path.dirname(process.execPath), 'data')
    : path.join(__dirname, 'data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}
const accountsFile = () => path.join(getDataDir(), 'accounts.json')
const activeFile = () => path.join(getDataDir(), 'active-account.txt')
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

// ── env injection ──────────────────────────────────────────────────────────
function buildEnv(account) {
  const binDir = app.isPackaged
    ? path.join(process.resourcesPath, 'node_modules', '.bin')
    : null
  const env = { ...process.env }
  if (account) {
    if (account.apiToken) env.CLOUDFLARE_API_TOKEN = account.apiToken
    if (account.accountId) env.CLOUDFLARE_ACCOUNT_ID = account.accountId
  }
  if (binDir) {
    env.PATH = binDir + path.delimiter + (env.PATH || '')
  }
  return env
}

// ── process runner ─────────────────────────────────────────────────────────
function runProc(bin, args, opts) {
  return new Promise((resolve) => {
    const proc = spawn(bin, args, { cwd: getRepoRoot(), ...opts })
    const send = (data) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('output', data.toString())
    }
    proc.stdout?.on('data', send)
    proc.stderr?.on('data', send)
    proc.on('close', (code) => resolve(code))
  })
}

function runScript(scriptName, args = [], env) {
  return runProc(process.execPath, [path.join(getScriptsDir(), scriptName), ...args], { env })
}

function runWrangler(args, env) {
  return runProc(getWranglerBin(), args, { env, shell: process.platform === 'win32' })
}

// ── actions ────────────────────────────────────────────────────────────────
async function runAction(action, params, env) {
  const send = (msg) => BrowserWindow.getAllWindows()[0]?.webContents.send('output', msg + '\n')

  switch (action) {
    case 'show-config': {
      const toml = fs.existsSync(path.join(getRepoRoot(), 'wrangler.toml'))
        ? fs.readFileSync(path.join(getRepoRoot(), 'wrangler.toml'), 'utf8') : '未找到 wrangler.toml'
      const local = fs.existsSync(path.join(getRepoRoot(), 'wrangler.local.toml'))
        ? fs.readFileSync(path.join(getRepoRoot(), 'wrangler.local.toml'), 'utf8') : '未找到 wrangler.local.toml'
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
      return
    case 'deploy-panel': {
      const workerUrl = params?.workerUrl || ''
      const panelUrl = params?.panelUrl || ''
      const tempDist = path.join(os.tmpdir(), 'tg-bot-panel-dist-' + Date.now())
      const viteBin = path.join(getAdminPanelDir(), 'node_modules', 'vite', 'bin', 'vite.js')
      const buildEnv = { ...env, VITE_WORKER_BASE_URL: workerUrl }
      if (panelUrl) buildEnv.VITE_CANONICAL_HOST = new URL(panelUrl).host
      send('构建 admin-panel...\n')
      await runProc(process.execPath, [viteBin, 'build', '--outDir', tempDist], { env: buildEnv, cwd: getAdminPanelDir() })
      send('上传到 Cloudflare Pages...\n')
      const deployArgs = ['pages', 'deploy', tempDist, '--project-name', 'tg-admin-panel']
      if (params?.branch) deployArgs.push('--branch', params.branch)
      await runWrangler(deployArgs, env)
      try { fs.rmSync(tempDist, { recursive: true }) } catch {}
      return
    }
    case 'deploy-all':
      await runAction('deploy-worker', params, env)
      await runAction('deploy-panel', params, env)
      return
    case 'first-deploy': {
      const { botToken, adminChatId, workerUrl, panelUrl } = params || {}
      const useBuiltinPanel = panelUrl && workerUrl && panelUrl === workerUrl.replace(/\/$/, '') + '/admin'
      send('步骤 1/4: 合并配置...')
      await runScript('merge-wrangler-config.mjs', [], env)
      send('步骤 2/4: 初始化 D1...')
      await runScript('setup-d1.mjs', [], env)
      send('步骤 3/4: 部署 Worker...')
      await runWrangler(['deploy', '--config', '.wrangler.private.toml'], env)
      if (botToken) await runWrangler(['secret', 'put', 'BOT_TOKEN', '--config', '.wrangler.private.toml'], { ...env, input: botToken })
      if (adminChatId) await runWrangler(['secret', 'put', 'ADMIN_CHAT_ID', '--config', '.wrangler.private.toml'], { ...env, input: adminChatId })
      if (useBuiltinPanel) {
        send('步骤 4/4: 使用 Worker 内置面板，跳过 Pages 部署。\n面板地址：' + panelUrl)
      } else {
        send('步骤 4/4: 部署面板...')
        await runAction('deploy-panel', { workerUrl, panelUrl }, env)
      }
      send('\n首次部署完成！')
      return
    }
  }
}

// ── window ─────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 720,
    title: 'TG Bot 部署工具',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  })
  win.loadFile(path.join(__dirname, 'index.html'))
  win.setMenu(null)
}

// ── IPC ────────────────────────────────────────────────────────────────────
ipcMain.handle('run-action', async (_, action, params) => {
  const account = getActiveAccount()
  const env = buildEnv(account)
  await runAction(action, params, env)
})

ipcMain.handle('accounts:list', () => loadAccounts())
ipcMain.handle('accounts:add', (_, account) => {
  const accounts = loadAccounts()
  accounts.push({ ...account, id: crypto.randomUUID() })
  saveAccounts(accounts)
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
ipcMain.handle('data:clear', () => {
  const dir = getDataDir()
  fs.rmSync(dir, { recursive: true, force: true })
  activeAccountId = null
})
ipcMain.handle('get-repo-root', () => getRepoRoot())

app.whenReady().then(() => {
  try { activeAccountId = fs.readFileSync(activeFile(), 'utf8').trim() } catch {}
  createWindow()
})
app.on('window-all-closed', () => app.quit())
