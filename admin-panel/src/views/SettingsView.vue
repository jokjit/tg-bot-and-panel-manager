<template>
  <div class="page-stack">
    <n-card class="glass-card hero-strip" :bordered="false">
      <div class="panel-heading">
        <div>
          <div class="panel-kicker">{{ t('settings.title') }}</div>
          <h2>{{ t('settings.desc') }}</h2>
          <p>{{ t('settings.sectionGeneralDesc') }}</p>
        </div>
        <div class="panel-toolbar">
          <n-button type="primary" :loading="saving" @click="save">{{ t('settings.save') }}</n-button>
          <n-button secondary :loading="loading" @click="load">{{ t('settings.reload') }}</n-button>
        </div>
      </div>
    </n-card>

    <n-form label-placement="top" :model="form" class="page-stack">
      <n-grid :cols="24" x-gap="12 s:16 m:18" y-gap="12 s:16 m:18" responsive="screen" item-responsive>
        <n-gi span="24 m:12">
          <n-card class="glass-card" :bordered="false">
            <div class="panel-heading compact">
              <div>
                <h3>{{ t('settings.general') }}</h3>
                <p>{{ t('settings.sectionGeneralDesc') }}</p>
              </div>
            </div>

            <div class="settings-grid">
              <n-form-item :label="t('settings.botToken')">
                <n-input
                  v-model:value="form.BOT_TOKEN"
                  type="password"
                  show-password-on="mousedown"
                  :placeholder="t('settings.keepEmpty')"
                />
              </n-form-item>
              <n-form-item :label="t('settings.adminChatId')">
                <n-input v-model:value="form.ADMIN_CHAT_ID" placeholder="-100..." />
              </n-form-item>
              <n-form-item :label="t('settings.publicBaseUrl')">
                <n-input v-model:value="form.PUBLIC_BASE_URL" :placeholder="t('settings.publicBaseUrlPlaceholder')" />
              </n-form-item>
            </div>
          </n-card>
        </n-gi>

        <n-gi span="24 m:12">
          <n-card class="glass-card" :bordered="false">
            <div class="panel-heading compact">
              <div>
                <h3>{{ t('settings.behavior') }}</h3>
                <p>{{ t('settings.sectionBehaviorDesc') }}</p>
              </div>
            </div>

            <div class="switch-stack">
              <div class="switch-tile">
                <div>
                  <strong>{{ t('settings.topicMode') }}</strong>
                  <span>{{ form.TOPIC_MODE_BOOL ? t('app.enabled') : t('app.disabled') }}</span>
                </div>
                <n-switch v-model:value="form.TOPIC_MODE_BOOL" />
              </div>
              <div class="switch-tile">
                <div>
                  <strong>{{ t('settings.userVerification') }}</strong>
                  <span>{{ form.USER_VERIFICATION_BOOL ? t('app.enabled') : t('app.disabled') }}</span>
                </div>
                <n-switch v-model:value="form.USER_VERIFICATION_BOOL" />
              </div>
            </div>
          </n-card>
        </n-gi>
      </n-grid>
    </n-form>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NCard,
  NForm,
  NFormItem,
  NGi,
  NGrid,
  NInput,
  NSwitch,
  useMessage,
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchSystemConfig, saveSystemConfig } from '../services/api';

const message = useMessage();
const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);

const form = reactive({
  BOT_TOKEN: '',
  ADMIN_CHAT_ID: '',
  PUBLIC_BASE_URL: '',
  TOPIC_MODE_BOOL: true,
  USER_VERIFICATION_BOOL: true,
});

function assignConfig(cfg = {}) {
  form.ADMIN_CHAT_ID = cfg.ADMIN_CHAT_ID || '';
  form.PUBLIC_BASE_URL = cfg.PUBLIC_BASE_URL || '';
  form.TOPIC_MODE_BOOL = String(cfg.TOPIC_MODE || 'true') !== 'false';
  form.USER_VERIFICATION_BOOL = String(cfg.USER_VERIFICATION || 'true') !== 'false';
  form.BOT_TOKEN = '';
}

async function load() {
  loading.value = true;
  try {
    const data = await fetchSystemConfig();
    assignConfig(data.config || {});
  } catch (error) {
    message.error(error.message || t('settings.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    const payload = {
      ADMIN_CHAT_ID: form.ADMIN_CHAT_ID,
      PUBLIC_BASE_URL: form.PUBLIC_BASE_URL,
      TOPIC_MODE: form.TOPIC_MODE_BOOL ? 'true' : 'false',
      USER_VERIFICATION: form.USER_VERIFICATION_BOOL ? 'true' : 'false',
    };

    if (form.BOT_TOKEN) payload.BOT_TOKEN = form.BOT_TOKEN;

    await saveSystemConfig(payload);
    message.success(t('settings.saveSuccess'));
    await load();
  } catch (error) {
    message.error(error.message || t('settings.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
}

.switch-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.settings-grid :deep(.n-form-item),
.settings-grid :deep(.n-form-item-blank) {
  min-width: 0;
}

.settings-grid-full {
  margin-top: 16px;
}

@media (max-width: 900px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}
</style>
