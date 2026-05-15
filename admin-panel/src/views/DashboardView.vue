<template>
  <div class="page-stack">
    <n-card class="glass-card hero-strip" :bordered="false">
      <div class="dashboard-hero">
        <div class="panel-heading">
          <div>
            <div class="panel-kicker">{{ t('dashboard.title') }}</div>
            <h2>{{ t('dashboard.panelTitle') }}</h2>
            <p>{{ t('dashboard.panelDesc') }}</p>
          </div>

          <div class="panel-summary">
            <n-tag type="success" round>{{ t('dashboard.loggedInAs', { name: adminStore.username || t('auth.defaultAdmin') }) }}</n-tag>
            <n-button tertiary round @click="router.push('/history')">{{ t('app.history') }}</n-button>
            <n-button secondary round @click="refresh">{{ t('dashboard.refresh') }}</n-button>
          </div>
        </div>

        <div class="dashboard-hero__meta">
          <div v-for="item in heroIndicators" :key="item.key" class="dashboard-meta-pill">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
        </div>
      </div>
    </n-card>

    <n-grid class="dashboard-metrics" :cols="24" x-gap="12 s:16 m:18" y-gap="12 s:16 m:18" responsive="screen" item-responsive>
      <n-gi v-for="card in statusCards" :key="card.key" span="24 s:12 m:6">
        <n-card class="glass-card metric-card" :bordered="false">
          <div class="metric-card__label">{{ card.label }}</div>
          <div class="metric-card__value">{{ card.value }}</div>
        </n-card>
      </n-gi>
    </n-grid>

    <n-grid :cols="24" x-gap="12 s:16 m:18" y-gap="12 s:16 m:18" responsive="screen" item-responsive>
      <n-gi span="24 m:10">
        <n-card class="glass-card dashboard-actions-card" :bordered="false">
          <div class="panel-heading compact">
            <div>
              <h3>{{ t('dashboard.quickActions') }}</h3>
              <p>{{ t('dashboard.loginHint') }}</p>
            </div>
          </div>
          <div class="action-grid">
            <n-button tertiary @click="router.push('/history')">
              {{ t('history.panelTitle') }}
            </n-button>
            <n-button type="primary" :loading="loadingWebhook" @click="handleSetWebhook">
              {{ t('dashboard.setWebhook') }}
            </n-button>
            <n-button secondary :loading="loadingWebhook" @click="handleGetWebhook">
              {{ t('dashboard.webhookInfo') }}
            </n-button>
            <n-button type="warning" :loading="loadingWebhook" @click="handleDeleteWebhook">
              {{ t('dashboard.deleteWebhook') }}
            </n-button>
            <n-button tertiary :loading="loadingWebhook" @click="handleSyncCommands">
              {{ t('dashboard.syncCommands') }}
            </n-button>
          </div>
          <div class="dashboard-runtime-note">
            <div v-for="row in runtimeRows" :key="row.label" class="runtime-note-item">
              <span>{{ row.label }}</span>
              <code>{{ row.value }}</code>
            </div>
          </div>
          <pre class="mono-box" v-if="webhookResult">{{ webhookResult }}</pre>
        </n-card>
      </n-gi>

      <n-gi span="24 m:14">
        <n-card class="glass-card" :bordered="false">
          <div class="panel-heading compact">
            <div>
              <h3>{{ t('dashboard.statusJson') }}</h3>
              <p>{{ t('dashboard.rawData') }}</p>
            </div>
          </div>
          <pre class="mono-box">{{ prettyStatus }}</pre>
        </n-card>
      </n-gi>
    </n-grid>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NCard, NGi, NGrid, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { adminStore, clearAuthState, setLoginState, setStatusData } from '../stores/admin';
import { deleteWebhook, fetchStatus, getWebhookInfo, setWebhook, syncBotCommands } from '../services/api';

const router = useRouter();
const message = useMessage();
const { t } = useI18n();
const loadingWebhook = ref(false);
const webhookResult = ref('');

const statusData = computed(() => adminStore.statusData || null);
const prettyStatus = computed(() => JSON.stringify(statusData.value || {}, null, 2));
const stateLabel = (enabled) => (enabled ? t('dashboard.on') : t('dashboard.off'));

const heroIndicators = computed(() => [
  {
    key: 'bot-ready',
    label: t('dashboard.botReady'),
    value: statusData.value?.botConfigReady ? t('app.enabled') : t('app.disabled'),
  },
  {
    key: 'topic-mode',
    label: t('dashboard.topicMode'),
    value: stateLabel(Boolean(statusData.value?.topicModeEnabled)),
  },
  {
    key: 'verification',
    label: t('dashboard.verification'),
    value: stateLabel(Boolean(statusData.value?.userVerificationEnabled)),
  },
  {
    key: 'kv',
    label: t('dashboard.kv'),
    value: statusData.value?.hasKv ? t('app.enabled') : t('app.disabled'),
  },
  {
    key: 'd1',
    label: t('dashboard.d1'),
    value: statusData.value?.hasD1 ? t('app.enabled') : t('app.disabled'),
  },
]);

const runtimeRows = computed(() => [
  {
    label: t('dashboard.webhookLabel'),
    value: statusData.value?.webhookUrl || '-',
  },
  {
    label: t('dashboard.panelLabel'),
    value: statusData.value?.adminPanel || statusData.value?.adminPanelTarget || '-',
  },
]);

const statusCards = computed(() => [
  {
    key: 'bot-ready',
    label: t('dashboard.botReady'),
    value: statusData.value?.botConfigReady ? t('app.enabled') : t('app.disabled'),
  },
  {
    key: 'mode',
    label: t('dashboard.webhookMode'),
    value: statusData.value?.adminMode || '-',
  },
  {
    key: 'topic',
    label: t('dashboard.topicMode'),
    value: statusData.value?.topicModeEnabled ? t('dashboard.on') : t('dashboard.off'),
  },
  {
    key: 'verify',
    label: t('dashboard.verification'),
    value: statusData.value?.userVerificationEnabled ? t('dashboard.on') : t('dashboard.off'),
  },
  {
    key: 'chat',
    label: t('dashboard.adminChat'),
    value: statusData.value?.adminChatId || '-',
  },
]);

async function refresh() {
  try {
    const data = await fetchStatus();
    setStatusData(data);
    setLoginState(true, adminStore.username || t('auth.defaultAdmin'));
  } catch (error) {
    clearAuthState();
    message.error(error.message || t('dashboard.statusFailed'));
    router.replace('/login');
  }
}

async function handleSetWebhook() {
  loadingWebhook.value = true;
  try {
    const data = await setWebhook();
    webhookResult.value = JSON.stringify(data, null, 2);
    message.success(t('dashboard.webhookSet'));
    await refresh();
  } catch (error) {
    message.error(error.message || t('dashboard.setFailed'));
  } finally {
    loadingWebhook.value = false;
  }
}

async function handleGetWebhook() {
  loadingWebhook.value = true;
  try {
    const data = await getWebhookInfo();
    webhookResult.value = JSON.stringify(data, null, 2);
  } catch (error) {
    message.error(error.message || t('dashboard.queryFailed'));
  } finally {
    loadingWebhook.value = false;
  }
}

async function handleDeleteWebhook() {
  loadingWebhook.value = true;
  try {
    const data = await deleteWebhook();
    webhookResult.value = JSON.stringify(data, null, 2);
    message.success(t('dashboard.webhookDeleted'));
    await refresh();
  } catch (error) {
    message.error(error.message || t('dashboard.deleteFailed'));
  } finally {
    loadingWebhook.value = false;
  }
}

async function handleSyncCommands() {
  loadingWebhook.value = true;
  try {
    const data = await syncBotCommands();
    webhookResult.value = JSON.stringify(data, null, 2);
    message.success(t('dashboard.syncCommandsDone'));
  } catch (error) {
    message.error(error.message || t('dashboard.syncCommandsFailed'));
  } finally {
    loadingWebhook.value = false;
  }
}

onMounted(() => {
  refresh();
});
</script>

<style scoped>
.dashboard-hero {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dashboard-hero__meta {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.dashboard-meta-pill {
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--panel-strong);
  border: 1px solid var(--panel-border-strong);
  box-shadow: var(--card-shadow);
}

.dashboard-meta-pill span {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
}

.dashboard-meta-pill strong {
  display: block;
  margin-top: 6px;
  font-size: 14px;
  color: var(--text-primary);
}

.dashboard-metrics {
  margin-top: -2px;
}

.metric-card {
  overflow: hidden;
}

.metric-card::before {
  content: '';
  position: absolute;
  inset: 0 auto auto 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
}

.metric-card__label {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.metric-card__value {
  margin-top: 14px;
  font-size: clamp(28px, 5vw, 34px);
  font-weight: 800;
  line-height: 1.15;
  color: var(--text-primary);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.dashboard-runtime-note {
  margin-top: 16px;
  display: grid;
  gap: 8px;
}

.runtime-note-item {
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(92, 139, 255, 0.08);
  border: 1px dashed var(--panel-border-strong);
}

.runtime-note-item span {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
}

.runtime-note-item code {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 1200px) {
  .dashboard-hero__meta {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .action-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .dashboard-hero__meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .panel-summary {
    gap: 8px;
  }

  .dashboard-hero__meta {
    grid-template-columns: 1fr;
  }

  .metric-card__value {
    font-size: clamp(24px, 8vw, 30px);
  }
}
</style>
