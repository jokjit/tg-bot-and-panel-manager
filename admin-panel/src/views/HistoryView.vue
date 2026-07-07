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
          <n-tag round type="info">{{ t('history.sessionList') }} · {{ groupedSessions.length }}</n-tag>
          <n-tag round type="success">{{ t('history.sessionMessages', { n: items.length }) }}</n-tag>
          <n-button type="primary" :loading="loading" @click="load(true, { force: true })">{{ t('history.load') }}</n-button>
        </div>
      </div>
    </n-card>

    <n-card class="glass-card" :bordered="false">
      <n-form label-placement="top">
        <div class="history-filters">
          <n-form-item :label="t('history.userId')">
            <n-input v-model:value="filters.userId" :placeholder="t('history.userIdPlaceholder')" />
          </n-form-item>
          <n-form-item :label="t('history.keyword')">
            <n-input v-model:value="filters.q" :placeholder="t('history.keywordPlaceholder')" clearable />
          </n-form-item>
          <n-form-item :label="t('history.direction')">
            <n-select v-model:value="filters.direction" :options="directionOptions" />
          </n-form-item>
          <n-form-item :label="t('history.messageType')">
            <n-select v-model:value="filters.messageType" :options="messageTypeOptions" />
          </n-form-item>
          <n-form-item :label="t('history.limit')">
            <n-input-number v-model:value="filters.limit" :min="1" :max="100" style="width: 100%" />
          </n-form-item>
        </div>
      </n-form>
      <p class="muted history-hint">{{ t('history.d1Hint') }}</p>
    </n-card>

    <div class="summary-metric-grid history-overview">
      <n-card
        v-for="card in overviewCards"
        :key="card.key"
        class="glass-card summary-metric-card"
        :class="`summary-metric-card--${card.tone}`"
        :bordered="false"
      >
        <div class="summary-metric-card__main">
          <div class="summary-metric-card__label">
            <span class="summary-metric-card__dot"></span>
            <span>{{ card.label }}</span>
          </div>
          <div class="summary-metric-card__value">{{ card.value }}</div>
        </div>
        <div class="summary-metric-card__icon">
          <Icon :icon="card.icon" width="24" />
        </div>
      </n-card>
    </div>

    <n-empty v-if="!loading && groupedSessions.length === 0" :description="t('history.empty')" class="glass-card history-empty" />

    <div v-else class="history-layout">
      <n-card class="glass-card history-sidebar" :bordered="false">
        <div class="history-sidebar__title">{{ t('history.sessionList') }}</div>
        <div class="history-sidebar__list">
          <button
            v-for="session in groupedSessions"
            :key="session.userId"
            type="button"
            class="history-session-link"
            :class="{ 'history-session-link--active': String(activeSessionId) === String(session.userId) }"
            @click="activeSessionId = session.userId"
          >
            <div class="history-session-link__top">
              <strong>{{ t('history.sessionUser', { id: session.userId }) }}</strong>
              <span>{{ t('history.sessionCount', { n: session.items.length }) }}</span>
            </div>
            <div class="history-session-link__meta">
              <span>{{ formatTime(session.latestAt) }}</span>
              <span v-if="session.topicId">{{ t('history.sessionTopic', { id: session.topicId }) }}</span>
            </div>
            <div class="history-session-link__preview">{{ getSessionPreview(session) }}</div>
          </button>
        </div>
      </n-card>

      <n-card v-if="selectedSession" class="glass-card history-detail" :bordered="false">
        <div class="history-session__header">
          <div>
            <div class="history-session__title">{{ t('history.sessionUser', { id: selectedSession.userId }) }}</div>
            <div class="history-session__subtitle">
              {{ t('history.sessionMessages', { n: selectedSession.items.length }) }} · {{ t('history.sessionUpdated') }} {{ formatTime(selectedSession.latestAt) }}
            </div>
          </div>
          <div class="history-session__meta">
            <n-tag size="small" type="default">{{ selectedSession.chatType || t('history.chatTypePrivate') }}</n-tag>
            <n-tag v-if="selectedSession.topicId" size="small" type="warning">{{ t('history.sessionTopic', { id: selectedSession.topicId }) }}</n-tag>
          </div>
        </div>

        <div class="history-chat history-chat--detail">
          <div
            v-for="item in selectedSession.items"
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
              <span v-if="item.media_file_id">{{ t('history.media') }}</span>
            </div>
          </div>
        </div>
      </n-card>
    </div>

    <div v-if="items.length" class="history-load-more">
      <n-button secondary :disabled="!hasMore" :loading="loadingMore" @click="load(false)">
        {{ hasMore ? t('history.loadMore') : t('history.noMore') }}
      </n-button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { NButton, NCard, NEmpty, NForm, NFormItem, NInput, NInputNumber, NSelect, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchHistory } from '../services/api';

const message = useMessage();
const { t } = useI18n();
const loading = ref(false);
const loadingMore = ref(false);
const items = ref([]);
const activeSessionId = ref('');
const nextCursor = ref(null);
const hasMore = ref(false);
const filters = reactive({
  userId: '',
  q: '',
  direction: '',
  messageType: '',
  limit: 50,
});

const directionOptions = computed(() => [
  { label: t('history.directionAll'), value: '' },
  { label: t('history.userToAdmin'), value: 'user_to_admin' },
  { label: t('history.adminToUser'), value: 'admin_to_user' },
]);

const messageTypeOptions = computed(() => [
  { label: t('history.messageTypeAll'), value: '' },
  { label: t('history.typeText'), value: 'text' },
  { label: t('history.typePhoto'), value: 'photo' },
  { label: t('history.typeVideo'), value: 'video' },
  { label: t('history.typeDocument'), value: 'document' },
  { label: t('history.typeVoice'), value: 'voice' },
  { label: t('history.typeSticker'), value: 'sticker' },
]);

const overviewCards = computed(() => [
  {
    key: 'sessions',
    label: t('history.sessionList'),
    value: String(groupedSessions.value.length),
    icon: 'solar:chat-round-line-bold',
    tone: 'green',
  },
  {
    key: 'messages',
    label: t('history.panelTitle'),
    value: String(items.value.length),
    icon: 'solar:inbox-line-bold',
    tone: 'blue',
  },
  {
    key: 'selected',
    label: t('history.sessionUpdated'),
    value: selectedSession.value ? t('history.sessionUser', { id: selectedSession.value.userId }) : '-',
    icon: 'solar:user-id-bold',
    tone: 'amber',
  },
]);

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

const selectedSession = computed(() => {
  if (!groupedSessions.value.length) return null;
  return groupedSessions.value.find((session) => String(session.userId) === String(activeSessionId.value)) || groupedSessions.value[0];
});

watch(
  groupedSessions,
  (sessions) => {
    if (!sessions.length) {
      activeSessionId.value = '';
      return;
    }

    const exists = sessions.some((session) => String(session.userId) === String(activeSessionId.value));
    if (!exists) {
      activeSessionId.value = sessions[0].userId;
    }
  },
  { immediate: true },
);

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

function getSessionPreview(session) {
  const lastItem = session?.items?.[session.items.length - 1];
  if (!lastItem) return t('history.sessionPreviewEmpty');
  return renderMessageText(lastItem);
}

async function load(reset = true, options = {}) {
  const isReset = reset !== false;
  if (!isReset && !nextCursor.value) return;

  if (isReset) {
    loading.value = true;
  } else {
    loadingMore.value = true;
  }

  try {
    const data = await fetchHistory(
      {
        userId: filters.userId || undefined,
        q: filters.q || undefined,
        direction: filters.direction || undefined,
        messageType: filters.messageType || undefined,
        beforeId: isReset ? undefined : nextCursor.value,
        limit: filters.limit || 50,
      },
      {
        force: Boolean(options.force),
      },
    );
    const incoming = Array.isArray(data.items) ? data.items : [];
    items.value = isReset ? incoming : [...items.value, ...incoming];
    nextCursor.value = data.nextCursor || null;
    hasMore.value = Boolean(data.hasMore);
  } catch (error) {
    message.error(error.message || t('history.loadFailed'));
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

onMounted(() => load(true));
</script>

<style scoped>
.history-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.history-overview {
  margin-top: -2px;
}

.history-filters {
  display: grid;
  grid-template-columns: minmax(180px, 1.4fr) minmax(180px, 1.4fr) minmax(150px, 1fr) minmax(150px, 1fr) minmax(120px, 0.8fr);
  gap: 12px 16px;
}

.history-hint {
  margin-top: 4px;
}

.history-empty {
  padding: 40px 0;
}

.history-layout {
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.history-load-more {
  display: flex;
  justify-content: center;
  padding: 2px 0 8px;
}

.history-sidebar,
.history-detail {
  min-height: 640px;
}

.history-sidebar__title {
  margin-bottom: 14px;
  font-size: 14px;
  font-weight: 800;
  color: var(--text-primary);
}

.history-sidebar__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 560px;
  overflow-y: auto;
  padding-right: 4px;
}

.history-session-link {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--panel-border-strong);
  border-radius: 18px;
  background: var(--panel-strong);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.history-session-link:hover {
  transform: translateY(-1px);
  border-color: rgba(92, 139, 255, 0.45);
}

.history-session-link--active {
  background: rgba(92, 139, 255, 0.14);
  border-color: rgba(92, 139, 255, 0.55);
  box-shadow: inset 0 0 0 1px rgba(92, 139, 255, 0.12);
}

.history-session-link__top,
.history-session-link__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.history-session-link__top strong {
  color: var(--text-primary);
  font-size: 15px;
}

.history-session-link__top span,
.history-session-link__meta {
  color: var(--text-secondary);
  font-size: 12px;
}

.history-session-link__meta {
  margin-top: 6px;
}

.history-session-link__preview {
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-session__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 18px;
}

.history-session__title {
  font-size: 22px;
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

.history-chat--detail {
  min-height: 520px;
  max-height: 600px;
  overflow-y: auto;
  padding-right: 4px;
}

.history-bubble {
  max-width: min(78%, 860px);
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

.history-sidebar__list::-webkit-scrollbar,
.history-chat--detail::-webkit-scrollbar {
  width: 6px;
}

.history-sidebar__list::-webkit-scrollbar-thumb,
.history-chat--detail::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(92, 139, 255, 0.4);
}

@media (max-width: 1100px) {
  .history-layout {
    grid-template-columns: 1fr;
  }

  .history-sidebar,
  .history-detail,
  .history-chat--detail {
    min-height: auto;
  }
}

@media (max-width: 900px) {
  .history-filters {
    grid-template-columns: 1fr;
  }

  .history-bubble {
    max-width: 100%;
  }

  .history-session__header,
  .history-session-link__top,
  .history-session-link__meta {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
