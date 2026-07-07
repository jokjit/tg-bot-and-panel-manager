<template>
  <div class="page-stack">
    <n-card class="glass-card hero-strip" :bordered="false">
      <div class="panel-heading">
        <div>
          <div class="panel-kicker">{{ t('users.title') }}</div>
          <h2>{{ t('users.listTitle') }}</h2>
          <p>{{ t('users.listDesc') }}</p>
        </div>
        <div class="panel-toolbar">
          <div class="toolbar-chip">{{ t('app.limit') }}</div>
          <n-input-number :value="limit" :min="1" :max="100" @update:value="onLimitChange" />
          <n-button type="primary" :loading="loading" @click="loadUsers({ force: true })">{{ t('users.refresh') }}</n-button>
          <n-button secondary @click="replyModalVisible = true">{{ t('users.quickReply') }}</n-button>
          <n-button secondary :disabled="!canGoPrev || loading" @click="loadPreviousPage">
            {{ t('users.prevPage') }}
          </n-button>
          <n-button secondary :disabled="!hasMore || loading" @click="loadNextPage">
            {{ t('users.nextPage') }}
          </n-button>
          <n-tag round>{{ pageStatusText }}</n-tag>
        </div>
      </div>
    </n-card>

    <div class="summary-metric-grid users-summary">
      <n-card
        v-for="card in summaryCards"
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

    <div class="panel-split">
      <n-card class="glass-card users-list-card" :bordered="false">
        <div class="panel-heading compact">
          <div>
            <h3>{{ t('users.title') }}</h3>
            <p>{{ t('users.desc') }}</p>
          </div>
        </div>

        <div v-if="users.length" class="entity-grid">
          <article v-for="user in users" :key="user.userId" class="entity-card">
            <div class="entity-card__head entity-card__head--profile">
              <div class="entity-profile">
                <div class="entity-avatar">
                  <img v-if="avatarUrlOf(user)" :src="avatarUrlOf(user)" :alt="displayName(user)" />
                  <span v-else>{{ initialsOf(user) }}</span>
                </div>

                <div class="entity-profile__body">
                  <div class="entity-profile__main">
                    <div>
                      <h3 class="entity-card__title">{{ displayName(user) }}</h3>
                      <p class="entity-card__subtitle">#{{ user.userId }}</p>
                    </div>
                    <div class="entity-chip-list">
                      <n-tag size="small" round :type="user.hasAvatar ? 'success' : 'default'">
                        {{ user.hasAvatar ? t('profile.avatarSynced') : t('profile.avatarMissing') }}
                      </n-tag>
                      <n-tag size="small" round :type="profileStatusType(user.profileStatus)">
                        {{ profileStatusLabel(user.profileStatus) }}
                      </n-tag>
                    </div>
                  </div>

                  <div class="entity-inline-list">
                    <div class="entity-inline-item">
                      <span>{{ t('profile.username') }}</span>
                      <strong>{{ user.username ? `@${user.username}` : '-' }}</strong>
                    </div>
                    <div class="entity-inline-item">
                      <span>{{ t('profile.firstName') }}</span>
                      <strong>{{ user.firstName || '-' }}</strong>
                    </div>
                    <div class="entity-inline-item">
                      <span>{{ t('profile.lastName') }}</span>
                      <strong>{{ user.lastName || '-' }}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div class="entity-actions entity-actions--stack">
                <n-button type="primary" secondary round size="small" @click="openUserWorkspace(user)">
                  {{ t('users.conversation') }}
                </n-button>
                <n-button secondary round size="small" @click="quickReply(user)">{{ t('users.reply') }}</n-button>
                <n-button
                  round
                  size="small"
                  :type="user.blacklisted ? 'default' : 'error'"
                  :loading="actionLoading[user.userId] === (user.blacklisted ? 'unban' : 'ban')"
                  @click="handleUserAction(user, user.blacklisted ? 'unban' : 'ban')"
                >
                  {{ user.blacklisted ? t('users.unban') : t('users.ban') }}
                </n-button>
                <n-button
                  round
                  size="small"
                  :type="user.trusted ? 'default' : 'success'"
                  :loading="actionLoading[user.userId] === (user.trusted ? 'untrust' : 'trust')"
                  @click="handleUserAction(user, user.trusted ? 'untrust' : 'trust')"
                >
                  {{ user.trusted ? t('users.untrust') : t('users.trust') }}
                </n-button>
                <n-button
                  quaternary
                  round
                  size="small"
                  :loading="actionLoading[user.userId] === 'restart'"
                  @click="handleUserAction(user, 'restart')"
                >
                  {{ t('users.restart') }}
                </n-button>
                <n-button
                  round
                  size="small"
                  type="error"
                  ghost
                  :loading="actionLoading[user.userId] === 'delete'"
                  @click="confirmDeleteUser(user)"
                >
                  {{ t('users.deleteUser') }}
                </n-button>
              </div>
            </div>

            <div class="status-row">
              <n-tag size="small" round :type="user.blacklisted ? 'error' : 'default'">
                {{ user.blacklisted ? t('users.blacklisted') : t('users.notBlacklisted') }}
              </n-tag>
              <n-tag size="small" round :type="user.trusted ? 'success' : 'default'">
                {{ user.trusted ? t('users.trusted') : t('users.notTrusted') }}
              </n-tag>
              <n-tag size="small" round :type="user.verified ? 'success' : 'warning'">
                {{ t('users.verification') }}：{{ verificationLabel(user) }}
              </n-tag>
            </div>

            <div class="entity-meta entity-meta--3">
              <div class="entity-meta-item">
                <span>{{ t('users.lastSeen') }}</span>
                <strong>{{ toLocalTime(user.lastSeenAt) }}</strong>
              </div>
              <div class="entity-meta-item">
                <span>{{ t('profile.profileUpdatedAt') }}</span>
                <strong>{{ toLocalTime(user.lastProfileSyncAt) }}</strong>
              </div>
              <div class="entity-meta-item">
                <span>{{ t('profile.recentStatus') }}</span>
                <strong>{{ profileStatusLabel(user.profileStatus) }}</strong>
              </div>
            </div>

            <div class="entity-message">
              <span>{{ t('users.lastMessage') }}</span>
              <p>{{ user.lastMessagePreview || t('app.noData') }}</p>
            </div>

            <details class="entity-details">
              <summary>{{ t('profile.details') }}</summary>
              <div class="entity-details__content">
                <div class="entity-group-grid">
                  <section class="entity-group">
                    <h4>{{ t('users.title') }}</h4>
                    <dl>
                      <div>
                        <dt>{{ t('profile.userId') }}</dt>
                        <dd>#{{ user.userId }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('profile.username') }}</dt>
                        <dd>{{ user.username ? `@${user.username}` : '-' }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('profile.firstName') }}</dt>
                        <dd>{{ user.firstName || '-' }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('profile.lastName') }}</dt>
                        <dd>{{ user.lastName || '-' }}</dd>
                      </div>
                    </dl>
                  </section>

                  <section class="entity-group">
                    <h4>{{ t('profile.recentStatus') }}</h4>
                    <dl>
                      <div>
                        <dt>{{ t('profile.profileStatus') }}</dt>
                        <dd>{{ profileStatusLabel(user.profileStatus) }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('profile.avatar') }}</dt>
                        <dd>{{ user.hasAvatar ? t('profile.avatarSynced') : t('profile.avatarMissing') }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('profile.profileUpdatedAt') }}</dt>
                        <dd>{{ toLocalTime(user.lastProfileSyncAt) }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('users.verification') }}</dt>
                        <dd>{{ verificationLabel(user) }}</dd>
                      </div>
                    </dl>
                  </section>
                </div>
              </div>
            </details>
          </article>
        </div>

        <n-empty v-else :description="t('app.noData')" class="panel-empty" />
      </n-card>

    </div>

    <n-modal
      v-model:show="replyModalVisible"
      preset="card"
      class="users-reply-modal"
      :title="t('users.quickReply')"
      :mask-closable="!sending"
      :closable="!sending"
      :style="{ width: 'min(560px, calc(100vw - 24px))' }"
    >
      <div class="users-reply-modal__hint">
        {{ t('users.userId') }}：{{ replyForm.userId || '-' }}
      </div>
      <n-form :model="replyForm" label-placement="top" class="panel-form">
        <n-form-item :label="t('users.userId')">
          <n-input v-model:value="replyForm.userId" :placeholder="t('users.inputUserId')" />
        </n-form-item>
        <n-form-item :label="t('users.send')">
          <n-input
            v-model:value="replyForm.text"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 8 }"
            :placeholder="t('users.replyPlaceholder')"
          />
        </n-form-item>
        <n-button block type="primary" :loading="sending" @click="sendToUser">
          {{ t('users.sendAction') }}
        </n-button>
      </n-form>
    </n-modal>

    <n-drawer v-model:show="workspaceVisible" placement="right" width="min(560px, 100vw)" :trap-focus="false">
      <n-drawer-content :title="workspaceUser ? displayName(workspaceUser) : t('users.conversation')" closable>
        <div v-if="workspaceUser" class="user-workspace">
          <section class="workspace-profile">
            <div class="entity-avatar workspace-avatar">
              <img v-if="avatarUrlOf(workspaceUser)" :src="avatarUrlOf(workspaceUser)" :alt="displayName(workspaceUser)" />
              <span v-else>{{ initialsOf(workspaceUser) }}</span>
            </div>
            <div>
              <h3>{{ displayName(workspaceUser) }}</h3>
              <p>#{{ workspaceUser.userId }} · {{ workspaceUser.username ? `@${workspaceUser.username}` : t('app.noData') }}</p>
              <div class="workspace-tags">
                <n-tag size="small" round :type="workspaceUser.blacklisted ? 'error' : 'default'">
                  {{ workspaceUser.blacklisted ? t('users.blacklisted') : t('users.notBlacklisted') }}
                </n-tag>
                <n-tag size="small" round :type="workspaceUser.trusted ? 'success' : 'default'">
                  {{ workspaceUser.trusted ? t('users.trusted') : t('users.notTrusted') }}
                </n-tag>
                <n-tag size="small" round :type="workspaceUser.verified ? 'success' : 'warning'">
                  {{ verificationLabel(workspaceUser) }}
                </n-tag>
              </div>
            </div>
          </section>

          <section class="workspace-actions">
            <n-button
              size="small"
              :type="workspaceUser.blacklisted ? 'default' : 'error'"
              :loading="actionLoading[workspaceUser.userId] === (workspaceUser.blacklisted ? 'unban' : 'ban')"
              @click="handleUserAction(workspaceUser, workspaceUser.blacklisted ? 'unban' : 'ban')"
            >
              {{ workspaceUser.blacklisted ? t('users.unban') : t('users.ban') }}
            </n-button>
            <n-button
              size="small"
              :type="workspaceUser.trusted ? 'default' : 'success'"
              :loading="actionLoading[workspaceUser.userId] === (workspaceUser.trusted ? 'untrust' : 'trust')"
              @click="handleUserAction(workspaceUser, workspaceUser.trusted ? 'untrust' : 'trust')"
            >
              {{ workspaceUser.trusted ? t('users.untrust') : t('users.trust') }}
            </n-button>
            <n-button
              size="small"
              secondary
              :loading="actionLoading[workspaceUser.userId] === 'restart'"
              @click="handleUserAction(workspaceUser, 'restart')"
            >
              {{ t('users.restart') }}
            </n-button>
          </section>

          <section class="workspace-history">
            <div class="workspace-section-head">
              <div>
                <strong>{{ t('users.recentConversation') }}</strong>
                <span>{{ t('users.historyLimit', { count: workspaceHistory.length }) }}</span>
              </div>
              <n-button size="small" secondary :loading="workspaceLoading" @click="loadWorkspaceHistory(workspaceUser, { force: true })">
                {{ t('app.refresh') }}
              </n-button>
            </div>

            <div v-if="workspaceLoading" class="workspace-loading">{{ t('app.loading') }}</div>
            <div v-else-if="workspaceHistory.length" class="workspace-chat">
              <div
                v-for="item in workspaceHistory"
                :key="item.id"
                class="workspace-bubble"
                :class="item.direction === 'admin_to_user' ? 'workspace-bubble--admin' : 'workspace-bubble--user'"
              >
                <div class="workspace-bubble__head">
                  <span>{{ item.direction === 'admin_to_user' ? t('users.adminToUser') : t('users.userToAdmin') }}</span>
                  <span>{{ toLocalTime(item.created_at) }}</span>
                </div>
                <div class="workspace-bubble__body">{{ renderHistoryText(item) }}</div>
              </div>
            </div>
            <n-empty v-else :description="t('users.noHistory')" />
          </section>

          <section class="workspace-reply">
            <n-input
              v-model:value="workspaceReplyText"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 8 }"
              :placeholder="t('users.replyPlaceholder')"
            />
            <n-button block type="primary" :loading="workspaceSending" @click="sendWorkspaceReply">
              {{ t('users.sendAction') }}
            </n-button>
          </section>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { Icon } from '@iconify/vue';
import {
  NButton,
  NCard,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NTag,
  useMessage,
} from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchHistory, fetchUsers, resolveProtectedMediaUrl, sendReply, updateUserAction } from '../services/api';

const message = useMessage();
const { t } = useI18n();
const loading = ref(false);
const sending = ref(false);
const limit = ref(30);
const users = ref([]);
const offset = ref(0);
const hasMore = ref(false);
const nextOffset = ref(null);
const prevOffset = ref(null);
const totalUsers = ref(0);
const userSummary = ref({
  total: 0,
  blacklisted: 0,
  trusted: 0,
  verified: 0,
});
const actionLoading = reactive({});
const replyModalVisible = ref(false);
const workspaceVisible = ref(false);
const workspaceUser = ref(null);
const workspaceHistory = ref([]);
const workspaceLoading = ref(false);
const workspaceSending = ref(false);
const workspaceReplyText = ref('');

const replyForm = reactive({
  userId: '',
  text: '',
});

const summaryCards = computed(() => {
  const summary = userSummary.value || {};

  return [
    { key: 'total', label: t('users.title'), value: String(summary.total || 0), icon: 'solar:users-group-rounded-bold', tone: 'green' },
    { key: 'blacklisted', label: t('users.blacklisted'), value: String(summary.blacklisted || 0), icon: 'solar:shield-cross-bold', tone: 'red' },
    { key: 'trusted', label: t('users.trusted'), value: String(summary.trusted || 0), icon: 'solar:verified-check-bold', tone: 'blue' },
    { key: 'verified', label: t('users.verified'), value: String(summary.verified || 0), icon: 'solar:check-circle-bold', tone: 'amber' },
  ];
});

const canGoPrev = computed(() => offset.value > 0);
const currentPage = computed(() => Math.floor(offset.value / Math.max(1, Number(limit.value) || 30)) + 1);
const pageStart = computed(() => (users.value.length ? offset.value + 1 : 0));
const pageEnd = computed(() => offset.value + users.value.length);
const pageStatusText = computed(() =>
  t('users.pageStatus', {
    page: currentPage.value,
    start: pageStart.value,
    end: pageEnd.value,
    total: totalUsers.value,
  }),
);

function toLocalTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function verificationLabel(user) {
  if (user?.verified) return t('users.verified');
  if (user?.verificationStatus === 'pending') return t('users.pending');
  return t('app.unknown');
}

function profileStatusLabel(status) {
  const map = {
    complete: t('profile.statusComplete'),
    partial: t('profile.statusPartial'),
    'message-only': t('profile.statusMessageOnly'),
    error: t('profile.statusError'),
  };
  return map[status] || t('profile.statusUnknown');
}

function profileStatusType(status) {
  const map = {
    complete: 'success',
    partial: 'info',
    'message-only': 'warning',
    error: 'error',
  };
  return map[status] || 'default';
}

function displayName(user) {
  return user?.displayName || (user?.username ? `@${user.username}` : `${t('users.title')} ${user?.userId || ''}`.trim());
}

function initialsOf(user) {
  const seed = displayName(user).replace(/^@/, '').trim() || String(user?.userId || '?');
  return seed.slice(0, 2).toUpperCase();
}

function avatarUrlOf(user) {
  return resolveProtectedMediaUrl(user?.avatarUrl || '');
}

function renderHistoryText(item) {
  const text = String(item?.text_content || '').trim();
  if (text) return text;
  const type = String(item?.message_type || 'unknown');
  return `【${type}】`;
}

async function loadUsers(options = {}) {
  const requestedOffset = Math.max(0, Number(options.offset ?? offset.value) || 0);
  loading.value = true;
  try {
    const data = await fetchUsers({
      limit: limit.value || 30,
      offset: requestedOffset,
      force: Boolean(options.force),
    });
    users.value = data.users || [];
    offset.value = Number(data.offset ?? requestedOffset) || 0;
    hasMore.value = Boolean(data.hasMore);
    nextOffset.value = data.nextOffset ?? null;
    prevOffset.value = data.prevOffset ?? null;
    totalUsers.value = Number(data.total ?? data.summary?.total ?? users.value.length) || 0;
    userSummary.value = {
      total: Number(data.summary?.total ?? totalUsers.value) || 0,
      blacklisted: Number(data.summary?.blacklisted || 0),
      trusted: Number(data.summary?.trusted || 0),
      verified: Number(data.summary?.verified || 0),
    };
    if (workspaceUser.value?.userId) {
      const latest = users.value.find((item) => String(item.userId) === String(workspaceUser.value.userId));
      if (latest) workspaceUser.value = latest;
    }
  } catch (error) {
    message.error(error.message || t('users.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function onLimitChange(value) {
  limit.value = Math.max(1, Math.min(100, Number(value) || 30));
  offset.value = 0;
  nextOffset.value = null;
  prevOffset.value = null;
  hasMore.value = false;
}

function loadPreviousPage() {
  const fallbackOffset = Math.max(0, offset.value - (Number(limit.value) || 30));
  return loadUsers({ offset: prevOffset.value ?? fallbackOffset });
}

function loadNextPage() {
  if (nextOffset.value === null) return null;
  return loadUsers({ offset: nextOffset.value });
}

function quickReply(row) {
  replyForm.userId = String(row.userId || '');
  replyModalVisible.value = true;
}

async function openUserWorkspace(user) {
  workspaceUser.value = user;
  workspaceVisible.value = true;
  workspaceReplyText.value = '';
  await loadWorkspaceHistory(user);
}

async function loadWorkspaceHistory(user = workspaceUser.value, options = {}) {
  const userId = String(user?.userId || '').trim();
  if (!userId) return;

  workspaceLoading.value = true;
  try {
    const data = await fetchHistory({
      userId,
      limit: 30,
    }, {
      force: Boolean(options.force),
    });
    const items = Array.isArray(data.items) ? data.items : [];
    workspaceHistory.value = [...items].sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
  } catch (error) {
    message.error(error.message || t('users.historyLoadFailed'));
  } finally {
    workspaceLoading.value = false;
  }
}

async function handleUserAction(user, action) {
  const userId = String(user.userId || '');
  if (!userId) return;

  actionLoading[userId] = action;
  try {
    const payload = {
      action,
      userId,
    };

    if (action === 'ban') {
      payload.reason = t('users.defaultBanReason');
    }

    if (action === 'trust') {
      payload.note = t('users.defaultTrustNote');
    }

    await updateUserAction(payload);

    const successMap = {
      ban: t('users.banSuccess'),
      unban: t('users.unbanSuccess'),
      trust: t('users.trustSuccess'),
      untrust: t('users.untrustSuccess'),
      restart: t('users.restartSuccess'),
      delete: t('users.deleteSuccess'),
    };

    message.success(successMap[action] || t('users.actionSuccess'));
    await loadUsers({ force: true });
    if (action === 'delete' && workspaceUser.value && String(workspaceUser.value.userId) === userId) {
      workspaceVisible.value = false;
      workspaceUser.value = null;
      workspaceHistory.value = [];
    }
  } catch (error) {
    message.error(error.message || t('users.actionFailed'));
  } finally {
    delete actionLoading[userId];
  }
}

async function confirmDeleteUser(user) {
  const userId = String(user?.userId || '').trim();
  if (!userId) return;
  const ok = window.confirm(t('users.deleteConfirm', { userId }));
  if (!ok) return;
  await handleUserAction(user, 'delete');
}

async function sendToUser() {
  if (!replyForm.userId || !replyForm.text) {
    message.warning(t('users.fillRequired'));
    return;
  }

  sending.value = true;
  try {
    await sendReply({
      userId: replyForm.userId,
      text: replyForm.text,
    });
    message.success(t('users.sendSuccess'));
    replyModalVisible.value = false;
    replyForm.text = '';
  } catch (error) {
    message.error(error.message || t('users.sendFailed'));
  } finally {
    sending.value = false;
  }
}

async function sendWorkspaceReply() {
  const userId = String(workspaceUser.value?.userId || '').trim();
  const text = workspaceReplyText.value.trim();
  if (!userId || !text) {
    message.warning(t('users.fillRequired'));
    return;
  }

  workspaceSending.value = true;
  try {
    await sendReply({ userId, text });
    message.success(t('users.sendSuccess'));
    workspaceReplyText.value = '';
    await Promise.all([loadWorkspaceHistory(workspaceUser.value, { force: true }), loadUsers({ force: true })]);
  } catch (error) {
    message.error(error.message || t('users.sendFailed'));
  } finally {
    workspaceSending.value = false;
  }
}

onMounted(loadUsers);
</script>

<style scoped>
.users-summary {
  margin-top: -2px;
}

.panel-split {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
  align-items: start;
}

.status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.users-reply-modal__hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--text-secondary);
  word-break: break-word;
}

.users-reply-modal :deep(.n-card__content) {
  padding-top: 12px;
}

.user-workspace {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 100%;
}

.workspace-profile {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  padding: 14px;
  border-radius: 18px;
  background: var(--panel-strong);
  border: 1px solid var(--panel-border-strong);
}

.workspace-avatar {
  width: 58px;
  height: 58px;
}

.workspace-profile h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 20px;
  line-height: 1.2;
  word-break: break-word;
}

.workspace-profile p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  word-break: break-word;
}

.workspace-tags,
.workspace-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.workspace-tags {
  margin-top: 10px;
}

.workspace-actions {
  padding: 12px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--panel-strong) 78%, transparent);
  border: 1px solid var(--panel-border-strong);
}

.workspace-section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.workspace-section-head strong {
  display: block;
  color: var(--text-primary);
  font-size: 15px;
}

.workspace-section-head span,
.workspace-loading {
  color: var(--text-secondary);
  font-size: 13px;
}

.workspace-chat {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: min(48vh, 520px);
  overflow-y: auto;
  padding-right: 4px;
}

.workspace-chat::-webkit-scrollbar {
  width: 6px;
}

.workspace-chat::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(92, 139, 255, 0.4);
}

.workspace-bubble {
  max-width: 88%;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--panel-border-strong);
}

.workspace-bubble--user {
  align-self: flex-start;
  background: rgba(92, 139, 255, 0.12);
}

.workspace-bubble--admin {
  align-self: flex-end;
  background: rgba(55, 224, 184, 0.12);
}

.workspace-bubble__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  color: var(--text-secondary);
  font-size: 12px;
}

.workspace-bubble__head span:first-child {
  font-weight: 700;
}

.workspace-bubble__body {
  margin-top: 8px;
  color: var(--text-primary);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.workspace-reply {
  display: grid;
  gap: 10px;
  margin-top: auto;
  padding-top: 4px;
}

@media (max-width: 640px) {
  .status-row :deep(.n-tag) {
    max-width: 100%;
  }

  .workspace-profile {
    grid-template-columns: 1fr;
  }

  .workspace-bubble {
    max-width: 100%;
  }
}
</style>
