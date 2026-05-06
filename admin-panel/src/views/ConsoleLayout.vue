<template>
  <n-layout position="absolute" style="inset: 0" class="layout-root">
    <div class="console-shell">
      <aside class="desktop-sider">
        <div class="sider-panel glass-card">
          <div class="brand">
            <div class="brand-badge">
              <div class="logo">
                <Icon icon="solar:chat-round-like-broken" width="22" />
              </div>
              <div class="title-wrap">
                <div class="title">{{ t('app.title') }}</div>
                <div class="sub">{{ t('app.subtitle') }}</div>
              </div>
            </div>
            <div class="brand-chip">{{ t('app.pageStyle') }}</div>
          </div>

          <n-menu class="nav-menu" :options="menuOptions" :value="activeKey" @update:value="handleMenuSelect" />

          <div class="sider-footer">
            <n-tag round :type="statusTagType">{{ adminStore.loggedIn ? t('app.login') : t('app.offline') }}</n-tag>
            <div class="user-chip">
              <span class="label">{{ t('app.currentUser') }}</span>
              <strong>{{ adminStore.username || 'admin' }}</strong>
            </div>
          </div>
        </div>
      </aside>

      <n-drawer v-model:show="drawerVisible" placement="left" :width="312" :trap-focus="false">
        <n-drawer-content :title="t('app.navigation')" closable body-content-style="padding: 0">
          <div class="drawer-panel">
            <div class="sider-panel glass-card drawer-panel__inner">
              <div class="brand">
                <div class="brand-badge">
                  <div class="logo">
                    <Icon icon="solar:chat-round-like-broken" width="22" />
                  </div>
                  <div class="title-wrap">
                    <div class="title">{{ t('app.title') }}</div>
                    <div class="sub">{{ t('app.subtitle') }}</div>
                  </div>
                </div>
                <div class="brand-chip">{{ t('app.pageStyle') }}</div>
              </div>

              <n-menu class="nav-menu" :options="menuOptions" :value="activeKey" @update:value="handleMenuSelect" />

              <div class="sider-footer">
                <n-tag round :type="statusTagType">{{ adminStore.loggedIn ? t('app.login') : t('app.offline') }}</n-tag>
                <div class="user-chip">
                  <span class="label">{{ t('app.currentUser') }}</span>
                  <strong>{{ adminStore.username || 'admin' }}</strong>
                </div>
              </div>
            </div>
          </div>
        </n-drawer-content>
      </n-drawer>

      <n-layout embedded class="main-shell">
        <n-layout-header class="header-shell">
          <div class="header-panel glass-card">
            <div class="header-main">
              <n-button
                v-if="isMobile"
                quaternary
                circle
                class="nav-trigger"
                :aria-label="t('app.openMenu')"
                @click="drawerVisible = true"
              >
                <template #icon>
                  <Icon icon="solar:hamburger-menu-outline" width="20" />
                </template>
              </n-button>

              <div class="page-intro">
                <div class="eyebrow">{{ t('app.console') }}</div>
                <h1>{{ pageTitle }}</h1>
                <p>{{ pageDesc }}</p>
              </div>
            </div>

            <div class="header-actions">
              <n-select
                class="control-select"
                size="small"
                :value="uiStore.locale"
                :options="localeOptions"
                @update:value="onLocaleChange"
              />

              <div class="theme-switch">
                <span>{{ uiStore.theme === 'dark' ? t('app.dark') : t('app.light') }}</span>
                <n-switch :value="uiStore.theme === 'dark'" @update:value="onThemeChange">
                  <template #checked>
                    <Icon icon="solar:moon-stars-bold" />
                  </template>
                  <template #unchecked>
                    <Icon icon="solar:sun-bold" />
                  </template>
                </n-switch>
              </div>

              <n-button secondary round @click="onRefreshStatus">{{ t('app.refresh') }}</n-button>
              <n-button quaternary round @click="onLogout">{{ t('app.logout') }}</n-button>
            </div>
          </div>
        </n-layout-header>

        <n-layout-content :content-style="contentStyle" class="content-shell">
          <router-view v-slot="{ Component, route: currentRoute }">
            <transition name="page-fade-slide" mode="out-in">
              <component :is="Component" :key="currentRoute.fullPath" />
            </transition>
          </router-view>
        </n-layout-content>
      </n-layout>
    </div>
  </n-layout>
</template>

<script setup>
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  NButton,
  NDrawer,
  NDrawerContent,
  NIcon,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NMenu,
  NSelect,
  NSwitch,
  NTag,
  useMessage,
} from 'naive-ui';
import { Icon } from '@iconify/vue';
import { useI18n } from 'vue-i18n';
import {
  HomeOutline,
  KeyOutline,
  MailOutline,
  PeopleOutline,
  ShieldHalfOutline,
  PersonCircleOutline,
  SearchOutline,
  CheckmarkCircleOutline,
  SettingsOutline,
  TimeOutline,
} from '@vicons/ionicons5';
import { adminStore, clearAuthState, setLoginState, setStatusData } from '../stores/admin';
import { fetchStatus, logout } from '../services/api';
import { setLocale, setTheme, uiStore } from '../stores/ui';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const { t, te, locale } = useI18n();
const drawerVisible = ref(false);
const isMobile = ref(false);

function renderIcon(icon) {
  return () => h(NIcon, null, { default: () => h(icon) });
}

const menuOptions = computed(() => [
  { label: t('app.dashboard'), key: '/dashboard', icon: renderIcon(HomeOutline) },
  { label: t('app.users'), key: '/users', icon: renderIcon(PeopleOutline) },
  { label: t('app.blacklist'), key: '/blacklist', icon: renderIcon(ShieldHalfOutline) },
  { label: t('app.trust'), key: '/trust', icon: renderIcon(CheckmarkCircleOutline) },
  { label: t('app.admins'), key: '/admins', icon: renderIcon(PersonCircleOutline) },
  { label: t('app.keywords'), key: '/keywords', icon: renderIcon(SearchOutline) },
  { label: t('app.messages'), key: '/messages', icon: renderIcon(MailOutline) },
  { label: t('app.history'), key: '/history', icon: renderIcon(TimeOutline) },
  { label: t('app.password'), key: '/password', icon: renderIcon(KeyOutline) },
  { label: t('app.settings'), key: '/settings', icon: renderIcon(SettingsOutline) },
]);

const localeOptions = computed(() => [
  { label: t('app.zh'), value: 'zh-CN' },
  { label: t('app.en'), value: 'en-US' },
]);

const statusTagType = computed(() => (adminStore.loggedIn ? 'success' : 'warning'));
const activeKey = computed(() => route.path);
const currentSection = computed(() => String(route.name || 'dashboard'));
const pageTitle = computed(() => (route.meta.titleKey ? t(route.meta.titleKey) : t('app.overview')));
const pageDesc = computed(() => {
  const descKey = `${currentSection.value}.desc`;
  return te(descKey) ? t(descKey) : t('dashboard.panelDesc');
});
const contentStyle = computed(() => `padding: 0 ${isMobile.value ? 12 : 20}px ${isMobile.value ? 18 : 24}px;`);

function updateViewport() {
  if (typeof window === 'undefined') return;
  isMobile.value = window.innerWidth < 1080;
}

function onLocaleChange(next) {
  setLocale(next);
  locale.value = next;
}

function onThemeChange(isDark) {
  setTheme(isDark ? 'dark' : 'light');
}

function handleMenuSelect(key) {
  drawerVisible.value = false;
  router.push(key);
}

async function onRefreshStatus() {
  try {
    const data = await fetchStatus();
    setStatusData(data);
    setLoginState(true, adminStore.username || 'admin');
    message.success(t('app.refreshDone'));
  } catch (error) {
    clearAuthState();
    message.error(error.message || t('app.refreshFailed'));
    router.replace('/login');
  }
}

async function onLogout() {
  try {
    await logout();
  } catch (error) {
    // ignore
  }
  clearAuthState();
  message.info(t('app.loggedOut'));
  router.replace('/login');
}

onMounted(async () => {
  updateViewport();
  window.addEventListener('resize', updateViewport);
  if (adminStore.loggedIn) {
    await onRefreshStatus();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport);
});
</script>

<style scoped>
.layout-root,
.main-shell,
.content-shell {
  background: transparent;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

.console-shell {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 292px minmax(0, 1fr);
  gap: 6px;
}

.desktop-sider {
  padding: 16px 0 16px 16px;
}

.sider-panel {
  height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 16px 14px;
  animation: siderIn var(--motion-slow) ease both;
}

.drawer-panel {
  padding: 10px;
}

.drawer-panel__inner {
  min-height: calc(100vh - 120px);
  height: auto;
}

.brand {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 6px 0;
}

.brand-badge {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border-radius: 22px;
  background: var(--panel-strong);
  border: 1px solid var(--panel-border-strong);
}

.logo {
  width: 44px;
  height: 44px;
  border-radius: 16px;
  background: linear-gradient(145deg, var(--accent), var(--accent-2));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 14px 28px rgba(79, 124, 255, 0.28);
}

.title {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
}

.sub {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.brand-chip {
  align-self: flex-start;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(92, 139, 255, 0.14);
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
}

.sider-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.user-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 16px;
  background: var(--panel-strong);
  border: 1px solid var(--panel-border-strong);
}

.user-chip .label {
  font-size: 12px;
  color: var(--text-secondary);
}

.user-chip strong {
  font-size: 13px;
  color: var(--text-primary);
}

.header-shell {
  padding: 16px 20px 14px;
  background: transparent;
  height: auto;
}

.header-panel {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  animation: headerIn var(--motion-slow) ease both;
}

.header-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.nav-trigger {
  flex-shrink: 0;
  margin-top: 2px;
}

.page-intro {
  min-width: 0;
  max-width: 680px;
}

.eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
}

.page-intro h1 {
  margin: 8px 0 8px;
  font-size: 30px;
  line-height: 1.1;
  color: var(--text-primary);
}

.page-intro p {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.control-select {
  width: 122px;
}

.theme-switch {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 999px;
  background: var(--panel-strong);
  border: 1px solid var(--panel-border-strong);
}

.theme-switch span {
  font-size: 12px;
  color: var(--text-secondary);
}

:deep(.nav-menu) {
  background: transparent;
}

:deep(.nav-menu .n-menu-item-content),
:deep(.nav-menu .n-submenu .n-menu-item-content) {
  height: 48px;
  border-radius: 16px;
  margin: 5px 4px;
  font-weight: 700;
}

:deep(.nav-menu .n-menu-item-content::before) {
  border-radius: 16px;
}

:deep(.nav-menu .n-menu-item-content--selected) {
  background: linear-gradient(135deg, rgba(92, 139, 255, 0.92), rgba(107, 92, 255, 0.82));
  box-shadow: 0 14px 28px rgba(79, 124, 255, 0.24);
}

:deep(.nav-menu .n-menu-item-content--selected .n-menu-item-content-header),
:deep(.nav-menu .n-menu-item-content--selected .n-icon) {
  color: #ffffff !important;
}

:deep(.page-fade-slide-enter-active),
:deep(.page-fade-slide-leave-active) {
  transition: opacity var(--motion-mid) ease, transform var(--motion-mid) ease;
}

:deep(.page-fade-slide-enter-from),
:deep(.page-fade-slide-leave-to) {
  opacity: 0;
  transform: translateY(var(--motion-rise-distance, 8px));
}

@keyframes siderIn {
  from {
    opacity: 0;
    transform: translateX(-12px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes headerIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1280px) {
  .console-shell {
    grid-template-columns: 266px minmax(0, 1fr);
  }

  .page-intro h1 {
    font-size: 26px;
  }
}

@media (max-width: 1079px) {
  .console-shell {
    grid-template-columns: 1fr;
  }

  .desktop-sider {
    display: none;
  }

  .sider-panel,
  .header-panel {
    animation: none;
  }

  .header-shell {
    padding: 12px 14px 12px;
  }

  .header-panel {
    padding: 16px 16px 18px;
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .control-select {
    width: min(220px, 100%);
  }
}

@media (max-width: 640px) {
  .header-shell {
    padding: 10px 10px 12px;
  }

  .header-panel {
    padding: 14px;
    border-radius: 20px;
    gap: 14px;
  }

  .page-intro h1 {
    font-size: 22px;
    margin-top: 6px;
  }

  .page-intro p {
    font-size: 13px;
    line-height: 1.6;
  }

  .header-actions {
    display: grid;
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .control-select,
  .theme-switch,
  .header-actions .n-button {
    width: 100%;
  }

  .theme-switch {
    justify-content: space-between;
    border-radius: 16px;
  }

  .drawer-panel {
    padding: 8px;
  }
}
</style>
