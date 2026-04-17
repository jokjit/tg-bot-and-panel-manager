<template>
  <div class="page-stack">
    <n-card class="glass-card hero-strip" :bordered="false">
      <div class="panel-heading">
        <div>
          <div class="panel-kicker">{{ t('history.title') }}</div>
          <h2>{{ t('history.panelTitle') }}</h2>
          <p>{{ t('history.desc') }}</p>
        </div>
        <div class="panel-toolbar history-toolbar">
          <n-tag round type="info">{{ groupedSessions.length }} 会话</n-tag>
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

    <n-empty v-if="!loading && groupedSessions.length === 0" :description="t('history.empty')" class="glass-card history-empty" />

    <div v-else class="history-group-list">
      <n-card
        v-for="session in groupedSessions"
        :key="session.userId"
        class="glass-card history-session"
        :bordered="false"
      >
        <div class="history-session__header">
          <div>
            <div class="history-session__title">用户 #{{ session.userId }}</div>
            <div class="history-session__subtitle">
              {{ session.items.length }} 条消息 · 最近更新 {{ formatTime(session.latestAt) }}
            </div>
          </div>
          <div class="history-session__meta">
            <n-tag size="small" type="default">{{ session.chatType || 'private' }}</n-tag>
            <n-tag v-if="session.topicId" size="small" type="warning">Topic {{ session.topicId }}</n-tag>
          </div>
        </div>

        <div class="history-chat">
          <div
            v-for="item in session.items"
            :key="item.id"
            class="history-bubble"
            :class="item.direction === 'admin_to_user' ? 'history-bubble--admin' : 'history-bubble--user'"
          >
            <div class="history-bubble__head">
              <span class="history-bubble__role">
                {{ item.direction === 'admin_to_user' ? t('history.adminToUser') : t('history.userToAdmin') }}
              </span>
              <span>{{ formatTime(item.created_at) }}</span>
            </div>

            <div class="history-bubble__body">
              {{ renderMessageText(item) }}
            </div>

            <div class="history-bubble__foot">
              <span>{{ t('history.messageType') }}：{{ item.message_type }}</span>
              <span v-if="item.media_file_id">Media</span>
            </div>
          </div>
        </div>
      </n-card>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
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

const groupedSessions = computed(() => {
  const map = new Map();
  const ordered = [...items.value].sort((left, right) => new Date(left.created_at) - new Date(right.created_at));

  for (const item of ordered) {
    const userId = item.user_id;
    if (!map.has(userId)) {
      map.set(userId, {
        userId,
        latestAt: item.created_at,
        topicId: item.topic_id,
        chatType: item.chat_type,
        items: [],
      });
    }

    const session = map.get(userId);
    session.items.push(item);
    session.latestAt = item.created_at;
    session.topicId = session.topicId || item.topic_id;
    session.chatType = session.chatType || item.chat_type;
  }

  return [...map.values()].sort((left, right) => new Date(right.latestAt) - new Date(left.latestAt));
});

function formatTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function renderMessageText(item) {
  const text = String(item?.text_content || '').trim();
  if (text) return text;
  const type = String(item?.message_type || 'unknown');
  return `【${type}】`;
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
.history-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.history-filters {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(160px, 1fr);
  gap: 12px 16px;
}

.history-hint {
  margin-top: 4px;
}

.history-empty {
  padding: 40px 0;
}

.history-group-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.history-session {
  overflow: hidden;
}

.history-session__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 18px;
}

.history-session__title {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);
}

.history-session__subtitle {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 13px;
}

.history-session__meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.history-chat {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-bubble {
  max-width: min(82%, 760px);
  padding: 14px 16px;
  border-radius: 20px;
  border: 1px solid var(--panel-border-strong);
  box-shadow: var(--soft-shadow);
}

.history-bubble--user {
  align-self: flex-start;
  background: rgba(92, 139, 255, 0.12);
}

.history-bubble--admin {
  align-self: flex-end;
  background: rgba(55, 224, 184, 0.12);
}

.history-bubble__head,
.history-bubble__foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-secondary);
}

.history-bubble__role {
  font-weight: 700;
}

.history-bubble__body {
  margin: 10px 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
  line-height: 1.75;
}

@media (max-width: 900px) {
  .history-filters {
    grid-template-columns: 1fr;
  }

  .history-bubble {
    max-width: 100%;
  }

  .history-session__header {
    flex-direction: column;
  }
}
</style>
