import './style.css';
import {
  createDefaultFormState,
  loadSavedFormState,
  runDeploy,
  saveFormState,
  type DeployFormState,
} from './deploy';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('missing #app container');
}

app.innerHTML = `
  <main class="layout">
    <header class="hero">
      <h1>TG Bot 安卓部署客户端</h1>
      <p>本地一键部署：KV + D1 + Worker + Pages + Secrets + Webhook。</p>
    </header>

    <section class="card">
      <h2>部署配置</h2>
      <div class="grid">
        <label>
          <span>Cloudflare API Token</span>
          <input id="cfApiToken" type="password" placeholder="请填写具有 Workers/KV/D1/Pages 权限的 Token" autocomplete="off" />
        </label>
        <label>
          <span>Cloudflare Account ID</span>
          <input id="cfAccountId" placeholder="例如：3aa82d74b0c7..." autocomplete="off" />
        </label>
        <label>
          <span>Worker Name</span>
          <input id="workerName" placeholder="telegram-private-chatbot" />
        </label>
        <label>
          <span>KV Namespace Title</span>
          <input id="kvNamespaceTitle" placeholder="tg-bot-kv" />
        </label>
        <label>
          <span>D1 Database Name</span>
          <input id="d1DatabaseName" placeholder="tg-bot-history" />
        </label>
        <label>
          <span>BOT_TOKEN</span>
          <input id="botToken" type="password" placeholder="从 @BotFather 获取" autocomplete="off" />
        </label>
        <label>
          <span>ADMIN_CHAT_ID</span>
          <input id="adminChatId" placeholder="管理员用户 ID 或群组 ID" />
        </label>
        <label>
          <span>Worker URL（可选）</span>
          <input id="workerUrl" placeholder="自定义域名，例如 https://bot.example.com" />
        </label>
        <label>
          <span>验证域名（可选）</span>
          <input id="verifyPublicBaseUrl" placeholder="例如 https://verify.example.com" />
        </label>
        <label>
          <span>管理面板 URL（可选）</span>
          <input id="panelUrl" placeholder="留空时自动使用 Pages 部署 URL" />
        </label>
      </div>

      <div class="switch-row">
        <label class="switch">
          <input id="deployPanel" type="checkbox" />
          <span>自动部署 Pages 管理面板</span>
        </label>
      </div>

      <div class="grid grid-pages">
        <label>
          <span>Pages Project Name</span>
          <input id="pagesProjectName" placeholder="例如 telegram-private-chatbot-panel" />
        </label>
        <label>
          <span>Pages Branch</span>
          <input id="pagesBranch" placeholder="main" />
        </label>
      </div>

      <div class="actions">
        <button id="saveBtn" type="button" class="secondary">保存配置</button>
        <button id="clearLogBtn" type="button" class="secondary">清空日志</button>
        <button id="deployBtn" type="button" class="primary">开始部署</button>
      </div>

      <p id="status" class="status idle">待命中</p>
    </section>

    <section class="card log-card">
      <div class="log-head">
        <h2>执行日志</h2>
      </div>
      <pre id="logs" class="logs"></pre>
    </section>
  </main>
`;

const textFields: Array<
  Exclude<keyof DeployFormState, 'deployPanel'>
> = [
  'cfApiToken',
  'cfAccountId',
  'workerName',
  'kvNamespaceTitle',
  'd1DatabaseName',
  'botToken',
  'adminChatId',
  'workerUrl',
  'verifyPublicBaseUrl',
  'panelUrl',
  'pagesProjectName',
  'pagesBranch',
];

const statusNode = document.querySelector<HTMLElement>('#status');
const logsNode = document.querySelector<HTMLElement>('#logs');
const saveBtn = document.querySelector<HTMLButtonElement>('#saveBtn');
const clearLogBtn = document.querySelector<HTMLButtonElement>('#clearLogBtn');
const deployBtn = document.querySelector<HTMLButtonElement>('#deployBtn');
const deployPanelCheckbox = document.querySelector<HTMLInputElement>('#deployPanel');

let busy = false;

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

function getInput(name: Exclude<keyof DeployFormState, 'deployPanel'>): HTMLInputElement {
  const node = document.querySelector<HTMLInputElement>(`#${name}`);
  if (!node) throw new Error(`missing input ${name}`);
  return node;
}

function setStatus(text: string, mode: 'idle' | 'running' | 'ok' | 'error'): void {
  if (!statusNode) return;
  statusNode.textContent = text;
  statusNode.className = `status ${mode}`;
}

function appendLog(text: string): void {
  if (!logsNode) return;
  const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  logsNode.textContent += `[${stamp}] ${text}\n`;
  logsNode.scrollTop = logsNode.scrollHeight;
}

function clearLogs(): void {
  if (!logsNode) return;
  logsNode.textContent = '';
}

function getFormState(): DeployFormState {
  const state = {} as DeployFormState;
  for (const key of textFields) {
    state[key] = getInput(key).value as DeployFormState[typeof key];
  }
  state.deployPanel = Boolean(deployPanelCheckbox?.checked);
  return state;
}

function setFormState(state: Partial<DeployFormState>): void {
  for (const key of textFields) {
    if (state[key] === undefined) continue;
    getInput(key).value = String(state[key] || '');
  }
  if (deployPanelCheckbox) {
    deployPanelCheckbox.checked = state.deployPanel !== undefined ? Boolean(state.deployPanel) : true;
  }
}

function setBusy(nextBusy: boolean): void {
  busy = nextBusy;
  for (const key of textFields) {
    getInput(key).disabled = nextBusy;
  }
  if (deployPanelCheckbox) deployPanelCheckbox.disabled = nextBusy;
  if (saveBtn) saveBtn.disabled = nextBusy;
  if (deployBtn) deployBtn.disabled = nextBusy;
}

function refreshPagesFieldsState(): void {
  const disabled = !(deployPanelCheckbox?.checked);
  getInput('pagesProjectName').disabled = disabled || busy;
  getInput('pagesBranch').disabled = disabled || busy;
}

async function saveCurrentForm(showLog = true): Promise<void> {
  const state = getFormState();
  await saveFormState(state);
  if (showLog) appendLog('配置已保存到本地。');
}

async function bootstrapForm(): Promise<void> {
  setStatus('正在加载默认配置...', 'running');
  const defaults = await createDefaultFormState();
  const saved = await loadSavedFormState();
  const merged = {
    ...defaults,
    ...saved,
  };
  setFormState(merged);
  refreshPagesFieldsState();
  setStatus('待命中', 'idle');
}

function bindAutoProjectName(): void {
  const workerInput = getInput('workerName');
  const pagesInput = getInput('pagesProjectName');

  if (!pagesInput.value.trim()) {
    pagesInput.value = suggestPagesProjectName(workerInput.value);
  }

  workerInput.addEventListener('change', () => {
    if (pagesInput.dataset.edited === '1') return;
    pagesInput.value = suggestPagesProjectName(workerInput.value);
  });

  pagesInput.addEventListener('input', () => {
    pagesInput.dataset.edited = '1';
  });
}

async function onDeploy(): Promise<void> {
  if (busy) return;
  try {
    clearLogs();
    setBusy(true);
    refreshPagesFieldsState();
    setStatus('部署执行中...', 'running');
    await saveCurrentForm(false);
    appendLog('已开始执行部署。');
    appendLog('浏览器模式可能受 CORS 限制，安卓原生环境建议优先使用。');

    const result = await runDeploy(getFormState(), appendLog);

    if (result.bootstrapOk) {
      setStatus('部署完成', 'ok');
    } else {
      setStatus('部署完成（含警告）', 'ok');
    }

    appendLog('部署完成摘要:');
    appendLog(`Worker: ${result.workerName}`);
    appendLog(`Worker URL: ${result.workerUrl}`);
    appendLog(`Webhook: ${result.webhookUrl}`);
    appendLog(`Panel URL: ${result.panelUrl || '未设置'}`);
    appendLog(`Panel Entry: ${result.panelEntryUrl || '未设置'}`);
    appendLog(`Pages Project: ${result.pagesProjectName || '未设置'}`);
    appendLog(`KV Namespace ID: ${result.kvNamespaceId}`);
    appendLog(`D1 Database ID: ${result.d1DatabaseId}`);
    if (!result.bootstrapOk) {
      appendLog(`部署引导警告: ${result.bootstrapReason}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`部署失败: ${message}`, 'error');
    appendLog(`部署失败: ${message}`);
  } finally {
    setBusy(false);
    refreshPagesFieldsState();
  }
}

if (saveBtn) {
  saveBtn.addEventListener('click', async () => {
    if (busy) return;
    try {
      await saveCurrentForm(true);
      setStatus('配置已保存', 'idle');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`保存失败: ${message}`, 'error');
      appendLog(`保存失败: ${message}`);
    }
  });
}

if (clearLogBtn) {
  clearLogBtn.addEventListener('click', () => {
    clearLogs();
  });
}

if (deployBtn) {
  deployBtn.addEventListener('click', () => {
    void onDeploy();
  });
}

if (deployPanelCheckbox) {
  deployPanelCheckbox.addEventListener('change', () => {
    refreshPagesFieldsState();
  });
}

bindAutoProjectName();

void bootstrapForm().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  setStatus(`初始化失败: ${message}`, 'error');
  appendLog(`初始化失败: ${message}`);
});
