import './style.css';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import {
  createDefaultFormState,
  fetchDashboardSnapshot,
  loadSavedFormState,
  runDeploy,
  type DashboardSnapshot,
  type DeployFormState,
} from './deploy';

type Locale = 'zh' | 'en';
type Theme = 'light' | 'dark';
type TextField = Exclude<keyof DeployFormState, 'deployPanel'>;
type ViewId = 'home' | 'account' | 'deploy' | 'logs';

interface AccountState {
  id: string;
  name: string;
  email: string;
  createdAt: number;
  updatedAt: number;
  form: DeployFormState;
}

interface UiCache {
  version: 1;
  locale: Locale;
  theme: Theme;
  activeAccountId: string;
  accounts: AccountState[];
}

interface LocaleDict {
  [key: string]: string;
}

const APP_STATE_KEY = 'tg_bot_mobile_ui_state_v1';
const AUTOSAVE_DELAY_MS = 380;

const formTextFields: TextField[] = [
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

type DashboardMetricKey =
  | 'workerRequests24h'
  | 'workersScriptCount'
  | 'kvNamespaceCount'
  | 'd1DatabaseCount'
  | 'pagesProjectCount';

type DashboardUsageKey =
  | DashboardMetricKey
  | 'kvReadRequests24h'
  | 'kvWriteRequests24h'
  | 'kvStorageBytes'
  | 'd1StorageBytes'
  | 'd1ReadRequests24h'
  | 'd1WriteRequests24h';

type DashboardValueFormat = 'number' | 'bytes';

interface DashboardMetricBinding {
  key: DashboardMetricKey;
  labelId: string;
  usedId: string;
  totalId: string;
  percentId: string;
  ringId: string;
  cardId: string;
}

interface DashboardLimitRowDefinition {
  targetKey: DashboardMetricKey;
  labelKey: string;
  sourceKey: DashboardUsageKey | null;
  limitNumber: number | null;
  limitTextKey?: string;
}

const DASHBOARD_FREE_TOTALS: Record<DashboardMetricKey, number> = {
  workerRequests24h: 100000,
  workersScriptCount: 100,
  kvNamespaceCount: 1000,
  d1DatabaseCount: 10,
  pagesProjectCount: 100,
};

const D1_STORAGE_FREE_BYTES = 5 * 1024 * 1024 * 1024;
const D1_READS_FREE_24H = 5_000_000;
const D1_WRITES_FREE_24H = 100_000;
const KV_STORAGE_FREE_BYTES = 1 * 1024 * 1024 * 1024;
const KV_READS_FREE_24H = 100_000;
const KV_WRITES_FREE_24H = 1_000;

const DASHBOARD_BINDINGS: DashboardMetricBinding[] = [
  {
    key: 'workerRequests24h',
    labelId: 'dashLabelRequests',
    usedId: 'dashUsedRequests',
    totalId: 'dashTotalRequests',
    percentId: 'dashPctRequests',
    ringId: 'dashRingRequests',
    cardId: 'dashCardRequests',
  },
  {
    key: 'workersScriptCount',
    labelId: 'dashLabelWorkers',
    usedId: 'dashUsedWorkers',
    totalId: 'dashTotalWorkers',
    percentId: 'dashPctWorkers',
    ringId: 'dashRingWorkers',
    cardId: 'dashCardWorkers',
  },
  {
    key: 'kvNamespaceCount',
    labelId: 'dashLabelKv',
    usedId: 'dashUsedKv',
    totalId: 'dashTotalKv',
    percentId: 'dashPctKv',
    ringId: 'dashRingKv',
    cardId: 'dashCardKv',
  },
  {
    key: 'd1DatabaseCount',
    labelId: 'dashLabelD1',
    usedId: 'dashUsedD1',
    totalId: 'dashTotalD1',
    percentId: 'dashPctD1',
    ringId: 'dashRingD1',
    cardId: 'dashCardD1',
  },
  {
    key: 'pagesProjectCount',
    labelId: 'dashLabelPages',
    usedId: 'dashUsedPages',
    totalId: 'dashTotalPages',
    percentId: 'dashPctPages',
    ringId: 'dashRingPages',
    cardId: 'dashCardPages',
  },
];

const DASHBOARD_LIMIT_ROWS: DashboardLimitRowDefinition[] = [
  {
    targetKey: 'pagesProjectCount',
    labelKey: 'dash_limit_row_pages_builds',
    sourceKey: null,
    limitNumber: null,
    limitTextKey: 'dash_limit_value_pages_builds',
  },
];

const DASHBOARD_EXTRA_CONTAINER_IDS: Partial<Record<DashboardMetricKey, string>> = {
  kvNamespaceCount: 'dashExtraKv',
  d1DatabaseCount: 'dashExtraD1',
  pagesProjectCount: 'dashExtraPages',
};

const DASHBOARD_ORPHAN_EXCLUDE_CARD_IDS = new Set(['dashCardKv', 'dashCardD1']);

const i18n: Record<Locale, LocaleDict> = {
  zh: {
    badge: 'MIUIX Style',
    title: 'TG Bot 移动端部署客户端',
    subtitle: '本地一键部署 Worker、KV、D1、Pages、Secrets 与 Webhook。',
    chip_cache: '配置自动缓存',
    chip_multi: '多账号隔离配置',
    locale_toggle: 'English',
    theme_toggle_light: '浅色',
    theme_toggle_dark: '深色',
    nav_aria: '快捷导航',
    nav_home: '首页',
    nav_account: '账号',
    nav_deploy: '部署',
    nav_logs: '日志',
    dash_title: 'Cloudflare 仪表盘',
    dash_desc: '展示当前账号的 Workers / KV / D1 / Pages 概览',
    dash_refresh: '刷新',
    dash_updating: '更新中...',
    dash_updated_at: '更新时间',
    dash_missing_config: '请先在账号管理中填写当前账号的 Cloudflare Token 与 Account ID',
    dash_worker_requests: 'Worker 24h 请求',
    dash_workers_total: 'Workers 脚本数',
    dash_kv_total: 'KV 命名空间',
    dash_d1_total: 'D1 数据库',
    dash_pages_total: 'Pages 项目',
    dash_used: '已用',
    dash_total: '总量',
    dash_na: '--',
    dash_warning: '部分指标不可用',
    dash_limits_title: '资源额度明细',
    dash_limit_metric: '指标',
    dash_limit_limit: '限额',
    dash_limit_row_worker_requests: 'Worker 请求（24h）',
    dash_limit_row_worker_scripts: 'Worker 脚本数',
    dash_limit_row_kv_namespaces: 'KV 命名空间',
    dash_limit_row_kv_reads: 'KV 读取请求（24h）',
    dash_limit_row_kv_writes: 'KV 写入请求（24h）',
    dash_limit_row_kv_storage: 'KV 存储容量',
    dash_limit_row_d1_databases: 'D1 数据库数量',
    dash_limit_row_d1_storage_account: 'D1 账户总存储',
    dash_limit_row_d1_storage_database: 'D1 单库存储上限',
    dash_limit_row_pages_projects: 'Pages 项目数',
    dash_limit_row_pages_builds: 'Pages 每月构建次数',
    dash_limit_value_kv_reads: '100,000 / 天',
    dash_limit_value_kv_writes: '1,000 / 天',
    dash_limit_value_kv_storage: '1 GB',
    dash_limit_value_d1_storage_account: '5 GB / 账户',
    dash_limit_value_d1_storage_database: '10 GB / 数据库',
    dash_limit_value_pages_builds: '500 / 月',
    dash_d1_quota_storage: '总存储占用 / 5GB',
    dash_d1_quota_reads: '24h 读请求 / 500万',
    dash_d1_quota_writes: '24h 写请求 / 10万',
    dash_kv_quota_storage: '总存储占用 / 1GB',
    dash_kv_quota_reads: '24h 读请求 / 10万',
    dash_kv_quota_writes: '24h 写请求 / 1000',
    dash_kv_mini_namespaces: '命名空间',
    dash_kv_mini_storage: '存储',
    dash_kv_mini_reads: '读取',
    dash_kv_mini_writes: '写入',
    dash_d1_mini_databases: '库数量',
    dash_d1_mini_storage: '存储',
    dash_d1_mini_reads: '读取',
    dash_d1_mini_writes: '写入',
    dash_quota_used_total: '{used} / {total}',
    dash_d1_db_usage_pattern: '{size} · 读 {read} / 写 {write}',
    dash_d1_db_more: '其余 {count} 个库...',

    account_title: '账号与偏好',
    account_desc: '每个账号独立保存部署配置，切换账号自动缓存当前草稿。',
    active_account: '当前账号',
    account_name: '账号名称',
    account_name_ph: '例如：生产账号',
    add_account: '添加账号',
    delete_account: '删除账号',
    manage_accounts: '管理账号',
    manage_accounts_desc: '切换账号、登录、登出、开始狂欢。',
    account_manager_add: '添加一个账号',
    account_manager_close: '关闭',
    account_manager_active: '激活账号',
    account_manager_delete: '删除',
    account_meta_email_label: '邮箱',
    account_meta_id_label: 'Account ID',
    account_meta_empty: '未设置',
    account_tip: '建议按账号拆分生产/测试环境，避免参数覆盖。',
    default_account_name: '默认账号',

    modal_title: '添加 Cloudflare 账号',
    modal_desc: '',
    modal_name_label: '账号名称',
    modal_name_ph: '例如：主账号',
    modal_token_label: 'Cloudflare API Token',
    modal_token_ph: '在 Cloudflare 控制台创建',
    modal_account_label: 'Cloudflare Account ID',
    modal_account_ph: '32 位十六进制字符串',
    modal_email_label: '邮箱（可选）',
    modal_email_ph: '仅用于账号展示',
    modal_clone: '复制当前账号配置',
    cancel: '取消',
    confirm: '确认',

    deploy_title: '部署配置',
    deploy_desc: '先保存配置，再执行部署。',
    group_cf: 'Cloudflare 参数',
    group_bot: '机器人参数',

    label_worker_name: 'Worker Name',
    ph_worker_name: 'telegram-private-chatbot',
    label_kv: 'KV Namespace Title',
    ph_kv: 'tg-bot-kv',
    label_d1: 'D1 Database Name',
    ph_d1: 'tg-bot-history',
    label_worker_url: 'Worker URL（可选）',
    ph_worker_url: '自定义域名，例如 https://bot.example.com',

    label_bot_token: 'BOT_TOKEN',
    ph_bot_token: '从 @BotFather 获取',
    label_admin_chat: 'ADMIN_CHAT_ID',
    ph_admin_chat: '管理员用户 ID 或群组 ID',
    label_verify_url: '验证域名（可选）',
    ph_verify_url: '例如 https://verify.example.com',
    label_panel_url: 'Pages 面板地址（只读，/admin 跳转目标）',
    ph_panel_url: '部署后自动读取 Cloudflare 分配的 pages.dev 地址',

    switch_panel: '自动部署 Pages 管理面板',
    switch_panel_on: '开启',
    switch_panel_off: '关闭',
    label_pages_project: 'Pages Project Name',
    ph_pages_project: '例如 telegram-private-chatbot-panel',
    label_pages_branch: 'Pages Branch',
    ph_pages_branch: 'main',

    btn_save: '保存配置',
    btn_clear_logs: '清空日志',
    btn_deploy: '开始部署',

    status_idle: '待命中',
    status_loading: '正在加载配置...',
    status_running: '部署执行中...',
    status_saved: '配置已保存',
    status_done: '部署完成',
    status_done_warn: '部署完成（含警告）',
    status_init_fail: '初始化失败',
    status_save_fail: '保存失败',
    status_deploy_fail: '部署失败',

    logs_title: '执行日志',
    log_saved: '配置已保存到本地。',
    log_account_created: '已创建新账号：{name}',
    log_account_deleted: '已删除账号：{name}',
    log_account_switched: '已切换到账号：{name}',
    log_deploy_start: '已开始执行部署。',
    log_cors_tip: '浏览器模式可能受 CORS 限制，建议优先使用原生 App。',
    log_summary_title: '部署完成摘要：',
    log_worker: 'Worker',
    log_worker_url: 'Worker URL',
    log_webhook: 'Webhook',
    log_panel_url: 'Panel URL',
    log_panel_entry: 'Panel Entry',
    log_pages_project: 'Pages Project',
    log_kv_id: 'KV Namespace ID',
    log_d1_id: 'D1 Database ID',
    log_bootstrap_warn: '部署引导警告',
    not_set: '未设置',

    alert_add_name: '请输入账号名称。',
    alert_add_required: '请填写账号名称、API Token 和 Account ID。',
    alert_keep_one: '至少保留一个账号。',
    alert_delete_confirm: '确认删除当前账号？',
  },
  en: {
    badge: 'MIUIX Style',
    title: 'TG Bot Mobile Deploy Client',
    subtitle: 'One-click local deploy for Worker, KV, D1, Pages, Secrets, and Webhook.',
    chip_cache: 'Auto config cache',
    chip_multi: 'Multi-account isolation',
    locale_toggle: '中文',
    theme_toggle_light: 'Light',
    theme_toggle_dark: 'Dark',
    nav_aria: 'Quick Navigation',
    nav_home: 'Home',
    nav_account: 'Account',
    nav_deploy: 'Deploy',
    nav_logs: 'Logs',
    dash_title: 'Cloudflare Dashboard',
    dash_desc: 'Live snapshot for current account: Workers, KV, D1, Pages and request metrics.',
    dash_refresh: 'Refresh',
    dash_updating: 'Updating...',
    dash_updated_at: 'Updated at',
    dash_missing_config: 'Fill Cloudflare API Token and Account ID in account management first.',
    dash_worker_requests: 'Worker Requests (24h)',
    dash_workers_total: 'Worker Scripts',
    dash_kv_total: 'KV Namespaces',
    dash_d1_total: 'D1 Databases',
    dash_pages_total: 'Pages Projects',
    dash_used: 'Used',
    dash_total: 'Total',
    dash_na: '--',
    dash_warning: 'Some metrics are unavailable',
    dash_limits_title: 'Quota Details',
    dash_limit_metric: 'Metric',
    dash_limit_limit: 'Limit',
    dash_limit_row_worker_requests: 'Worker Requests (24h)',
    dash_limit_row_worker_scripts: 'Worker Scripts',
    dash_limit_row_kv_namespaces: 'KV Namespaces',
    dash_limit_row_kv_reads: 'KV Read Ops (24h)',
    dash_limit_row_kv_writes: 'KV Write Ops (24h)',
    dash_limit_row_kv_storage: 'KV Storage',
    dash_limit_row_d1_databases: 'D1 Databases',
    dash_limit_row_d1_storage_account: 'D1 Total Storage / Account',
    dash_limit_row_d1_storage_database: 'D1 Max Storage / Database',
    dash_limit_row_pages_projects: 'Pages Projects',
    dash_limit_row_pages_builds: 'Pages Builds / Month',
    dash_limit_value_kv_reads: '100,000 / day',
    dash_limit_value_kv_writes: '1,000 / day',
    dash_limit_value_kv_storage: '1 GB',
    dash_limit_value_d1_storage_account: '5 GB / account',
    dash_limit_value_d1_storage_database: '10 GB / database',
    dash_limit_value_pages_builds: '500 / month',
    dash_d1_quota_storage: 'Storage Usage / 5GB',
    dash_d1_quota_reads: '24h Read Ops / 5M',
    dash_d1_quota_writes: '24h Write Ops / 100K',
    dash_kv_quota_storage: 'Storage Usage / 1GB',
    dash_kv_quota_reads: '24h Read Ops / 100K',
    dash_kv_quota_writes: '24h Write Ops / 1K',
    dash_kv_mini_namespaces: 'Namespaces',
    dash_kv_mini_storage: 'Storage',
    dash_kv_mini_reads: 'Read',
    dash_kv_mini_writes: 'Write',
    dash_d1_mini_databases: 'Databases',
    dash_d1_mini_storage: 'Storage',
    dash_d1_mini_reads: 'Read',
    dash_d1_mini_writes: 'Write',
    dash_quota_used_total: '{used} / {total}',
    dash_d1_db_usage_pattern: '{size} · read {read} / write {write}',
    dash_d1_db_more: '{count} more databases...',

    account_title: 'Accounts & Preferences',
    account_desc: 'Each account keeps an isolated deploy config. Switching accounts auto-caches draft data.',
    active_account: 'Active Account',
    account_name: 'Account Name',
    account_name_ph: 'Example: Production',
    add_account: 'Add Account',
    delete_account: 'Delete',
    manage_accounts: 'Manage Accounts',
    manage_accounts_desc: 'Switch accounts, sign in, sign out.',
    account_manager_add: 'Add an account',
    account_manager_close: 'Close',
    account_manager_active: 'Active',
    account_manager_delete: 'Delete',
    account_meta_email_label: 'Email',
    account_meta_id_label: 'Account ID',
    account_meta_empty: 'Not set',
    account_tip: 'Use separate accounts for production and staging to avoid accidental overrides.',
    default_account_name: 'Default Account',

    modal_title: 'Add Cloudflare Account',
    modal_desc: '',
    modal_name_label: 'Account Name',
    modal_name_ph: 'Example: Main',
    modal_token_label: 'Cloudflare API Token',
    modal_token_ph: 'Create in Cloudflare dashboard',
    modal_account_label: 'Cloudflare Account ID',
    modal_account_ph: '32-char hex string',
    modal_email_label: 'Email (Optional)',
    modal_email_ph: 'Display only',
    modal_clone: 'Clone current account config',
    cancel: 'Cancel',
    confirm: 'Confirm',

    deploy_title: 'Deploy Config',
    deploy_desc: 'Save your config first, then run deploy.',
    group_cf: 'Cloudflare Settings',
    group_bot: 'Bot Settings',

    label_worker_name: 'Worker Name',
    ph_worker_name: 'telegram-private-chatbot',
    label_kv: 'KV Namespace Title',
    ph_kv: 'tg-bot-kv',
    label_d1: 'D1 Database Name',
    ph_d1: 'tg-bot-history',
    label_worker_url: 'Worker URL (Optional)',
    ph_worker_url: 'Custom domain, e.g. https://bot.example.com',

    label_bot_token: 'BOT_TOKEN',
    ph_bot_token: 'Get from @BotFather',
    label_admin_chat: 'ADMIN_CHAT_ID',
    ph_admin_chat: 'Admin user ID or group ID',
    label_verify_url: 'Verification URL (Optional)',
    ph_verify_url: 'e.g. https://verify.example.com',
    label_panel_url: 'Pages panel URL (read-only /admin target)',
    ph_panel_url: 'Auto-detect the Cloudflare-assigned pages.dev URL after deploy',

    switch_panel: 'Auto deploy Pages admin panel',
    switch_panel_on: 'On',
    switch_panel_off: 'Off',
    label_pages_project: 'Pages Project Name',
    ph_pages_project: 'e.g. telegram-private-chatbot-panel',
    label_pages_branch: 'Pages Branch',
    ph_pages_branch: 'main',

    btn_save: 'Save Config',
    btn_clear_logs: 'Clear Logs',
    btn_deploy: 'Start Deploy',

    status_idle: 'Idle',
    status_loading: 'Loading config...',
    status_running: 'Deploy running...',
    status_saved: 'Config saved',
    status_done: 'Deploy completed',
    status_done_warn: 'Deploy completed (with warnings)',
    status_init_fail: 'Init failed',
    status_save_fail: 'Save failed',
    status_deploy_fail: 'Deploy failed',

    logs_title: 'Execution Logs',
    log_saved: 'Config has been saved locally.',
    log_account_created: 'Account created: {name}',
    log_account_deleted: 'Account deleted: {name}',
    log_account_switched: 'Switched to account: {name}',
    log_deploy_start: 'Deploy started.',
    log_cors_tip: 'Browser mode may be limited by CORS. Native app mode is recommended.',
    log_summary_title: 'Deploy summary:',
    log_worker: 'Worker',
    log_worker_url: 'Worker URL',
    log_webhook: 'Webhook',
    log_panel_url: 'Panel URL',
    log_panel_entry: 'Panel Entry',
    log_pages_project: 'Pages Project',
    log_kv_id: 'KV Namespace ID',
    log_d1_id: 'D1 Database ID',
    log_bootstrap_warn: 'Bootstrap warning',
    not_set: 'Not set',

    alert_add_name: 'Please enter an account name.',
    alert_add_required: 'Name, API Token, and Account ID are required.',
    alert_keep_one: 'At least one account must remain.',
    alert_delete_confirm: 'Delete current account?',
  },
};

const NAV_HOME_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3.8 10.5L12 4l8.2 6.5V19a1 1 0 0 1-1 1h-5.2v-5.4h-4V20H4.8a1 1 0 0 1-1-1z" />
  </svg>
`;

const NAV_ACCOUNT_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3.8L5.6 6.6v5.1c0 4.4 2.8 7.6 6.4 8.7 3.6-1.1 6.4-4.3 6.4-8.7V6.6z" />
    <circle cx="12" cy="10.2" r="2.15" />
    <path d="M8.8 16.3c.7-1.6 1.9-2.4 3.2-2.4s2.5.8 3.2 2.4" />
  </svg>
`;

const NAV_DEPLOY_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 4.2l7.2 4-7.2 4.1-7.2-4.1z" />
    <path d="M4.8 12.1l7.2 4.1 7.2-4.1" />
    <path d="M4.8 15.8l7.2 4 7.2-4" />
  </svg>
`;

const NAV_LOGS_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 4.6h10a1.1 1.1 0 0 1 1.1 1.1v12.6a1.1 1.1 0 0 1-1.1 1.1H7a1.1 1.1 0 0 1-1.1-1.1V5.7A1.1 1.1 0 0 1 7 4.6z" />
    <path d="M9 9.1h6m-6 3h6m-6 3h3.8" />
  </svg>
`;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('missing #app container');
}

app.innerHTML = `
  <div class="mi-ambient" aria-hidden="true">
    <span class="mi-ambient-orb mi-ambient-orb--a"></span>
    <span class="mi-ambient-orb mi-ambient-orb--b"></span>
  </div>

  <main class="mi-layout">
    <header id="heroSection" class="mi-hero mi-view-pane" data-view="home">
      <div class="mi-hero__top">
        <p id="heroBadge" class="mi-hero__badge">MIUIX Style</p>
        <div class="mi-hero__actions">
          <button id="localeToggleBtn" type="button" class="ghost"></button>
          <button id="themeToggleBtn" type="button" class="ghost"></button>
        </div>
      </div>
      <h1 id="titleMain"></h1>
      <p id="titleDesc" class="mi-hero__desc"></p>
      <div class="mi-hero__chips">
        <span id="chipCache" class="mi-chip"></span>
        <span id="chipMulti" class="mi-chip"></span>
      </div>
    </header>

    <section id="homeDashboardSection" class="mi-dashboard-view mi-view-pane" data-view="home">
      <section class="mi-card mi-dashboard-head-card">
        <div class="mi-dashboard-head">
          <div class="mi-dashboard-head__title">
            <h2 id="dashboardTitle"></h2>
            <p id="dashboardDesc"></p>
          </div>
          <button id="dashboardRefreshBtn" type="button" class="secondary"></button>
        </div>
        <p id="dashboardMeta" class="mi-dashboard-meta"></p>
        <p id="dashboardWarning" class="mi-dashboard-warning" hidden></p>
      </section>

      <div class="mi-dashboard-grid">
        <article id="dashCardRequests" class="mi-dashboard-quota">
          <p id="dashLabelRequests" class="mi-dashboard-quota__label"></p>
          <div class="mi-dashboard-quota__body">
            <div class="mi-dashboard-donut">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle class="mi-dashboard-donut__track" cx="32" cy="32" r="24"></circle>
                <circle id="dashRingRequests" class="mi-dashboard-donut__ring" cx="32" cy="32" r="24" pathLength="100"></circle>
              </svg>
              <span id="dashPctRequests" class="mi-dashboard-donut__pct">0%</span>
            </div>
            <div class="mi-dashboard-quota__meta">
              <p class="mi-dashboard-quota__line"><span id="dashUsedRequests">--</span> <small id="dashUsedTextRequests"></small></p>
              <p class="mi-dashboard-quota__line"><span id="dashTotalRequests">--</span> <small id="dashTotalTextRequests"></small></p>
            </div>
          </div>
        </article>

        <article id="dashCardWorkers" class="mi-dashboard-quota">
          <p id="dashLabelWorkers" class="mi-dashboard-quota__label"></p>
          <div class="mi-dashboard-quota__body">
            <div class="mi-dashboard-donut">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle class="mi-dashboard-donut__track" cx="32" cy="32" r="24"></circle>
                <circle id="dashRingWorkers" class="mi-dashboard-donut__ring" cx="32" cy="32" r="24" pathLength="100"></circle>
              </svg>
              <span id="dashPctWorkers" class="mi-dashboard-donut__pct">0%</span>
            </div>
            <div class="mi-dashboard-quota__meta">
              <p class="mi-dashboard-quota__line"><span id="dashUsedWorkers">--</span> <small id="dashUsedTextWorkers"></small></p>
              <p class="mi-dashboard-quota__line"><span id="dashTotalWorkers">--</span> <small id="dashTotalTextWorkers"></small></p>
            </div>
          </div>
        </article>

        <article id="dashCardKv" class="mi-dashboard-quota">
          <p id="dashLabelKv" class="mi-dashboard-quota__label"></p>
          <div class="mi-dashboard-quota__body">
            <div class="mi-dashboard-donut">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle class="mi-dashboard-donut__track" cx="32" cy="32" r="24"></circle>
                <circle id="dashRingKv" class="mi-dashboard-donut__ring" cx="32" cy="32" r="24" pathLength="100"></circle>
              </svg>
              <span id="dashPctKv" class="mi-dashboard-donut__pct">0%</span>
            </div>
            <div class="mi-dashboard-quota__meta">
              <p class="mi-dashboard-quota__line"><span id="dashUsedKv">--</span> <small id="dashUsedTextKv"></small></p>
              <p class="mi-dashboard-quota__line"><span id="dashTotalKv">--</span> <small id="dashTotalTextKv"></small></p>
            </div>
            <div id="dashKvMiniDonuts" class="mi-kv-mini-donuts mi-d1-mini-donuts"></div>
          </div>
          <div id="dashExtraKv" class="mi-dashboard-quota__extras"></div>
        </article>

        <article id="dashCardD1" class="mi-dashboard-quota">
          <p id="dashLabelD1" class="mi-dashboard-quota__label"></p>
          <div class="mi-dashboard-quota__body">
            <div class="mi-dashboard-donut">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle class="mi-dashboard-donut__track" cx="32" cy="32" r="24"></circle>
                <circle id="dashRingD1" class="mi-dashboard-donut__ring" cx="32" cy="32" r="24" pathLength="100"></circle>
              </svg>
              <span id="dashPctD1" class="mi-dashboard-donut__pct">0%</span>
            </div>
            <div class="mi-dashboard-quota__meta">
              <p class="mi-dashboard-quota__line"><span id="dashUsedD1">--</span> <small id="dashUsedTextD1"></small></p>
              <p class="mi-dashboard-quota__line"><span id="dashTotalD1">--</span> <small id="dashTotalTextD1"></small></p>
            </div>
            <div id="dashD1MiniDonuts" class="mi-d1-mini-donuts"></div>
          </div>
          <div id="dashExtraD1" class="mi-dashboard-quota__extras"></div>
        </article>

        <article id="dashCardPages" class="mi-dashboard-quota">
          <p id="dashLabelPages" class="mi-dashboard-quota__label"></p>
          <div class="mi-dashboard-quota__body">
            <div class="mi-dashboard-donut">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle class="mi-dashboard-donut__track" cx="32" cy="32" r="24"></circle>
                <circle id="dashRingPages" class="mi-dashboard-donut__ring" cx="32" cy="32" r="24" pathLength="100"></circle>
              </svg>
              <span id="dashPctPages" class="mi-dashboard-donut__pct">0%</span>
            </div>
            <div class="mi-dashboard-quota__meta">
              <p class="mi-dashboard-quota__line"><span id="dashUsedPages">--</span> <small id="dashUsedTextPages"></small></p>
              <p class="mi-dashboard-quota__line"><span id="dashTotalPages">--</span> <small id="dashTotalTextPages"></small></p>
            </div>
          </div>
          <div id="dashExtraPages" class="mi-dashboard-quota__extras"></div>
        </article>
      </div>
    </section>

    <section id="accountSection" class="mi-card mi-account-card mi-view-pane" data-view="account">
      <div class="mi-card__head">
        <h2 id="accountTitle"></h2>
        <p id="accountDesc"></p>
      </div>

      <div class="mi-account-entry">
        <button id="manageAccountsBtn" type="button" class="secondary"></button>
        <p id="manageAccountsDesc" class="mi-account-entry__desc"></p>
      </div>

      <p id="activeAccountLabel" class="mi-account-current-label"></p>
      <h3 id="activeAccountName" class="mi-account-current-name"></h3>

      <div class="mi-account-meta mi-account-meta--current">
        <p class="mi-account-meta__line">
          <span id="accountMetaEmailLabel"></span>
          <strong id="accountMetaEmail"></strong>
        </p>
        <p class="mi-account-meta__line">
          <span id="accountMetaIdLabel"></span>
          <strong id="accountMetaId"></strong>
        </p>
      </div>

      <p id="accountTip" class="mi-account-tip"></p>
    </section>

    <section id="deploySection" class="mi-card mi-view-pane" data-view="deploy">
      <div class="mi-card__head">
        <h2 id="deployTitle"></h2>
        <p id="deployDesc"></p>
      </div>

      <section class="mi-group">
        <h3 id="groupCfTitle"></h3>
        <div class="mi-grid">
          <label>
            <span id="labelWorkerName"></span>
            <input id="workerName" />
          </label>
          <label>
            <span id="labelKvNamespaceTitle"></span>
            <input id="kvNamespaceTitle" />
          </label>
          <label>
            <span id="labelD1DatabaseName"></span>
            <input id="d1DatabaseName" />
          </label>
          <label>
            <span id="labelWorkerUrl"></span>
            <input id="workerUrl" />
          </label>
          <label>
            <span id="labelVerifyPublicBaseUrl"></span>
            <input id="verifyPublicBaseUrl" />
          </label>
          <label>
            <span id="labelPanelUrl"></span>
            <input id="panelUrl" readonly />
          </label>
          <label>
            <span id="labelDeployPanel"></span>
            <select id="deployPanelSelect">
              <option value="1" id="deployPanelOptOn"></option>
              <option value="0" id="deployPanelOptOff"></option>
            </select>
          </label>
          <label>
            <span id="labelPagesProjectName"></span>
            <input id="pagesProjectName" />
          </label>
          <label>
            <span id="labelPagesBranch"></span>
            <input id="pagesBranch" />
          </label>
        </div>
      </section>

      <section class="mi-group">
        <h3 id="groupBotTitle"></h3>
        <div class="mi-grid">
          <label>
            <span id="labelBotToken"></span>
            <input id="botToken" type="password" autocomplete="off" />
          </label>
          <label>
            <span id="labelAdminChatId"></span>
            <input id="adminChatId" />
          </label>
        </div>
      </section>

      <div class="mi-actions">
        <button id="saveBtn" type="button" class="secondary"></button>
        <button id="clearLogBtn" type="button" class="secondary"></button>
        <button id="deployBtn" type="button" class="primary"></button>
      </div>

      <p id="status" class="status idle"></p>
    </section>

    <section id="logsSection" class="mi-card mi-log-card mi-view-pane" data-view="logs">
      <div class="mi-log-head">
        <h2 id="logsTitle"></h2>
      </div>
      <pre id="logs" class="logs"></pre>
    </section>
  </main>

  <nav id="floatingNav" class="mi-float-nav" aria-label="">
    <span id="floatingNavIndicator" class="mi-float-nav__indicator" aria-hidden="true"></span>
    <button id="navHomeBtn" type="button" class="mi-float-nav__btn active" data-view="home">
      <span id="navHomeIcon" class="mi-float-nav__icon"></span>
      <span id="navHomeLabel" class="mi-float-nav__label"></span>
    </button>
    <button id="navAccountBtn" type="button" class="mi-float-nav__btn" data-view="account">
      <span id="navAccountIcon" class="mi-float-nav__icon"></span>
      <span id="navAccountLabel" class="mi-float-nav__label"></span>
    </button>
    <button id="navDeployBtn" type="button" class="mi-float-nav__btn" data-view="deploy">
      <span id="navDeployIcon" class="mi-float-nav__icon"></span>
      <span id="navDeployLabel" class="mi-float-nav__label"></span>
    </button>
    <button id="navLogsBtn" type="button" class="mi-float-nav__btn" data-view="logs">
      <span id="navLogsIcon" class="mi-float-nav__icon"></span>
      <span id="navLogsLabel" class="mi-float-nav__label"></span>
    </button>
  </nav>

  <div id="accountManagerModal" class="mi-modal hidden" aria-hidden="true">
    <div class="mi-modal__panel mi-account-manager" role="dialog" aria-modal="true" aria-labelledby="accountManagerTitle">
      <div class="mi-account-manager__head">
        <h3 id="accountManagerTitle"></h3>
        <button id="closeAccountManagerBtn" type="button" class="mi-account-manager__close" aria-label="Close">×</button>
      </div>
      <p id="accountManagerDesc" class="mi-account-manager__desc"></p>
      <div id="accountManagerList" class="mi-account-manager__list"></div>
      <div class="mi-account-manager__footer">
        <button id="openAddAccountBtn" type="button" class="mi-account-manager__add"></button>
      </div>
    </div>
  </div>

  <div id="accountModal" class="mi-modal hidden" aria-hidden="true">
    <div class="mi-modal__panel" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <h3 id="modalTitle"></h3>
      <p id="modalDesc"></p>
      <label class="mi-modal__field">
        <span id="modalNameLabel"></span>
        <input id="newAccountNameInput" autocomplete="off" />
      </label>
      <label class="mi-modal__field">
        <span id="modalTokenLabel"></span>
        <input id="newAccountTokenInput" type="password" autocomplete="off" />
      </label>
      <label class="mi-modal__field">
        <span id="modalAccountIdLabel"></span>
        <input id="newAccountIdInput" autocomplete="off" />
      </label>
      <label class="mi-modal__field">
        <span id="modalEmailLabel"></span>
        <input id="newAccountEmailInput" type="email" autocomplete="off" />
      </label>
      <label class="mi-modal__checkbox">
        <input id="cloneCurrentInput" type="checkbox" checked />
        <span id="modalCloneLabel"></span>
      </label>
      <div class="mi-modal__actions">
        <button id="cancelAddAccountBtn" type="button" class="secondary"></button>
        <button id="confirmAddAccountBtn" type="button" class="primary"></button>
      </div>
    </div>
  </div>
`;

const statusNode = mustQuery<HTMLElement>('#status');
const logsNode = mustQuery<HTMLElement>('#logs');
const saveBtn = mustQuery<HTMLButtonElement>('#saveBtn');
const clearLogBtn = mustQuery<HTMLButtonElement>('#clearLogBtn');
const deployBtn = mustQuery<HTMLButtonElement>('#deployBtn');
const deployPanelSelect = mustQuery<HTMLSelectElement>('#deployPanelSelect');

const localeToggleBtn = mustQuery<HTMLButtonElement>('#localeToggleBtn');
const themeToggleBtn = mustQuery<HTMLButtonElement>('#themeToggleBtn');

const activeAccountName = mustQuery<HTMLElement>('#activeAccountName');
const accountMetaEmail = mustQuery<HTMLElement>('#accountMetaEmail');
const accountMetaId = mustQuery<HTMLElement>('#accountMetaId');
const manageAccountsBtn = mustQuery<HTMLButtonElement>('#manageAccountsBtn');
const dashboardRefreshBtn = mustQuery<HTMLButtonElement>('#dashboardRefreshBtn');
const dashboardMeta = mustQuery<HTMLElement>('#dashboardMeta');
const dashboardWarning = mustQuery<HTMLElement>('#dashboardWarning');
const dashboardKvMiniDonuts = mustQuery<HTMLElement>('#dashKvMiniDonuts');
const dashboardD1MiniDonuts = mustQuery<HTMLElement>('#dashD1MiniDonuts');
const dashboardExtraContainers: Partial<Record<DashboardMetricKey, HTMLElement>> = {
  kvNamespaceCount: mustQuery<HTMLElement>('#dashExtraKv'),
  d1DatabaseCount: mustQuery<HTMLElement>('#dashExtraD1'),
  pagesProjectCount: mustQuery<HTMLElement>('#dashExtraPages'),
};

const accountManagerModal = mustQuery<HTMLDivElement>('#accountManagerModal');
const accountManagerList = mustQuery<HTMLElement>('#accountManagerList');
const closeAccountManagerBtn = mustQuery<HTMLButtonElement>('#closeAccountManagerBtn');
const openAddAccountBtn = mustQuery<HTMLButtonElement>('#openAddAccountBtn');
const accountModal = mustQuery<HTMLDivElement>('#accountModal');
const newAccountNameInput = mustQuery<HTMLInputElement>('#newAccountNameInput');
const newAccountTokenInput = mustQuery<HTMLInputElement>('#newAccountTokenInput');
const newAccountIdInput = mustQuery<HTMLInputElement>('#newAccountIdInput');
const newAccountEmailInput = mustQuery<HTMLInputElement>('#newAccountEmailInput');
const cloneCurrentInput = mustQuery<HTMLInputElement>('#cloneCurrentInput');
const cancelAddAccountBtn = mustQuery<HTMLButtonElement>('#cancelAddAccountBtn');
const confirmAddAccountBtn = mustQuery<HTMLButtonElement>('#confirmAddAccountBtn');
const floatingNav = mustQuery<HTMLElement>('#floatingNav');
const floatingNavIndicator = mustQuery<HTMLElement>('#floatingNavIndicator');
const navButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.mi-float-nav__btn'));
const viewPanes = Array.from(document.querySelectorAll<HTMLElement>('.mi-view-pane'));

let busy = false;
let currentLocale: Locale = 'zh';
let currentTheme: Theme = 'light';
let accounts: AccountState[] = [];
let activeAccountId = '';
let activeViewId: ViewId = 'home';
let defaultFormState: DeployFormState | null = null;
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let scrollFxRaf = 0;
let accountSwitchQueue: Promise<void> = Promise.resolve();
let dashboardRequestSeq = 0;
let dashboardLoading = false;
const dashboardCacheByAccountId = new Map<string, DashboardSnapshot>();

function mustQuery<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`missing ${selector}`);
  return node;
}

function t(key: string): string {
  return i18n[currentLocale][key] ?? i18n.en[key] ?? key;
}

function tf(key: string, values: Record<string, string | number>): string {
  let text = t(key);
  for (const [name, value] of Object.entries(values)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

async function readStorage(key: string): Promise<string> {
  if (isNativePlatform()) {
    const item = await Preferences.get({ key });
    return String(item.value || '');
  }
  return String(localStorage.getItem(key) || '');
}

async function writeStorage(key: string, value: string): Promise<void> {
  if (isNativePlatform()) {
    await Preferences.set({ key, value });
  } else {
    localStorage.setItem(key, value);
  }
}

function createId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeLocale(value: unknown): Locale {
  return value === 'en' ? 'en' : 'zh';
}

function sanitizeTheme(value: unknown): Theme {
  return value === 'dark' ? 'dark' : 'light';
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

function normalizeHttpUrlInput(value: string): string {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    const url = new URL(withScheme);
    if (!/^https?:$/i.test(url.protocol)) return '';
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function normalizeAccountName(value: unknown, fallback: string): string {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeAccountEmail(value: unknown): string {
  return String(value || '').trim();
}

function fallbackAccountName(index: number, locale: Locale): string {
  return locale === 'en' ? `Account ${index}` : `账号 ${index}`;
}

function shortAccountId(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= 14) return text;
  return `${text.slice(0, 8)}...${text.slice(-4)}`;
}

function accountMetaText(account: AccountState | null): string {
  if (!account) return '';
  return normalizeAccountEmail(account.email) || shortAccountId(account.form.cfAccountId);
}

function accountDisplayName(account: AccountState, index: number): string {
  return account.name || fallbackAccountName(index + 1, currentLocale);
}

function normalizeFormState(input: Partial<DeployFormState>, defaults: DeployFormState): DeployFormState {
  const workerName = String(input.workerName ?? defaults.workerName).trim();
  const pagesProjectRaw = String(input.pagesProjectName ?? defaults.pagesProjectName).trim();

  return {
    cfApiToken: String(input.cfApiToken ?? defaults.cfApiToken).trim(),
    cfAccountId: String(input.cfAccountId ?? defaults.cfAccountId).trim(),
    workerName,
    kvNamespaceTitle: String(input.kvNamespaceTitle ?? defaults.kvNamespaceTitle).trim(),
    d1DatabaseName: String(input.d1DatabaseName ?? defaults.d1DatabaseName).trim(),
    botToken: String(input.botToken ?? defaults.botToken).trim(),
    adminChatId: String(input.adminChatId ?? defaults.adminChatId).trim(),
    workerUrl: String(input.workerUrl ?? defaults.workerUrl).trim(),
    verifyPublicBaseUrl: String(input.verifyPublicBaseUrl ?? defaults.verifyPublicBaseUrl).trim(),
    panelUrl: String(input.panelUrl ?? defaults.panelUrl).trim(),
    deployPanel: typeof input.deployPanel === 'boolean' ? input.deployPanel : defaults.deployPanel,
    pagesProjectName: normalizePagesProjectName(pagesProjectRaw) || suggestPagesProjectName(workerName),
    pagesBranch: String(input.pagesBranch ?? defaults.pagesBranch).trim() || defaults.pagesBranch,
  };
}

function cloneFormState(state: DeployFormState): DeployFormState {
  return {
    ...state,
  };
}

function createAccount(name: string, form: DeployFormState, email = ''): AccountState {
  const now = Date.now();
  return {
    id: createId(),
    name,
    email: normalizeAccountEmail(email),
    createdAt: now,
    updatedAt: now,
    form: cloneFormState(form),
  };
}

async function loadUiState(defaults: DeployFormState): Promise<UiCache> {
  const raw = await readStorage(APP_STATE_KEY);
  if (!raw) {
    const legacy = await loadSavedFormState();
    const merged = normalizeFormState({ ...defaults, ...legacy }, defaults);
    const initialAccount = createAccount(t('default_account_name'), merged);
    return {
      version: 1,
      locale: currentLocale,
      theme: currentTheme,
      activeAccountId: initialAccount.id,
      accounts: [initialAccount],
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<UiCache>;
    const locale = sanitizeLocale(parsed.locale);
    const theme = sanitizeTheme(parsed.theme);

    const normalizedAccounts = Array.isArray(parsed.accounts)
      ? parsed.accounts
        .map((item, index) => {
          const fallbackName = fallbackAccountName(index + 1, locale);
          return {
            id: String(item?.id || '').trim() || createId(),
            name: normalizeAccountName(item?.name, fallbackName),
            email: normalizeAccountEmail(item?.email),
            createdAt: Number(item?.createdAt || Date.now()),
            updatedAt: Number(item?.updatedAt || Date.now()),
            form: cloneFormState(normalizeFormState(item?.form || {}, defaults)),
          } as AccountState;
        })
      : [];

    if (normalizedAccounts.length === 0) {
      const legacy = await loadSavedFormState();
      const merged = normalizeFormState({ ...defaults, ...legacy }, defaults);
      const fallback = createAccount(locale === 'en' ? 'Default Account' : '默认账号', merged);
      normalizedAccounts.push(fallback);
    }

    const activeIdRaw = String(parsed.activeAccountId || '').trim();
    const active = normalizedAccounts.find((item) => item.id === activeIdRaw) || normalizedAccounts[0];

    return {
      version: 1,
      locale,
      theme,
      activeAccountId: active.id,
      accounts: normalizedAccounts,
    };
  } catch {
    const legacy = await loadSavedFormState();
    const merged = normalizeFormState({ ...defaults, ...legacy }, defaults);
    const initialAccount = createAccount(t('default_account_name'), merged);
    return {
      version: 1,
      locale: currentLocale,
      theme: currentTheme,
      activeAccountId: initialAccount.id,
      accounts: [initialAccount],
    };
  }
}

async function persistUiState(): Promise<void> {
  const payload: UiCache = {
    version: 1,
    locale: currentLocale,
    theme: currentTheme,
    activeAccountId,
    accounts,
  };
  await writeStorage(APP_STATE_KEY, JSON.stringify(payload));
}

function queueAutoSave(): void {
  if (busy) return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    void saveCurrentForm(false);
  }, AUTOSAVE_DELAY_MS);
}

function cancelAutoSave(): void {
  if (!autosaveTimer) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
}

function getInput(name: TextField): HTMLInputElement {
  const node = document.querySelector<HTMLInputElement>(`#${name}`);
  if (!node) throw new Error(`missing input ${name}`);
  return node;
}

function setStatus(text: string, mode: 'idle' | 'running' | 'ok' | 'error'): void {
  statusNode.textContent = text;
  statusNode.className = `status ${mode}`;
}

function appendLog(text: string): void {
  const stampLocale = currentLocale === 'en' ? 'en-US' : 'zh-CN';
  const stamp = new Date().toLocaleTimeString(stampLocale, { hour12: false });
  logsNode.textContent += `[${stamp}] ${text}\n`;
  logsNode.scrollTop = logsNode.scrollHeight;
}

function clearLogs(): void {
  logsNode.textContent = '';
}

function getFallbackFormState(): DeployFormState {
  return {
    cfApiToken: '',
    cfAccountId: '',
    workerName: 'telegram-private-chatbot',
    kvNamespaceTitle: 'tg-bot-kv',
    d1DatabaseName: 'tg-bot-history',
    botToken: '',
    adminChatId: '',
    workerUrl: '',
    verifyPublicBaseUrl: '',
    panelUrl: '',
    deployPanel: true,
    pagesProjectName: 'tg-bot-panel',
    pagesBranch: 'main',
  };
}

function getFormState(): DeployFormState {
  const base = defaultFormState || getFallbackFormState();
  const active = getActiveAccount();

  const state = {} as DeployFormState;
  for (const key of formTextFields) {
    state[key] = getInput(key).value as DeployFormState[typeof key];
  }
  state.cfApiToken = String(active?.form.cfApiToken || '').trim();
  state.cfAccountId = String(active?.form.cfAccountId || '').trim();
  state.deployPanel = String(deployPanelSelect.value) === '1';
  return normalizeFormState(state, base);
}

function setFormState(state: DeployFormState): void {
  const safeState = cloneFormState(state);
  for (const key of formTextFields) {
    getInput(key).value = String(safeState[key] || '');
  }

  deployPanelSelect.value = safeState.deployPanel ? '1' : '0';

  const workerInput = getInput('workerName');
  const pagesInput = getInput('pagesProjectName');
  const suggested = suggestPagesProjectName(workerInput.value);
  pagesInput.dataset.edited = pagesInput.value && pagesInput.value !== suggested ? '1' : '0';
}

function getActiveAccount(): AccountState | null {
  return accounts.find((item) => item.id === activeAccountId) || accounts[0] || null;
}

function renderActiveAccountMeta(account: AccountState | null): void {
  const accountId = String(account?.form.cfAccountId || '').trim();
  accountMetaEmail.textContent = normalizeAccountEmail(account?.email) || t('account_meta_empty');
  accountMetaId.textContent = accountId || t('account_meta_empty');
}

function renderAccountManagerList(): void {
  accountManagerList.innerHTML = '';

  const fragment = document.createDocumentFragment();
  for (let index = 0; index < accounts.length; index += 1) {
    const account = accounts[index];
    const isActive = account.id === activeAccountId;

    const item = document.createElement('article');
    item.className = `mi-account-manager-item${isActive ? ' is-active' : ''}`;

    const switchBtn = document.createElement('button');
    switchBtn.type = 'button';
    switchBtn.className = 'mi-account-manager-item__switch';
    switchBtn.dataset.accountSwitch = account.id;

    const avatar = document.createElement('span');
    avatar.className = 'mi-account-manager-item__avatar';
    avatar.textContent = accountDisplayName(account, index).slice(0, 1).toUpperCase();

    const body = document.createElement('span');
    body.className = 'mi-account-manager-item__body';

    const name = document.createElement('strong');
    name.className = 'mi-account-manager-item__name';
    name.textContent = accountDisplayName(account, index);

    const meta = document.createElement('span');
    meta.className = 'mi-account-manager-item__meta';
    meta.textContent = accountMetaText(account) || t('account_meta_empty');

    body.append(name, meta);

    if (isActive) {
      const state = document.createElement('span');
      state.className = 'mi-account-manager-item__state';
      state.textContent = t('account_manager_active');
      body.append(state);
    }

    switchBtn.append(avatar, body);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'mi-account-manager-item__delete';
    deleteBtn.dataset.accountDelete = account.id;
    deleteBtn.textContent = '…';
    deleteBtn.title = t('account_manager_delete');
    deleteBtn.disabled = busy || accounts.length <= 1;
    deleteBtn.setAttribute('aria-label', t('account_manager_delete'));

    item.append(switchBtn, deleteBtn);
    fragment.append(item);
  }

  accountManagerList.append(fragment);
}

function renderAccountOptions(): void {
  const active = getActiveAccount();
  const activeIndex = active ? accounts.findIndex((item) => item.id === active.id) : -1;
  const activeName = active && activeIndex >= 0 ? accountDisplayName(active, activeIndex) : t('account_meta_empty');
  activeAccountName.textContent = activeName;
  renderActiveAccountMeta(active);
  renderAccountManagerList();
}

function applyTheme(): void {
  document.body.dataset.theme = currentTheme;
  themeToggleBtn.textContent = currentTheme === 'dark' ? t('theme_toggle_light') : t('theme_toggle_dark');
}

function setText(id: string, key: string): void {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = t(key);
}

function setHtml(id: string, html: string): void {
  const node = document.getElementById(id);
  if (!node) return;
  node.innerHTML = html;
}

function setPlaceholder(id: string, key: string): void {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (!input) return;
  input.placeholder = t(key);
}

function formatDashboardNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return t('dash_na');
  const locale = currentLocale === 'en' ? 'en-US' : 'zh-CN';
  return new Intl.NumberFormat(locale).format(Math.max(0, Math.round(value)));
}

function formatDashboardCellValue(value: number | string | null): string {
  if (typeof value === 'number') {
    return formatDashboardNumber(value);
  }
  if (value === null || value === undefined) {
    return t('dash_na');
  }
  const text = String(value).trim();
  return text || t('dash_na');
}

function formatDashboardBytes(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) return t('dash_na');
  const locale = currentLocale === 'en' ? 'en-US' : 'zh-CN';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(size)} ${units[unitIndex]}`;
}

function getDashboardUsedValue(snapshot: DashboardSnapshot | null, key: DashboardMetricKey): number | null {
  if (!snapshot) return null;
  if (key === 'workerRequests24h') return snapshot.workerRequests24h;
  if (key === 'workersScriptCount') return snapshot.workersScriptCount;
  if (key === 'kvNamespaceCount') return snapshot.kvNamespaceCount;
  if (key === 'd1DatabaseCount') return snapshot.d1DatabaseCount;
  return snapshot.pagesProjectCount;
}

function getDashboardUsageValue(snapshot: DashboardSnapshot | null, key: DashboardUsageKey): number | null {
  if (!snapshot) return null;
  if (key === 'kvReadRequests24h') return snapshot.kvReadRequests24h;
  if (key === 'kvWriteRequests24h') return snapshot.kvWriteRequests24h;
  if (key === 'kvStorageBytes') return snapshot.kvStorageBytes;
  if (key === 'd1StorageBytes' || key === 'd1ReadRequests24h' || key === 'd1WriteRequests24h') {
    const databases = Array.isArray(snapshot.d1DatabasesUsage) ? snapshot.d1DatabasesUsage : [];

    let storageBytes = 0;
    let storageAvailable = false;
    let readRequests24h = 0;
    let readAvailable = false;
    let writeRequests24h = 0;
    let writeAvailable = false;

    for (const db of databases) {
      const size = db.fileSizeBytes;
      if (size !== null && Number.isFinite(size) && size >= 0) {
        storageBytes += size;
        storageAvailable = true;
      }

      const read = db.rowsRead24h;
      if (read !== null && Number.isFinite(read) && read >= 0) {
        readRequests24h += read;
        readAvailable = true;
      }

      const write = db.rowsWritten24h;
      if (write !== null && Number.isFinite(write) && write >= 0) {
        writeRequests24h += write;
        writeAvailable = true;
      }
    }

    if (key === 'd1StorageBytes') {
      return storageAvailable ? Math.round(storageBytes) : null;
    }
    if (key === 'd1ReadRequests24h') {
      return readAvailable ? Math.round(readRequests24h) : null;
    }
    return writeAvailable ? Math.round(writeRequests24h) : null;
  }
  return getDashboardUsedValue(snapshot, key);
}

function formatDashboardByType(value: number | null, format: DashboardValueFormat): string {
  return format === 'bytes' ? formatDashboardBytes(value) : formatDashboardNumber(value);
}

function formatDashboardPercentText(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio) || ratio < 0) return t('dash_na');
  const value = Math.max(0, Math.min(100, ratio * 100));
  const locale = currentLocale === 'en' ? 'en-US' : 'zh-CN';
  const digits = value >= 10 ? 0 : value >= 1 ? 1 : value > 0 ? 2 : 0;
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value)}%`;
}

function appendDashboardProgressLine(
  container: DocumentFragment | HTMLElement,
  options: { labelKey: string; used: number | null; total: number; format: DashboardValueFormat; className?: string },
): void {
  const used = options.used !== null && Number.isFinite(options.used) ? Math.max(0, options.used) : null;
  const total = Number.isFinite(options.total) && options.total > 0 ? options.total : 0;
  const ratio = used !== null && total > 0 ? Math.min(1, used / total) : 0;
  const percentRaw = ratio * 100;
  const visualPercent = used !== null && total > 0 && percentRaw > 0 ? Math.max(percentRaw, 1.2) : percentRaw;

  const wrap = document.createElement('div');
  wrap.className = `mi-dashboard-progress${options.className ? ` ${options.className}` : ''}`;
  wrap.classList.toggle('unknown', used === null || total <= 0);

  const head = document.createElement('div');
  head.className = 'mi-dashboard-progress__head';

  const label = document.createElement('span');
  label.className = 'mi-dashboard-progress__label';
  label.textContent = t(options.labelKey);

  const value = document.createElement('b');
  value.className = 'mi-dashboard-progress__value';
  value.textContent = tf('dash_quota_used_total', {
    used: formatDashboardByType(used, options.format),
    total: formatDashboardByType(total, options.format),
  });

  head.append(label, value);

  const meter = document.createElement('div');
  meter.className = 'mi-dashboard-progress__meter';

  const track = document.createElement('div');
  track.className = 'mi-dashboard-progress__track';

  const fill = document.createElement('span');
  fill.className = 'mi-dashboard-progress__fill';
  fill.style.width = `${Math.min(100, visualPercent)}%`;
  track.append(fill);

  const pct = document.createElement('span');
  pct.className = 'mi-dashboard-progress__pct';
  pct.textContent = formatDashboardPercentText(used === null || total <= 0 ? null : ratio);

  meter.append(track, pct);
  wrap.append(head, meter);
  container.append(wrap);
}

function appendD1MiniDonut(
  container: DocumentFragment | HTMLElement,
  options: { labelKey: string; used: number | null; total: number; className: string; format: DashboardValueFormat },
): void {
  const used = options.used !== null && Number.isFinite(options.used) ? Math.max(0, options.used) : null;
  const total = Number.isFinite(options.total) && options.total > 0 ? options.total : 0;
  const ratio = used !== null && total > 0 ? Math.min(1, used / total) : null;
  const percentRaw = ratio === null ? 0 : ratio * 100;
  const visualPercent = ratio !== null && percentRaw > 0 ? Math.max(percentRaw, 1.2) : percentRaw;

  const wrap = document.createElement('div');
  wrap.className = `mi-d1-mini-donut ${options.className}`;
  wrap.classList.toggle('unknown', ratio === null);

  const ringWrap = document.createElement('div');
  ringWrap.className = 'mi-d1-mini-donut__ring-wrap';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 42 42');
  svg.setAttribute('aria-hidden', 'true');

  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('class', 'mi-d1-mini-donut__track');
  track.setAttribute('cx', '21');
  track.setAttribute('cy', '21');
  track.setAttribute('r', '15');

  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ring.setAttribute('class', 'mi-d1-mini-donut__ring');
  ring.setAttribute('cx', '21');
  ring.setAttribute('cy', '21');
  ring.setAttribute('r', '15');
  ring.setAttribute('pathLength', '100');
  ring.style.strokeDasharray = '100';
  ring.style.strokeDashoffset = `${(100 - Math.min(100, visualPercent)).toFixed(2)}`;

  svg.append(track, ring);

  const pct = document.createElement('span');
  pct.className = 'mi-d1-mini-donut__pct';
  pct.textContent = formatDashboardPercentText(ratio);

  ringWrap.append(svg, pct);

  const legend = document.createElement('div');
  legend.className = 'mi-d1-mini-donut__legend';

  const legendHead = document.createElement('div');
  legendHead.className = 'mi-d1-mini-donut__legend-head';

  const dot = document.createElement('i');
  dot.className = 'mi-d1-mini-donut__dot';
  dot.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'mi-d1-mini-donut__label';
  label.textContent = t(options.labelKey);

  legendHead.append(dot, label);

  const value = document.createElement('b');
  value.className = 'mi-d1-mini-donut__value';
  value.textContent = tf('dash_quota_used_total', {
    used: formatDashboardByType(used, options.format),
    total: formatDashboardByType(total, options.format),
  });

  legend.append(legendHead, value);

  wrap.append(ringWrap, legend);
  container.append(wrap);
}

function renderD1TopMiniDonuts(snapshot: DashboardSnapshot | null): void {
  dashboardD1MiniDonuts.innerHTML = '';
  const fragment = document.createDocumentFragment();

  appendD1MiniDonut(fragment, {
    labelKey: 'dash_d1_mini_databases',
    used: getDashboardUsedValue(snapshot, 'd1DatabaseCount'),
    total: DASHBOARD_FREE_TOTALS.d1DatabaseCount,
    className: 'is-databases',
    format: 'number',
  });
  appendD1MiniDonut(fragment, {
    labelKey: 'dash_d1_mini_storage',
    used: getDashboardUsageValue(snapshot, 'd1StorageBytes'),
    total: D1_STORAGE_FREE_BYTES,
    className: 'is-storage',
    format: 'bytes',
  });
  appendD1MiniDonut(fragment, {
    labelKey: 'dash_d1_mini_reads',
    used: getDashboardUsageValue(snapshot, 'd1ReadRequests24h'),
    total: D1_READS_FREE_24H,
    className: 'is-read',
    format: 'number',
  });
  appendD1MiniDonut(fragment, {
    labelKey: 'dash_d1_mini_writes',
    used: getDashboardUsageValue(snapshot, 'd1WriteRequests24h'),
    total: D1_WRITES_FREE_24H,
    className: 'is-write',
    format: 'number',
  });

  dashboardD1MiniDonuts.append(fragment);
}

function renderKvTopMiniDonuts(snapshot: DashboardSnapshot | null): void {
  dashboardKvMiniDonuts.innerHTML = '';
  const fragment = document.createDocumentFragment();

  appendD1MiniDonut(fragment, {
    labelKey: 'dash_kv_mini_namespaces',
    used: getDashboardUsedValue(snapshot, 'kvNamespaceCount'),
    total: DASHBOARD_FREE_TOTALS.kvNamespaceCount,
    className: 'is-kv-namespaces',
    format: 'number',
  });
  appendD1MiniDonut(fragment, {
    labelKey: 'dash_kv_mini_storage',
    used: getDashboardUsageValue(snapshot, 'kvStorageBytes'),
    total: KV_STORAGE_FREE_BYTES,
    className: 'is-kv-storage',
    format: 'bytes',
  });
  appendD1MiniDonut(fragment, {
    labelKey: 'dash_kv_mini_reads',
    used: getDashboardUsageValue(snapshot, 'kvReadRequests24h'),
    total: KV_READS_FREE_24H,
    className: 'is-kv-read',
    format: 'number',
  });
  appendD1MiniDonut(fragment, {
    labelKey: 'dash_kv_mini_writes',
    used: getDashboardUsageValue(snapshot, 'kvWriteRequests24h'),
    total: KV_WRITES_FREE_24H,
    className: 'is-kv-write',
    format: 'number',
  });

  dashboardKvMiniDonuts.append(fragment);
}

function renderKvDashboardExtras(snapshot: DashboardSnapshot | null): number {
  const container = dashboardExtraContainers.kvNamespaceCount;
  if (!container) return 0;

  const fragment = document.createDocumentFragment();
  const progressGroup = document.createElement('div');
  progressGroup.className = 'mi-dashboard-progress-group';

  appendDashboardProgressLine(progressGroup, {
    labelKey: 'dash_kv_quota_storage',
    used: getDashboardUsageValue(snapshot, 'kvStorageBytes'),
    total: KV_STORAGE_FREE_BYTES,
    format: 'bytes',
    className: 'is-kv-storage',
  });
  appendDashboardProgressLine(progressGroup, {
    labelKey: 'dash_kv_quota_reads',
    used: getDashboardUsageValue(snapshot, 'kvReadRequests24h'),
    total: KV_READS_FREE_24H,
    format: 'number',
    className: 'is-kv-read',
  });
  appendDashboardProgressLine(progressGroup, {
    labelKey: 'dash_kv_quota_writes',
    used: getDashboardUsageValue(snapshot, 'kvWriteRequests24h'),
    total: KV_WRITES_FREE_24H,
    format: 'number',
    className: 'is-kv-write',
  });

  fragment.append(progressGroup);
  container.append(fragment);
  return 3;
}

function renderD1DashboardExtras(snapshot: DashboardSnapshot | null): number {
  const container = dashboardExtraContainers.d1DatabaseCount;
  if (!container) return 0;

  const fragment = document.createDocumentFragment();
  const progressGroup = document.createElement('div');
  progressGroup.className = 'mi-dashboard-progress-group';

  appendDashboardProgressLine(progressGroup, {
    labelKey: 'dash_d1_quota_storage',
    used: getDashboardUsageValue(snapshot, 'd1StorageBytes'),
    total: D1_STORAGE_FREE_BYTES,
    format: 'bytes',
    className: 'is-storage',
  });
  appendDashboardProgressLine(progressGroup, {
    labelKey: 'dash_d1_quota_reads',
    used: getDashboardUsageValue(snapshot, 'd1ReadRequests24h'),
    total: D1_READS_FREE_24H,
    format: 'number',
    className: 'is-read',
  });
  appendDashboardProgressLine(progressGroup, {
    labelKey: 'dash_d1_quota_writes',
    used: getDashboardUsageValue(snapshot, 'd1WriteRequests24h'),
    total: D1_WRITES_FREE_24H,
    format: 'number',
    className: 'is-write',
  });

  fragment.append(progressGroup);

  const databases = Array.isArray(snapshot?.d1DatabasesUsage) ? snapshot.d1DatabasesUsage : [];
  const top = databases.slice(0, 3);
  for (const db of top) {
    const line = document.createElement('p');
    line.className = 'mi-dashboard-quota__extra-line mi-dashboard-quota__extra-line--db';

    const label = document.createElement('span');
    label.textContent = db.name || db.id;

    const value = document.createElement('b');
    value.textContent = tf('dash_d1_db_usage_pattern', {
      size: formatDashboardBytes(db.fileSizeBytes),
      read: formatDashboardNumber(db.rowsRead24h),
      write: formatDashboardNumber(db.rowsWritten24h),
    });

    line.append(label, value);
    fragment.append(line);
  }

  if (databases.length > top.length) {
    const line = document.createElement('p');
    line.className = 'mi-dashboard-quota__extra-line mi-dashboard-quota__extra-line--hint';

    const label = document.createElement('span');
    label.textContent = tf('dash_d1_db_more', { count: databases.length - top.length });
    line.append(label);
    fragment.append(line);
  }

  container.append(fragment);
  return 3 + top.length + (databases.length > top.length ? 1 : 0);
}

function applyDashboardGridBalancing(): void {
  const cards = DASHBOARD_BINDINGS
    .map((binding) => document.getElementById(binding.cardId))
    .filter((card): card is HTMLElement => Boolean(card));

  for (const card of cards) {
    card.classList.remove('is-orphan-wide');
  }

  const compactCards = cards.filter(
    (card) => !card.classList.contains('is-expanded') && !DASHBOARD_ORPHAN_EXCLUDE_CARD_IDS.has(card.id),
  );
  if (compactCards.length === 0 || compactCards.length % 2 === 0) return;

  const orphan = compactCards[compactCards.length - 1];
  orphan.classList.add('is-orphan-wide');
}

function renderDashboardCardExtras(snapshot: DashboardSnapshot | null): void {
  for (const binding of DASHBOARD_BINDINGS) {
    const card = document.getElementById(binding.cardId);
    if (!card) continue;
    card.classList.remove('is-expanded', 'is-dense');
  }

  for (const key of Object.keys(DASHBOARD_EXTRA_CONTAINER_IDS) as DashboardMetricKey[]) {
    const container = dashboardExtraContainers[key];
    if (!container) continue;
    container.innerHTML = '';
  }

  renderKvTopMiniDonuts(snapshot);
  renderD1TopMiniDonuts(snapshot);

  const grouped = new Map<DashboardMetricKey, DashboardLimitRowDefinition[]>();
  for (const row of DASHBOARD_LIMIT_ROWS) {
    const rows = grouped.get(row.targetKey) || [];
    rows.push(row);
    grouped.set(row.targetKey, rows);
  }

  for (const [targetKey, rows] of grouped.entries()) {
    const container = dashboardExtraContainers[targetKey];
    if (!container) continue;

    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      const line = document.createElement('p');
      line.className = 'mi-dashboard-quota__extra-line';

      const label = document.createElement('span');
      label.textContent = t(row.labelKey);

      const value = document.createElement('b');
      const resolved = row.sourceKey
        ? getDashboardUsageValue(snapshot, row.sourceKey)
        : row.limitNumber !== null
          ? row.limitNumber
          : row.limitTextKey
            ? t(row.limitTextKey)
            : null;
      value.textContent = formatDashboardCellValue(resolved);

      line.append(label, value);
      fragment.append(line);
    }

    const binding = DASHBOARD_BINDINGS.find((item) => item.key === targetKey);
    const card = binding ? document.getElementById(binding.cardId) : null;
    const lineCount = fragment.childNodes.length;
    const shouldExpand = lineCount >= 5;
    if (card) {
      card.classList.toggle('is-expanded', shouldExpand);
      card.classList.toggle('is-dense', lineCount >= 4);
    }

    container.append(fragment);
  }

  const kvLineCount = renderKvDashboardExtras(snapshot);
  const kvCard = document.getElementById('dashCardKv');
  if (kvCard) {
    kvCard.classList.toggle('is-expanded', kvLineCount >= 3);
    kvCard.classList.toggle('is-dense', kvLineCount >= 4);
  }

  const d1LineCount = renderD1DashboardExtras(snapshot);
  const d1Card = document.getElementById('dashCardD1');
  if (d1Card) {
    d1Card.classList.add('is-expanded');
    d1Card.classList.toggle('is-dense', d1LineCount >= 4);
  }

  applyDashboardGridBalancing();
}

function setDashboardCardValue(
  binding: DashboardMetricBinding,
  used: number | null,
  total: number | null,
): void {
  const usedNode = document.getElementById(binding.usedId);
  const totalNode = document.getElementById(binding.totalId);
  const percentNode = document.getElementById(binding.percentId);
  const ringNode = document.getElementById(binding.ringId) as SVGCircleElement | null;
  const cardNode = document.getElementById(binding.cardId);

  if (usedNode) usedNode.textContent = formatDashboardNumber(used);
  if (totalNode) totalNode.textContent = formatDashboardNumber(total);

  const normalizedUsed = used !== null && Number.isFinite(used) ? Math.max(0, used) : null;
  const normalizedTotal = total !== null && Number.isFinite(total) && total > 0 ? total : null;
  const ratio = normalizedUsed !== null && normalizedTotal !== null
    ? Math.min(1, normalizedUsed / normalizedTotal)
    : 0;
  const percent = Math.round(ratio * 100);

  if (percentNode) {
    percentNode.textContent = normalizedUsed === null || normalizedTotal === null
      ? t('dash_na')
      : `${percent}%`;
  }

  if (ringNode) {
    ringNode.style.strokeDasharray = '100';
    ringNode.style.strokeDashoffset = `${(100 - percent).toFixed(2)}`;
    ringNode.classList.toggle('unknown', normalizedUsed === null || normalizedTotal === null);
  }

  if (cardNode) {
    cardNode.classList.toggle('is-high', percent >= 85);
    cardNode.classList.toggle('is-medium', percent >= 60 && percent < 85);
  }
}

function setDashboardLoadingState(isLoading: boolean): void {
  dashboardLoading = isLoading;
  dashboardRefreshBtn.disabled = busy || isLoading;
  dashboardRefreshBtn.textContent = isLoading ? t('dash_updating') : t('dash_refresh');
}

function renderDashboard(snapshot: DashboardSnapshot | null, externalWarning = '', missingConfig = false): void {
  for (const binding of DASHBOARD_BINDINGS) {
    const used = getDashboardUsedValue(snapshot, binding.key);
    const total = DASHBOARD_FREE_TOTALS[binding.key] ?? null;
    setDashboardCardValue(binding, used, total);
  }
  renderDashboardCardExtras(snapshot);

  if (!snapshot) {
    dashboardMeta.textContent = missingConfig ? t('dash_missing_config') : `${t('dash_updated_at')}: ${t('dash_na')}`;
    if (externalWarning) {
      dashboardWarning.hidden = false;
      dashboardWarning.textContent = externalWarning;
    } else {
      dashboardWarning.hidden = true;
      dashboardWarning.textContent = '';
    }
    return;
  }

  const locale = currentLocale === 'en' ? 'en-US' : 'zh-CN';
  const timeText = new Date(snapshot.fetchedAt).toLocaleString(locale, { hour12: false });
  dashboardMeta.textContent = `${t('dash_updated_at')}: ${timeText}`;

  const warnings = [...snapshot.warnings];
  if (externalWarning) warnings.push(externalWarning);
  if (warnings.length > 0) {
    dashboardWarning.hidden = false;
    dashboardWarning.textContent = `${t('dash_warning')}: ${warnings.join(' | ')}`;
  } else {
    dashboardWarning.hidden = true;
    dashboardWarning.textContent = '';
  }
}

function markDashboardStaleForActiveAccount(): void {
  const active = getActiveAccount();
  if (!active) return;
  dashboardCacheByAccountId.delete(active.id);
}

async function refreshDashboard(force = false): Promise<void> {
  const active = getActiveAccount();
  if (!active) return;

  const form = active.id === activeAccountId ? getFormState() : active.form;
  if (!form.cfApiToken || !form.cfAccountId) {
    dashboardCacheByAccountId.delete(active.id);
    renderDashboard(null, '', true);
    return;
  }

  const cached = dashboardCacheByAccountId.get(active.id) || null;
  if (!force && cached) {
    const ageMs = Date.now() - Date.parse(cached.fetchedAt || '');
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 3 * 60 * 1000) {
      renderDashboard(cached);
      return;
    }
  }

  const requestId = ++dashboardRequestSeq;
  setDashboardLoadingState(true);

  try {
    const snapshot = await fetchDashboardSnapshot(form);
    dashboardCacheByAccountId.set(active.id, snapshot);

    if (requestId !== dashboardRequestSeq) return;
    const current = getActiveAccount();
    if (!current || current.id !== active.id) return;
    renderDashboard(snapshot);
  } catch (error) {
    if (requestId !== dashboardRequestSeq) return;
    const message = error instanceof Error ? error.message : String(error);
    if (cached) {
      renderDashboard(cached, message);
    } else {
      renderDashboard(null, message);
    }
  } finally {
    if (requestId === dashboardRequestSeq) {
      setDashboardLoadingState(false);
    }
  }
}

function positionFloatingNavIndicator(immediate = false): void {
  const activeButton = navButtons.find((button) => button.classList.contains('active'));
  if (!activeButton) return;

  const offsetX = Math.max(0, activeButton.offsetLeft);
  const width = Math.max(0, activeButton.offsetWidth);

  const previousTransition = floatingNavIndicator.style.transition;
  if (immediate) {
    floatingNavIndicator.style.transition = 'none';
  }

  floatingNavIndicator.style.width = `${width}px`;
  floatingNavIndicator.style.transform = `translate3d(${offsetX.toFixed(3)}px, 0, 0)`;

  floatingNav.classList.add('ready');

  if (immediate) {
    void floatingNavIndicator.offsetWidth;
    floatingNavIndicator.style.transition = previousTransition;
  }
}

function setActiveView(viewId: ViewId, immediateIndicator = false): void {
  activeViewId = viewId;

  for (const pane of viewPanes) {
    const active = pane.dataset.view === viewId;
    pane.classList.toggle('active', active);
    pane.toggleAttribute('hidden', !active);
  }

  for (const button of navButtons) {
    const active = button.dataset.view === viewId;
    button.classList.toggle('active', active);
    if (active) {
      button.setAttribute('aria-current', 'true');
    } else {
      button.removeAttribute('aria-current');
    }
  }

  positionFloatingNavIndicator(immediateIndicator);
}

function setNavIconAndLabel(
  buttonIdPrefix: 'navHome' | 'navAccount' | 'navDeploy' | 'navLogs',
  iconSvg: string,
  labelKey: string,
): void {
  setHtml(`${buttonIdPrefix}Icon`, iconSvg);
  setText(`${buttonIdPrefix}Label`, labelKey);
}

function applyScrollVisualEffects(): void {
  const top = window.scrollY || document.documentElement.scrollTop || 0;
  const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
  const progress = Math.min(top / max, 1);

  document.documentElement.style.setProperty('--mi-scroll-progress', progress.toFixed(4));
  document.body.classList.toggle('is-scrolled', top > 12);
}

function bindFloatingNav(): void {
  for (const button of navButtons) {
    button.addEventListener('click', () => {
      const nextView = String(button.dataset.view || '').trim() as ViewId;
      if (!nextView) return;
      if (nextView === activeViewId) return;
      void (async () => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        setActiveView(nextView);
        if (nextView === 'home') {
          await refreshDashboard(false);
        }
        button.blur();
      })();
    });
  }
}

function bindScrollVisualEffects(): void {
  const queue = (): void => {
    if (scrollFxRaf) return;
    scrollFxRaf = window.requestAnimationFrame(() => {
      scrollFxRaf = 0;
      applyScrollVisualEffects();
    });
  };

  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', () => {
    queue();
    positionFloatingNavIndicator(true);
  });
  window.setTimeout(() => {
    positionFloatingNavIndicator(true);
  }, 60);

  if ('fonts' in document) {
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    void fonts?.ready
      ?.then(() => {
        positionFloatingNavIndicator(true);
      })
      .catch(() => {
        /* noop */
      });
  }
  queue();
}

function applyLocale(): void {
  document.documentElement.lang = currentLocale;

  setText('heroBadge', 'badge');
  setText('titleMain', 'title');
  setText('titleDesc', 'subtitle');
  setText('chipCache', 'chip_cache');
  setText('chipMulti', 'chip_multi');
  setText('accountTitle', 'account_title');
  setText('accountDesc', 'account_desc');
  setText('activeAccountLabel', 'active_account');
  setText('manageAccountsBtn', 'manage_accounts');
  setText('manageAccountsDesc', 'manage_accounts_desc');
  setText('accountManagerTitle', 'manage_accounts');
  setText('accountManagerDesc', 'manage_accounts_desc');
  setText('openAddAccountBtn', 'account_manager_add');
  closeAccountManagerBtn.setAttribute('aria-label', t('account_manager_close'));
  closeAccountManagerBtn.setAttribute('title', t('account_manager_close'));
  setText('accountMetaEmailLabel', 'account_meta_email_label');
  setText('accountMetaIdLabel', 'account_meta_id_label');
  setText('accountTip', 'account_tip');

  setText('modalTitle', 'modal_title');
  setText('modalDesc', 'modal_desc');
  setText('modalNameLabel', 'modal_name_label');
  setText('modalTokenLabel', 'modal_token_label');
  setText('modalAccountIdLabel', 'modal_account_label');
  setText('modalEmailLabel', 'modal_email_label');
  setText('modalCloneLabel', 'modal_clone');
  setText('cancelAddAccountBtn', 'cancel');
  setText('confirmAddAccountBtn', 'confirm');

  setText('deployTitle', 'deploy_title');
  setText('deployDesc', 'deploy_desc');
  setText('groupCfTitle', 'group_cf');
  setText('groupBotTitle', 'group_bot');

  setText('labelWorkerName', 'label_worker_name');
  setText('labelKvNamespaceTitle', 'label_kv');
  setText('labelD1DatabaseName', 'label_d1');
  setText('labelWorkerUrl', 'label_worker_url');

  setText('labelBotToken', 'label_bot_token');
  setText('labelAdminChatId', 'label_admin_chat');
  setText('labelVerifyPublicBaseUrl', 'label_verify_url');
  setText('labelPanelUrl', 'label_panel_url');

  setText('labelDeployPanel', 'switch_panel');
  setText('deployPanelOptOn', 'switch_panel_on');
  setText('deployPanelOptOff', 'switch_panel_off');
  setText('labelPagesProjectName', 'label_pages_project');
  setText('labelPagesBranch', 'label_pages_branch');

  setText('saveBtn', 'btn_save');
  setText('clearLogBtn', 'btn_clear_logs');
  setText('deployBtn', 'btn_deploy');
  setText('logsTitle', 'logs_title');
  setText('dashboardTitle', 'dash_title');
  setText('dashboardDesc', 'dash_desc');
  setText('dashLabelRequests', 'dash_worker_requests');
  setText('dashLabelWorkers', 'dash_workers_total');
  setText('dashLabelKv', 'dash_kv_total');
  setText('dashLabelD1', 'dash_d1_total');
  setText('dashLabelPages', 'dash_pages_total');
  setText('dashUsedTextRequests', 'dash_used');
  setText('dashTotalTextRequests', 'dash_total');
  setText('dashUsedTextWorkers', 'dash_used');
  setText('dashTotalTextWorkers', 'dash_total');
  setText('dashUsedTextKv', 'dash_used');
  setText('dashTotalTextKv', 'dash_total');
  setText('dashUsedTextD1', 'dash_used');
  setText('dashTotalTextD1', 'dash_total');
  setText('dashUsedTextPages', 'dash_used');
  setText('dashTotalTextPages', 'dash_total');
  setNavIconAndLabel('navHome', NAV_HOME_ICON, 'nav_home');
  setNavIconAndLabel('navAccount', NAV_ACCOUNT_ICON, 'nav_account');
  setNavIconAndLabel('navDeploy', NAV_DEPLOY_ICON, 'nav_deploy');
  setNavIconAndLabel('navLogs', NAV_LOGS_ICON, 'nav_logs');

  setPlaceholder('workerName', 'ph_worker_name');
  setPlaceholder('kvNamespaceTitle', 'ph_kv');
  setPlaceholder('d1DatabaseName', 'ph_d1');
  setPlaceholder('workerUrl', 'ph_worker_url');
  setPlaceholder('botToken', 'ph_bot_token');
  setPlaceholder('adminChatId', 'ph_admin_chat');
  setPlaceholder('verifyPublicBaseUrl', 'ph_verify_url');
  setPlaceholder('panelUrl', 'ph_panel_url');
  setPlaceholder('pagesProjectName', 'ph_pages_project');
  setPlaceholder('pagesBranch', 'ph_pages_branch');
  setPlaceholder('newAccountNameInput', 'modal_name_ph');
  setPlaceholder('newAccountTokenInput', 'modal_token_ph');
  setPlaceholder('newAccountIdInput', 'modal_account_ph');
  setPlaceholder('newAccountEmailInput', 'modal_email_ph');

  localeToggleBtn.textContent = t('locale_toggle');
  floatingNav.setAttribute('aria-label', t('nav_aria'));
  applyTheme();
  renderAccountOptions();
  setActiveView(activeViewId, true);
  setDashboardLoadingState(dashboardLoading);
  const active = getActiveAccount();
  const cached = active ? dashboardCacheByAccountId.get(active.id) || null : null;
  renderDashboard(cached);
}

function refreshPagesFieldsState(): void {
  const disabled = String(deployPanelSelect.value) !== '1';
  getInput('pagesProjectName').disabled = disabled || busy;
  getInput('pagesBranch').disabled = disabled || busy;
}

function setBusy(nextBusy: boolean): void {
  busy = nextBusy;

  for (const key of formTextFields) {
    getInput(key).disabled = nextBusy;
  }

  deployPanelSelect.disabled = nextBusy;
  saveBtn.disabled = nextBusy;
  deployBtn.disabled = nextBusy;

  manageAccountsBtn.disabled = nextBusy;
  localeToggleBtn.disabled = nextBusy;
  themeToggleBtn.disabled = nextBusy;
  dashboardRefreshBtn.disabled = nextBusy || dashboardLoading;
  for (const button of navButtons) {
    button.disabled = nextBusy;
  }

  refreshPagesFieldsState();
  renderAccountManagerList();
}

async function saveCurrentForm(showLog = true): Promise<void> {
  const active = getActiveAccount();
  if (!active) return;

  active.form = cloneFormState(getFormState());
  active.updatedAt = Date.now();
  const activeIndex = accounts.findIndex((item) => item.id === active.id);
  active.name = normalizeAccountName(active.name, fallbackAccountName(activeIndex + 1, currentLocale));

  renderAccountOptions();
  await persistUiState();

  if (showLog) {
    appendLog(t('log_saved'));
  }
}

async function switchAccount(nextId: string): Promise<void> {
  if (!nextId || nextId === activeAccountId) return;

  cancelAutoSave();
  await saveCurrentForm(false);

  activeAccountId = nextId;
  const active = getActiveAccount();
  if (!active) return;

  setFormState(active.form);
  renderAccountOptions();
  refreshPagesFieldsState();

  await persistUiState();
  appendLog(tf('log_account_switched', { name: active.name }));
  if (activeViewId === 'home') {
    void refreshDashboard(false);
  }
}

function queueSwitchAccount(nextId: string): Promise<void> {
  const targetId = String(nextId || '').trim();
  if (!targetId || targetId === activeAccountId) {
    return Promise.resolve();
  }

  accountSwitchQueue = accountSwitchQueue
    .then(async () => {
      if (!targetId || targetId === activeAccountId) return;
      await switchAccount(targetId);
    })
    .catch(() => {
      /* noop */
    });

  return accountSwitchQueue;
}

function openAccountManagerModal(): void {
  renderAccountManagerList();
  accountManagerModal.classList.remove('hidden');
  accountManagerModal.setAttribute('aria-hidden', 'false');
}

function closeAccountManagerModal(): void {
  accountManagerModal.classList.add('hidden');
  accountManagerModal.setAttribute('aria-hidden', 'true');
}

function clearAccountModalInputs(): void {
  newAccountNameInput.value = '';
  newAccountTokenInput.value = '';
  newAccountIdInput.value = '';
  newAccountEmailInput.value = '';
}

function syncAccountModalFromActive(force = false): void {
  if (!cloneCurrentInput.checked) return;
  const active = getActiveAccount();
  if (!active) return;
  if (force || !newAccountTokenInput.value.trim()) {
    newAccountTokenInput.value = String(active.form.cfApiToken || '');
  }
  if (force || !newAccountIdInput.value.trim()) {
    newAccountIdInput.value = String(active.form.cfAccountId || '');
  }
  if (force || !newAccountEmailInput.value.trim()) {
    newAccountEmailInput.value = normalizeAccountEmail(active.email);
  }
}

function openAccountModal(): void {
  clearAccountModalInputs();
  cloneCurrentInput.checked = false;
  closeAccountManagerModal();
  accountModal.classList.remove('hidden');
  accountModal.setAttribute('aria-hidden', 'false');
  setTimeout(() => newAccountNameInput.focus(), 0);
}

function closeAccountModal(): void {
  accountModal.classList.add('hidden');
  accountModal.setAttribute('aria-hidden', 'true');
  clearAccountModalInputs();
}

async function addAccount(): Promise<void> {
  const rawName = newAccountNameInput.value.trim();
  const rawToken = newAccountTokenInput.value.trim();
  const rawAccountId = newAccountIdInput.value.trim();
  const rawEmail = newAccountEmailInput.value.trim();
  if (!rawName) {
    alert(t('alert_add_name'));
    return;
  }
  if (!rawToken || !rawAccountId) {
    alert(t('alert_add_required'));
    return;
  }

  const baseDefaults = defaultFormState || getFallbackFormState();
  const baseForm = cloneCurrentInput.checked ? getFormState() : baseDefaults;
  const nextForm = normalizeFormState(
    {
      ...baseForm,
      cfApiToken: rawToken,
      cfAccountId: rawAccountId,
    },
    baseDefaults,
  );
  const next = createAccount(rawName, nextForm, rawEmail);
  accounts.push(next);
  activeAccountId = next.id;

  setFormState(next.form);
  renderAccountOptions();
  refreshPagesFieldsState();

  await persistUiState();
  closeAccountModal();
  appendLog(tf('log_account_created', { name: next.name }));
  if (activeViewId === 'home') {
    void refreshDashboard(true);
  }
}

async function deleteAccountById(accountId: string): Promise<void> {
  if (accounts.length <= 1) {
    alert(t('alert_keep_one'));
    return;
  }

  if (!confirm(t('alert_delete_confirm'))) return;

  const target = accounts.find((item) => item.id === accountId);
  if (!target) return;
  const wasActive = target.id === activeAccountId;

  accounts = accounts.filter((item) => item.id !== target.id);
  if (accounts.length === 0) return;

  if (wasActive) {
    activeAccountId = accounts[0].id;
    const next = getActiveAccount();
    if (next) {
      setFormState(next.form);
      refreshPagesFieldsState();
    }
  }

  renderAccountOptions();

  await persistUiState();
  appendLog(tf('log_account_deleted', { name: target.name }));
  if (activeViewId === 'home') {
    void refreshDashboard(true);
  }
}

function bindAutoProjectName(): void {
  const workerInput = getInput('workerName');
  const pagesInput = getInput('pagesProjectName');

  const sync = (): void => {
    if (pagesInput.dataset.edited === '1') return;
    pagesInput.value = suggestPagesProjectName(workerInput.value);
  };

  sync();

  workerInput.addEventListener('input', () => {
    sync();
    markDashboardStaleForActiveAccount();
    queueAutoSave();
  });

  workerInput.addEventListener('change', () => {
    sync();
    markDashboardStaleForActiveAccount();
    queueAutoSave();
  });

  pagesInput.addEventListener('input', () => {
    pagesInput.dataset.edited = '1';
    queueAutoSave();
  });
}

async function onDeploy(): Promise<void> {
  if (busy) return;

  try {
    cancelAutoSave();
    clearLogs();
    setBusy(true);

    setStatus(t('status_running'), 'running');
    await saveCurrentForm(false);

    appendLog(t('log_deploy_start'));
    appendLog(t('log_cors_tip'));

    const result = await runDeploy(getFormState(), appendLog);

    if (result.bootstrapOk) {
      setStatus(t('status_done'), 'ok');
    } else {
      setStatus(t('status_done_warn'), 'ok');
    }

    appendLog(t('log_summary_title'));
    appendLog(`${t('log_worker')}: ${result.workerName}`);
    appendLog(`${t('log_worker_url')}: ${result.workerUrl}`);
    appendLog(`${t('log_webhook')}: ${result.webhookUrl}`);
    appendLog(`${t('log_panel_url')}: ${result.panelUrl || t('not_set')}`);
    appendLog(`${t('log_panel_entry')}: ${result.panelEntryUrl || t('not_set')}`);
    appendLog(`${t('log_pages_project')}: ${result.pagesProjectName || t('not_set')}`);
    appendLog(`${t('log_kv_id')}: ${result.kvNamespaceId}`);
    appendLog(`${t('log_d1_id')}: ${result.d1DatabaseId}`);

    if (!result.bootstrapOk) {
      appendLog(`${t('log_bootstrap_warn')}: ${result.bootstrapReason}`);
    }

    const active = getActiveAccount();
    if (active) {
      const base = defaultFormState || getFallbackFormState();
      const mergedForm = normalizeFormState(
        {
          ...getFormState(),
          panelUrl: String(result.panelUrl || active.form.panelUrl || '').trim(),
        },
        base,
      );
      setFormState(mergedForm);
      active.form = cloneFormState(mergedForm);
      active.updatedAt = Date.now();
      await persistUiState();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`${t('status_deploy_fail')}: ${message}`, 'error');
    appendLog(`${t('status_deploy_fail')}: ${message}`);
  } finally {
    setBusy(false);
  }
}

async function bootstrap(): Promise<void> {
  setStatus(t('status_loading'), 'running');

  defaultFormState = await createDefaultFormState();

  const loaded = await loadUiState(defaultFormState);
  currentLocale = sanitizeLocale(loaded.locale);
  currentTheme = sanitizeTheme(loaded.theme);
  accounts = loaded.accounts;
  activeAccountId = loaded.activeAccountId;

  const active = getActiveAccount();
  if (!active) {
    const fallback = createAccount(t('default_account_name'), defaultFormState);
    accounts = [fallback];
    activeAccountId = fallback.id;
  }

  applyLocale();
  setFormState((getActiveAccount() as AccountState).form);
  renderAccountOptions();
  refreshPagesFieldsState();

  await persistUiState();
  setStatus(t('status_idle'), 'idle');
  if (activeViewId === 'home') {
    void refreshDashboard(false);
  }
}

for (const key of formTextFields) {
  const input = getInput(key);
  if (key === 'workerName' || key === 'pagesProjectName') continue;
  input.addEventListener('input', () => {
    queueAutoSave();
  });
  if (key === 'workerUrl' || key === 'verifyPublicBaseUrl') {
    input.addEventListener('blur', () => {
      const normalized = normalizeHttpUrlInput(input.value);
      if (!normalized) return;
      if (normalized === input.value.trim()) return;
      input.value = normalized;
      markDashboardStaleForActiveAccount();
      queueAutoSave();
    });
  }
}

saveBtn.addEventListener('click', async () => {
  if (busy) return;
  try {
    cancelAutoSave();
    await saveCurrentForm(true);
    setStatus(t('status_saved'), 'idle');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`${t('status_save_fail')}: ${message}`, 'error');
    appendLog(`${t('status_save_fail')}: ${message}`);
  }
});

clearLogBtn.addEventListener('click', () => {
  clearLogs();
});

dashboardRefreshBtn.addEventListener('click', () => {
  void refreshDashboard(true);
});

deployBtn.addEventListener('click', () => {
  void onDeploy();
});

deployPanelSelect.addEventListener('change', () => {
  refreshPagesFieldsState();
  queueAutoSave();
});

localeToggleBtn.addEventListener('click', () => {
  currentLocale = currentLocale === 'zh' ? 'en' : 'zh';
  applyLocale();
  void persistUiState();
});

themeToggleBtn.addEventListener('click', () => {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme();
  void persistUiState();
});

manageAccountsBtn.addEventListener('click', () => {
  if (busy) return;
  openAccountManagerModal();
});

closeAccountManagerBtn.addEventListener('click', () => {
  closeAccountManagerModal();
});

openAddAccountBtn.addEventListener('click', () => {
  if (busy) return;
  openAccountModal();
});

cancelAddAccountBtn.addEventListener('click', () => {
  closeAccountModal();
});

confirmAddAccountBtn.addEventListener('click', () => {
  if (busy) return;
  void addAccount();
});

cloneCurrentInput.addEventListener('change', () => {
  syncAccountModalFromActive(true);
});

accountManagerList.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const switchBtn = target.closest<HTMLButtonElement>('button[data-account-switch]');
  const deleteBtn = target.closest<HTMLButtonElement>('button[data-account-delete]');

  if (switchBtn?.dataset.accountSwitch) {
    if (busy) return;
    const id = switchBtn.dataset.accountSwitch;
    void queueSwitchAccount(id).then(() => {
      renderAccountManagerList();
    });
    return;
  }

  if (deleteBtn?.dataset.accountDelete) {
    if (busy) return;
    const id = deleteBtn.dataset.accountDelete;
    void deleteAccountById(id);
  }
});

accountManagerModal.addEventListener('click', (event) => {
  if (event.target === accountManagerModal) {
    closeAccountManagerModal();
  }
});

accountModal.addEventListener('click', (event) => {
  if (event.target === accountModal) {
    closeAccountModal();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !accountManagerModal.classList.contains('hidden')) {
    closeAccountManagerModal();
    return;
  }
  if (event.key === 'Escape' && !accountModal.classList.contains('hidden')) {
    closeAccountModal();
  }
});

bindAutoProjectName();
bindFloatingNav();
bindScrollVisualEffects();

void bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  setStatus(`${t('status_init_fail')}: ${message}`, 'error');
  appendLog(`${t('status_init_fail')}: ${message}`);
});
