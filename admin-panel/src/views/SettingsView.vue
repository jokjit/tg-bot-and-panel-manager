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
      <n-grid :cols="24" x-gap="12" y-gap="12" responsive="screen" item-responsive>
        <n-gi span="24 l:12">
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

              <n-form-item class="settings-grid-span-2" :label="t('settings.publicBaseUrl')">
                <n-input v-model:value="form.PUBLIC_BASE_URL" :placeholder="t('settings.publicBaseUrlPlaceholder')" />
              </n-form-item>

              <n-form-item class="settings-grid-span-2" :label="t('settings.verifyPublicBaseUrl')">
                <n-input
                  v-model:value="form.VERIFY_PUBLIC_BASE_URL"
                  :placeholder="t('settings.verifyPublicBaseUrlPlaceholder')"
                />
              </n-form-item>
            </div>
          </n-card>
        </n-gi>

        <n-gi span="24 l:12">
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

            <div class="motion-block">
              <div class="motion-head">
                <strong>{{ t('settings.motion') }}</strong>
                <span>{{ t('settings.motionDesc') }}</span>
              </div>
              <n-radio-group class="motion-group" :value="motionLevel" @update:value="onMotionChange">
                <n-radio-button v-for="item in motionOptions" :key="item.value" :value="item.value">
                  {{ item.label }}
                </n-radio-button>
              </n-radio-group>
            </div>

            <div v-if="form.USER_VERIFICATION_BOOL" class="verify-block">
              <div class="verify-grid">
                <n-form-item :label="t('settings.verifyExpireMinutes')">
                  <n-input-number
                    v-model:value="form.VERIFY_EXPIRE_MINUTES"
                    :min="1"
                    :max="120"
                    :step="1"
                    clearable
                    style="width: 100%"
                  />
                </n-form-item>

                <n-form-item :label="t('settings.verifyFailBlockSeconds')">
                  <n-input-number
                    v-model:value="form.VERIFY_FAIL_BLOCK_SECONDS"
                    :min="10"
                    :max="3600"
                    :step="10"
                    clearable
                    style="width: 100%"
                  />
                </n-form-item>

                <n-form-item :label="t('settings.verifyTimeoutBlockSeconds')">
                  <n-input-number
                    v-model:value="form.VERIFY_TIMEOUT_BLOCK_SECONDS"
                    :min="10"
                    :max="3600"
                    :step="10"
                    clearable
                    style="width: 100%"
                  />
                </n-form-item>

                <n-form-item :label="t('settings.verifyMaxFailures')">
                  <n-input-number
                    v-model:value="form.VERIFY_MAX_FAILURES"
                    :min="1"
                    :max="10"
                    :step="1"
                    clearable
                    style="width: 100%"
                  />
                </n-form-item>
              </div>

              <div class="switch-stack compact-stack">
                <div class="switch-tile">
                  <div>
                    <strong>{{ t('settings.verifyCaptchaEnabled') }}</strong>
                    <span>{{ form.VERIFY_CAPTCHA_ENABLED_BOOL ? t('app.enabled') : t('app.disabled') }}</span>
                  </div>
                  <n-switch v-model:value="form.VERIFY_CAPTCHA_ENABLED_BOOL" />
                </div>

                <div class="switch-tile">
                  <div>
                    <strong>{{ t('settings.verifyMathEnabled') }}</strong>
                    <span>{{ form.VERIFY_MATH_ENABLED_BOOL ? t('app.enabled') : t('app.disabled') }}</span>
                  </div>
                  <n-switch v-model:value="form.VERIFY_MATH_ENABLED_BOOL" />
                </div>
              </div>
            </div>
          </n-card>
        </n-gi>
      </n-grid>
    </n-form>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NCard,
  NForm,
  NFormItem,
  NGi,
  NGrid,
  NInput,
  NInputNumber,
  NRadioButton,
  NRadioGroup,
  NSwitch,
  useMessage,
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchSystemConfig, saveSystemConfig } from '../services/api';
import { setMotion, uiStore } from '../stores/ui';

const DEFAULT_VERIFY_EXPIRE_MS = 15 * 60 * 1000;
const DEFAULT_VERIFY_FAIL_BLOCK_MS = 60 * 1000;
const DEFAULT_VERIFY_TIMEOUT_BLOCK_MS = 60 * 1000;
const DEFAULT_VERIFY_MAX_FAILURES = 2;

const message = useMessage();
const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);
const motionLevel = ref(uiStore.motion);

const motionOptions = computed(() => [
  { label: t('settings.motionStandard'), value: 'standard' },
  { label: t('settings.motionLight'), value: 'light' },
  { label: t('settings.motionOff'), value: 'off' },
]);

const form = reactive({
  BOT_TOKEN: '',
  ADMIN_CHAT_ID: '',
  PUBLIC_BASE_URL: '',
  VERIFY_PUBLIC_BASE_URL: '',
  TOPIC_MODE_BOOL: true,
  USER_VERIFICATION_BOOL: true,
  VERIFY_CAPTCHA_ENABLED_BOOL: true,
  VERIFY_MATH_ENABLED_BOOL: true,
  VERIFY_EXPIRE_MINUTES: 15,
  VERIFY_FAIL_BLOCK_SECONDS: 60,
  VERIFY_TIMEOUT_BLOCK_SECONDS: 60,
  VERIFY_MAX_FAILURES: DEFAULT_VERIFY_MAX_FAILURES,
});

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function msToMinutes(value, fallbackMs) {
  return Math.max(1, Math.round(toPositiveNumber(value, fallbackMs) / 60000));
}

function msToSeconds(value, fallbackMs) {
  return Math.max(1, Math.round(toPositiveNumber(value, fallbackMs) / 1000));
}

function onMotionChange(next) {
  setMotion(next);
  motionLevel.value = uiStore.motion;
}

function assignConfig(cfg = {}) {
  form.ADMIN_CHAT_ID = cfg.ADMIN_CHAT_ID || '';
  form.PUBLIC_BASE_URL = cfg.PUBLIC_BASE_URL || '';
  form.VERIFY_PUBLIC_BASE_URL = cfg.VERIFY_PUBLIC_BASE_URL || '';
  form.TOPIC_MODE_BOOL = String(cfg.TOPIC_MODE || 'true') !== 'false';
  form.USER_VERIFICATION_BOOL = String(cfg.USER_VERIFICATION || 'true') !== 'false';
  form.VERIFY_CAPTCHA_ENABLED_BOOL = String(cfg.VERIFY_CAPTCHA_ENABLED ?? 'true') !== 'false';
  form.VERIFY_MATH_ENABLED_BOOL = String(cfg.VERIFY_MATH_ENABLED ?? 'true') !== 'false';
  form.VERIFY_EXPIRE_MINUTES = msToMinutes(cfg.VERIFY_EXPIRE_MS, DEFAULT_VERIFY_EXPIRE_MS);
  form.VERIFY_FAIL_BLOCK_SECONDS = msToSeconds(cfg.VERIFY_FAIL_BLOCK_MS, DEFAULT_VERIFY_FAIL_BLOCK_MS);
  form.VERIFY_TIMEOUT_BLOCK_SECONDS = msToSeconds(cfg.VERIFY_TIMEOUT_BLOCK_MS, DEFAULT_VERIFY_TIMEOUT_BLOCK_MS);
  form.VERIFY_MAX_FAILURES = toPositiveNumber(cfg.VERIFY_MAX_FAILURES, DEFAULT_VERIFY_MAX_FAILURES);
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
      VERIFY_PUBLIC_BASE_URL: form.VERIFY_PUBLIC_BASE_URL,
      TOPIC_MODE: form.TOPIC_MODE_BOOL ? 'true' : 'false',
      USER_VERIFICATION: form.USER_VERIFICATION_BOOL ? 'true' : 'false',
      VERIFY_CAPTCHA_ENABLED: form.VERIFY_CAPTCHA_ENABLED_BOOL ? 'true' : 'false',
      VERIFY_MATH_ENABLED: form.VERIFY_MATH_ENABLED_BOOL ? 'true' : 'false',
      VERIFY_EXPIRE_MS: String(Math.max(1, Number(form.VERIFY_EXPIRE_MINUTES) || 15) * 60 * 1000),
      VERIFY_FAIL_BLOCK_MS: String(Math.max(1, Number(form.VERIFY_FAIL_BLOCK_SECONDS) || 60) * 1000),
      VERIFY_TIMEOUT_BLOCK_MS: String(Math.max(1, Number(form.VERIFY_TIMEOUT_BLOCK_SECONDS) || 60) * 1000),
      VERIFY_MAX_FAILURES: String(Math.max(1, Number(form.VERIFY_MAX_FAILURES) || DEFAULT_VERIFY_MAX_FAILURES)),
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

onMounted(() => {
  motionLevel.value = uiStore.motion;
  load();
});
</script>

<style scoped>
.settings-grid,
.verify-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
}

.settings-grid-span-2 {
  grid-column: 1 / -1;
}

.switch-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.compact-stack {
  margin-top: 16px;
}

.motion-block {
  margin-top: 16px;
  padding: 16px;
  border-radius: 18px;
  background: var(--panel-strong);
  border: 1px solid var(--panel-border-strong);
  display: grid;
  gap: 10px;
}

.motion-head strong {
  display: block;
  color: var(--text-primary);
}

.motion-head span {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.motion-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.verify-block {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--panel-border);
}

.settings-grid :deep(.n-form-item),
.settings-grid :deep(.n-form-item-blank),
.verify-grid :deep(.n-form-item),
.verify-grid :deep(.n-form-item-blank) {
  min-width: 0;
}

@media (max-width: 900px) {
  .settings-grid,
  .verify-grid {
    grid-template-columns: 1fr;
  }

  .settings-grid-span-2 {
    grid-column: auto;
  }

  .motion-group {
    width: 100%;
  }
}
</style>
