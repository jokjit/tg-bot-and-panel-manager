<template>
  <div class="page-stack">
    <n-card class="glass-card hero-strip" :bordered="false">
      <div class="panel-heading">
        <div>
          <div class="panel-kicker">{{ t('messages.title') }}</div>
          <h2>{{ t('messages.panelTitle') }}</h2>
          <p>{{ t('messages.desc') }}</p>
        </div>
        <div class="panel-toolbar">
          <n-button type="primary" :loading="saving" @click="save">{{ t('messages.save') }}</n-button>
          <n-button secondary :loading="loading" @click="load">{{ t('messages.reload') }}</n-button>
        </div>
      </div>
    </n-card>

    <n-grid :cols="24" x-gap="12 s:16 m:18" y-gap="12 s:16 m:18" responsive="screen" item-responsive>
      <n-gi span="24 m:14">
        <n-card class="glass-card" :bordered="false">
          <div class="panel-heading compact">
            <div>
              <h3>{{ t('messages.editTitle') }}</h3>
              <p>{{ t('messages.editDesc') }}</p>
            </div>
          </div>

          <n-form label-placement="top" class="panel-form">
            <n-form-item :label="t('messages.welcomeType')">
              <n-select v-model:value="form.WELCOME_TYPE" :options="welcomeTypeOptions" />
            </n-form-item>
            <n-form-item :label="t('messages.welcomeMedia')">
              <n-input
                v-model:value="form.WELCOME_MEDIA"
                :placeholder="t('messages.welcomeMediaPlaceholder')"
              />
            </n-form-item>
            <n-form-item :label="t('messages.welcomeText')">
              <n-input
                v-model:value="form.WELCOME_TEXT"
                type="textarea"
                :autosize="{ minRows: 5, maxRows: 10 }"
                :placeholder="t('messages.welcomePlaceholder')"
              />
            </n-form-item>
            <n-form-item :label="t('messages.blockedText')">
              <n-input
                v-model:value="form.BLOCKED_TEXT"
                type="textarea"
                :autosize="{ minRows: 5, maxRows: 10 }"
                :placeholder="t('messages.blockedPlaceholder')"
              />
            </n-form-item>
          </n-form>
        </n-card>
      </n-gi>

      <n-gi span="24 m:10">
        <n-card class="glass-card" :bordered="false">
          <div class="panel-heading compact">
            <div>
              <h3>{{ t('messages.previewTitle') }}</h3>
              <p>{{ t('messages.previewDesc') }}</p>
            </div>
          </div>

          <n-space vertical :size="16" class="preview-stack">
            <div class="preview-card">
              <div class="preview-card__label">{{ t('messages.welcomePreview') }}</div>
              <div class="preview-meta">{{ t('messages.welcomeType') }}: {{ form.WELCOME_TYPE }}</div>
              <div v-if="form.WELCOME_MEDIA" class="preview-meta media">{{ form.WELCOME_MEDIA }}</div>
              <div class="preview-bubble">{{ form.WELCOME_TEXT || t('messages.emptyPreview') }}</div>
            </div>
            <div class="preview-card blocked">
              <div class="preview-card__label">{{ t('messages.blockedPreview') }}</div>
              <div class="preview-bubble">{{ form.BLOCKED_TEXT || t('messages.emptyPreview') }}</div>
            </div>
          </n-space>
        </n-card>
      </n-gi>
    </n-grid>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { NButton, NCard, NForm, NFormItem, NGi, NGrid, NInput, NSelect, NSpace, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchSystemConfig, saveSystemConfig } from '../services/api';

const message = useMessage();
const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);

const form = reactive({
  WELCOME_TYPE: 'text',
  WELCOME_MEDIA: '',
  WELCOME_TEXT: '',
  BLOCKED_TEXT: '',
});

const welcomeTypeOptions = computed(() => [
  { label: t('messages.welcomeTypeText'), value: 'text' },
  { label: t('messages.welcomeTypePhoto'), value: 'photo' },
  { label: t('messages.welcomeTypeVideo'), value: 'video' },
  { label: t('messages.welcomeTypeDocument'), value: 'document' },
]);

function assignConfig(cfg = {}) {
  form.WELCOME_TYPE = cfg.WELCOME_TYPE || 'text';
  form.WELCOME_MEDIA = cfg.WELCOME_MEDIA || '';
  form.WELCOME_TEXT = cfg.WELCOME_TEXT || '';
  form.BLOCKED_TEXT = cfg.BLOCKED_TEXT || '';
}

async function load() {
  loading.value = true;
  try {
    const data = await fetchSystemConfig();
    assignConfig(data.config || {});
  } catch (error) {
    message.error(error.message || t('messages.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    await saveSystemConfig({
      WELCOME_TYPE: form.WELCOME_TYPE,
      WELCOME_MEDIA: form.WELCOME_MEDIA,
      WELCOME_TEXT: form.WELCOME_TEXT,
      BLOCKED_TEXT: form.BLOCKED_TEXT,
    });
    message.success(t('messages.saveSuccess'));
    await load();
  } catch (error) {
    message.error(error.message || t('messages.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.preview-stack {
  width: 100%;
}

.preview-card {
  padding: 18px;
  border-radius: 24px;
  background: var(--panel-strong);
  border: 1px solid var(--panel-border-strong);
}

.preview-card__label {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.preview-meta {
  margin-bottom: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  word-break: break-all;
}

.preview-meta.media {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}

.preview-bubble {
  padding: 16px 18px;
  border-radius: 20px;
  background: var(--message-bg);
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.75;
}

.preview-card.blocked .preview-bubble {
  border: 1px solid rgba(255, 129, 98, 0.2);
}
</style>
