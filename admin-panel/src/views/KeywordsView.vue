<template>
  <div class="page-stack">
    <n-card class="glass-card hero-strip" :bordered="false">
      <div class="panel-heading">
        <div>
          <div class="panel-kicker">{{ t('keywords.title') }}</div>
          <h2>{{ t('keywords.panelTitle') }}</h2>
          <p>{{ t('keywords.desc') }}</p>
        </div>
        <div class="panel-toolbar">
          <n-button type="primary" :loading="saving" @click="save">{{ t('keywords.save') }}</n-button>
          <n-button secondary :loading="loading" @click="load">{{ t('keywords.reload') }}</n-button>
        </div>
      </div>
    </n-card>

    <n-grid :cols="24" x-gap="12 s:16 m:18" y-gap="12 s:16 m:18" responsive="screen" item-responsive>
      <n-gi span="24 m:16">
        <n-card class="glass-card" :bordered="false">
          <div class="panel-heading compact">
            <div>
              <h3>{{ t('keywords.listTitle') }}</h3>
              <p>{{ t('keywords.hint') }}</p>
            </div>
          </div>

          <n-form-item :label="t('keywords.fieldLabel')">
            <n-input
              v-model:value="form.KEYWORD_FILTERS"
              type="textarea"
              :autosize="{ minRows: 10, maxRows: 18 }"
              :placeholder="t('keywords.placeholder')"
            />
          </n-form-item>
        </n-card>
      </n-gi>

      <n-gi span="24 m:8">
        <n-card class="glass-card" :bordered="false">
          <div class="panel-heading compact">
            <div>
              <h3>{{ t('keywords.rulesTitle') }}</h3>
              <p>{{ t('keywords.rulesDesc') }}</p>
            </div>
          </div>

          <div class="rule-list">
            <div class="switch-tile rule-item">
              <div>
                <strong>{{ t('keywords.ruleOneTitle') }}</strong>
                <span>{{ t('keywords.ruleOneDesc') }}</span>
              </div>
            </div>
            <div class="switch-tile rule-item">
              <div>
                <strong>{{ t('keywords.ruleTwoTitle') }}</strong>
                <span>{{ t('keywords.ruleTwoDesc') }}</span>
              </div>
            </div>
            <div class="switch-tile rule-item">
              <div>
                <strong>{{ t('keywords.ruleThreeTitle') }}</strong>
                <span>{{ t('keywords.ruleThreeDesc') }}</span>
              </div>
            </div>
          </div>
        </n-card>
      </n-gi>
    </n-grid>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { NButton, NCard, NFormItem, NGi, NGrid, NInput, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchSystemConfig, saveSystemConfig } from '../services/api';

const message = useMessage();
const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);

const form = reactive({
  KEYWORD_FILTERS: '',
});

function assignConfig(cfg = {}) {
  form.KEYWORD_FILTERS = cfg.KEYWORD_FILTERS || '';
}

async function load() {
  loading.value = true;
  try {
    const data = await fetchSystemConfig();
    assignConfig(data.config || {});
  } catch (error) {
    message.error(error.message || t('keywords.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    await saveSystemConfig({
      KEYWORD_FILTERS: form.KEYWORD_FILTERS,
    });
    message.success(t('keywords.saveSuccess'));
    await load();
  } catch (error) {
    message.error(error.message || t('keywords.saveFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.rule-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rule-item {
  min-height: 88px;
}
</style>
