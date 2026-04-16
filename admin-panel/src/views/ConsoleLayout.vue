<template>
  <n-layout position="absolute" style="inset: 0" class="layout-root" :has-sider="!isMobile">
    <n-layout-sider
      v-if="!isMobile"
      collapse-mode="width"
      :collapsed-width="88"
      :width="290"
      :collapsed="collapsed"
      @update:collapsed="(v) => (collapsed = v)"
      show-trigger
      :native-scrollbar="false"
      class="side-rail"
    >
      <div class="sider-panel glass-card">
        <div class="brand">
          <div class="brand-badge">
            <div class="logo">
              <Icon icon="solar:chat-round-like-broken" width="22" />
            </div>
            <div class="title-wrap" v-if="!collapsed">
              <div class="title">{{ t('app.title') }}</div>
              <div class="sub">{{ t('app.subtitle') }}</div>
            </div>
          </div>
          <div class="brand-chip" v-if="!collapsed">{{ t('app.pageStyle') }}</div>
        </div>

        <n-menu
          class="nav-menu"
          :collapsed="collapsed"
          :collapsed-width="88"
          :collapsed-icon-size="22"
          :options="menuOptions"
          :value="activeKey"
          @update:value="handleMenuSelect"
        />
      </div>
    </n-layout-sider>

    <n-drawer v-model:show="drawerVisible" placement="left" :width="304" :trap-focus="false">
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
          </div>
        </div>
      </n-drawer-content>
    </n-drawer>

    <n-layout embedded class="main-shell" :class="{ 'main-shell--mobile': isMobile }">
      <n-layout-header class="header-shell">
        <div class="header-panel glass-card">
          <div class="page-intro">
            <div class="page-intro__top">
              <n-button
                v-if="isMobile"
                quaternary
                circle
                class="mobile-nav-trigger"
                :aria-label="t('app.openMenu')"
                @click="drawerVisible = true"
              >
                <template #icon>
                  <Icon icon="solar:hamburger-menu-outline" width="20" />
                </template>
              </n-button>

              <div>
                <div class="eyebrow">{{ t('app.console') }}</div>
                <h1>{{ pageTitle }}</h1>
                <p>{{ pageDesc }}</p>
              </div>
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

            <n-tag round :type="adminStore.loggedIn ? 'success' : 'warning'">
              {{ adminStore.loggedIn ? t('app.login') : t('app.offline') }}
            </n-tag>

            <div class="user-chip">
              <span class="label">{{ t('app.currentUser') }}</span>
              <strong>{{ adminStore.username || 'admin' }}</strong>
            </div>

            <n-button secondary round @click="onRefreshStatus">{{ t('app.refresh') }}</n-button>
            <n-button quaternary round @click="onLogout">{{ t('app.logout') }}</n-button>
          </div>
        </div>
      </n-layout-header>

      <n-layout-content :content-style="contentStyle" class="content-shell">
        <router-view />
      </n-layout-content>
    </n-layout>
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
  NLayoutSider,
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
} from '@vicons/ionicons5';
import { adminStore, clearAuthState, setLoginState, setStatusData } from '../stores/admin';
import { fetchStatus, logout } from '../services/api';
import { setLocale, setTheme, uiStore } from '../stores/ui';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const { t, te, locale } = useI18n();
const collapsed = ref(false);
const isMobile = ref(false);
const drawerVisible = ref(false);

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
  { label: t('app.password'), key: '/password', icon: renderIcon(KeyOutline) },
  { label: t('app.settings'), key: '/settings', icon: renderIcon(SettingsOutline) },
]);

const localeOptions = computed(() => [
  { label: t('app.zh'), value: 'zh-CN' },
  { label: t('app.en'), value: 'en-US' },
]);

const activeKey = computed(() => route.path);
const currentSection = computed(() => String(route.name || 'dashboard'));
const pageTitle = computed(() => (route.meta.titleKey ? t(route.meta.titleKey) : t('app.overview')));
const pageDesc = computed(() => {
  const descKey = `${currentSection.value}.desc`;
  return te(descKey) ? t(descKey) : t('dashboard.panelDesc');
});
const contentStyle = computed(() => `padding: 0 ${isMobile.value ? 12 : 24}px ${isMobile.value ? 20 : 24}px;`);

function updateViewport() {
  if (typeof window === 'undefined') return;
  const width = window.innerWidth;
  isMobile.value = width < 960;
  if (!isMobile.value) {
    drawerVisible.value = false;
  }
  if (width >= 960 && width < 1280) {
    collapsed.value = true;
  }
  if (width >= 1280) {
    collapsed.value = false;
  }
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

.side-rail {
  background: transparent;
  padding: 20px 0 20px 20px;
}

.sider-panel {
  height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 18px 14px;
}

.drawer-panel {
  padding: 12px;
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
  border-radius: 24px;
  background: var(--panel-strong);
  border: 1px solid var(--panel-border-strong);
}

.logo {
  width: 44px;
  height: 44px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 12px 28px rgba(79, 124, 255, 0.35);
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
  background: rgba(92, 139, 255, 0.12);
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
}

.header-shell {
  padding: 20px 24px 18px;
  background: transparent;
  height: auto;
}

.header-panel {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 24px;
}

.page-intro {
  max-width: 540px;
}

.page-intro__top {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.mobile-nav-trigger {
  flex-shrink: 0;
  margin-top: 4px;
}

.eyebrow {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
}

.page-intro h1 {
  margin: 10px 0 8px;
  font-size: 30px;
  line-height: 1.15;
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
  gap: 12px;
  flex-wrap: wrap;
}

.control-select {
  width: 120px;
}

.theme-switch,
.user-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 999px;
  background: var(--panel-strong);
  border: 1px solid var(--panel-border-strong);
}

.theme-switch span,
.user-chip .label {
  font-size: 12px;
  color: var(--text-secondary);
}

.user-chip strong {
  font-size: 14px;
  color: var(--text-primary);
}

:deep(.n-layout-sider-scroll-container) {
  padding-right: 10px;
}

:deep(.side-rail .n-layout-toggle-button) {
  background: var(--panel-strong);
  border: 1px solid var(--panel-border-strong);
  color: var(--text-primary);
  box-shadow: var(--soft-shadow);
}

:deep(.nav-menu) {
  background: transparent;
}

:deep(.nav-menu .n-menu-item-content),
:deep(.nav-menu .n-submenu .n-menu-item-content) {
  height: 50px;
  border-radius: 18px;
  margin: 6px 4px;
  font-weight: 700;
}

:deep(.nav-menu .n-menu-item-content::before) {
  border-radius: 18px;
}

:deep(.nav-menu .n-menu-item-content--selected) {
  background: linear-gradient(135deg, rgba(92, 139, 255, 0.9), rgba(107, 92, 255, 0.82));
  box-shadow: 0 16px 32px rgba(79, 124, 255, 0.24);
}

:deep(.nav-menu .n-menu-item-content--selected .n-menu-item-content-header),
:deep(.nav-menu .n-menu-item-content--selected .n-icon) {
  color: #ffffff !important;
}

@media (max-width: 1200px) {
  .header-panel {
    flex-direction: column;
  }

  .header-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 960px) {
  .header-shell {
    padding: 14px 16px 14px;
  }

  .page-intro h1 {
    font-size: 24px;
  }

  .header-panel {
    padding: 18px 18px 20px;
  }

  .header-actions {
    width: 100%;
    gap: 10px;
  }

  .control-select {
    width: min(180px, 100%);
  }
}

@media (max-width: 640px) {
  .header-shell {
    padding: 12px 12px 14px;
  }

  .header-panel {
    gap: 14px;
    padding: 16px;
    border-radius: 22px;
  }

  .page-intro,
  .page-intro__top {
    width: 100%;
  }

  .page-intro h1 {
    margin-top: 8px;
    font-size: 22px;
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
  .user-chip,
  .header-actions .n-tag,
  .header-actions .n-button {
    width: 100%;
  }

  .theme-switch,
  .user-chip {
    justify-content: space-between;
    border-radius: 18px;
  }

  .drawer-panel {
    padding: 8px;
  }
}
</style>
