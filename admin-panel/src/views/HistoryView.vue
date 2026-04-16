<template>
  <div class="page-stack">
    <n-card class="glass-card hero-strip" :bordered="false">
      <div class="panel-heading">
        <div>
          <div class="panel-kicker">{{ t('history.title') }}</div>
          <h2>{{ t('history.panelTitle') }}</h2>
          <p>{{ t('history.desc') }}</p>
        </div>
        <div class="panel-toolbar">
          <n-button type="primary" :loading="loading" @click="load">{{ t('history.load') }}</n-button>
        </div>
      </div>
    </n-card>

    <n-card class="glass-card" :bordered="false">
      <n-form label-placement="top">
        <div class="history-filters">
          <n-form-item :label="t('history.userId')">
            <n-input v-model:value="filters.userId" :placeholder="t('history.userIdPlaceholder')" />
          </n-form-item>
          <n-form-item :label="t('history.limit')">
            <n-input-number v-model:value="filters.limit" :min="1" :max="100" />
          </n-form-item>
        </div>
      </n-form>
      <p class="muted history-hint">{{ t('history.d1Hint') }}</p>
    </n-card>

    <n-card class="glass-card" :bordered="false">
      <n-empty v-if="!loading && items.length === 0" :description="t('history.empty')" />
      <div v-else class="history-list">
        <div v-for="item in items" :key="item.id" class="history-item">
          <div class="history-item__meta">
            <n-tag size="small" :type="item.direction === 'admin_to_user' ? 'warning' : 'success'">
              {{ item.direction === 'admin_to_user' ? t('history.adminToUser') : t('history.userToAdmin') }}
            </n-tag>
            <span>#UID {{ item.user_id }}</span>
            <span>{{ t('history.messageType') }}: {{ item.message_type }}</span>
            <span>{{ t('history.createdAt') }}: {{ formatTime(item.created_at) }}</span>
          </div>
          <div class="history-item__content">{{ item.text_content || '—' }}</div>
        </div>
      </div>
    </n-card>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { NButton, NCard, NEmpty, NForm, NFormItem, NInput, NInputNumber, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchHistory } from '../services/api';

const message = useMessage();
const { t } = useI18n();
const loading = ref(false);
const items = ref([]);
const filters = reactive({
  userId: '',
  limit: 50,
});

function formatTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

async function load() {
  loading.value = true;
  try {
    const data = await fetchHistory({
      userId: filters.userId || undefined,
      limit: filters.limit || 50,
    });
    items.value = Array.isArray(data.items) ? data.items : [];
  } catch (error) {
    message.error(error.message || t('history.loadFailed'));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.history-filters {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(160px, 1fr);
  gap: 12px 16px;
}

.history-hint {
  margin-top: 4px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-item {
  padding: 16px;
  border-radius: 18px;
  background: var(--panel-strong);
  border: 1px solid var(--panel-border-strong);
}

.history-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.history-item__content {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
  line-height: 1.7;
}

@media (max-width: 900px) {
  .history-filters {
    grid-template-columns: 1fr;
  }
}
</style>
