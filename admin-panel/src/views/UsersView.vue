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
          <n-input-number v-model:value="limit" :min="1" :max="100" />
          <n-button type="primary" :loading="loading" @click="loadUsers">{{ t('users.refresh') }}</n-button>
          <n-tag round>{{ t('users.total', { count: users.length }) }}</n-tag>
        </div>
      </div>
    </n-card>

    <n-grid class="users-summary" :cols="24" x-gap="12 s:16 m:18" y-gap="12 s:16 m:18" responsive="screen" item-responsive>
      <n-gi v-for="card in summaryCards" :key="card.key" span="24 s:12 m:6">
        <n-card class="glass-card users-stat-card" :bordered="false">
          <div class="users-stat-card__label">{{ card.label }}</div>
          <div class="users-stat-card__value">{{ card.value }}</div>
        </n-card>
      </n-gi>
    </n-grid>

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

      <n-card class="glass-card users-reply-card" :bordered="false">
        <div class="panel-heading compact">
          <div>
            <h3>{{ t('users.quickReply') }}</h3>
            <p>{{ t('users.desc') }}</p>
          </div>
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
      </n-card>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { NButton, NCard, NEmpty, NForm, NFormItem, NInput, NInputNumber, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchUsers, resolveProtectedMediaUrl, sendReply, updateUserAction } from '../services/api';

const message = useMessage();
const { t } = useI18n();
const loading = ref(false);
const sending = ref(false);
const limit = ref(30);
const users = ref([]);
const actionLoading = reactive({});

const replyForm = reactive({
  userId: '',
  text: '',
});

const summaryCards = computed(() => {
  const list = users.value || [];
  const blacklisted = list.filter((item) => item.blacklisted).length;
  const trusted = list.filter((item) => item.trusted).length;
  const verified = list.filter((item) => item.verified).length;

  return [
    { key: 'total', label: t('users.title'), value: String(list.length) },
    { key: 'blacklisted', label: t('users.blacklisted'), value: String(blacklisted) },
    { key: 'trusted', label: t('users.trusted'), value: String(trusted) },
    { key: 'verified', label: t('users.verified'), value: String(verified) },
  ];
});

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

async function loadUsers() {
  loading.value = true;
  try {
    const data = await fetchUsers(limit.value || 30);
    users.value = data.users || [];
  } catch (error) {
    message.error(error.message || t('users.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function quickReply(row) {
  replyForm.userId = String(row.userId || '');
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
    };

    message.success(successMap[action] || t('users.actionSuccess'));
    await loadUsers();
  } catch (error) {
    message.error(error.message || t('users.actionFailed'));
  } finally {
    delete actionLoading[userId];
  }
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
    replyForm.text = '';
  } catch (error) {
    message.error(error.message || t('users.sendFailed'));
  } finally {
    sending.value = false;
  }
}

onMounted(loadUsers);
</script>

<style scoped>
.users-summary {
  margin-top: -2px;
}

.users-stat-card {
  position: relative;
  overflow: hidden;
}

.users-stat-card::before {
  content: '';
  position: absolute;
  inset: 0 auto auto 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
}

.users-stat-card__label {
  font-size: 13px;
  color: var(--text-secondary);
}

.users-stat-card__value {
  margin-top: 10px;
  font-size: clamp(26px, 4.2vw, 34px);
  line-height: 1.1;
  font-weight: 800;
  color: var(--text-primary);
}

.panel-split {
  display: grid;
  grid-template-columns: minmax(0, 1.75fr) minmax(320px, 1fr);
  gap: 18px;
  align-items: start;
}

.users-reply-card {
  position: sticky;
  top: 10px;
}

.status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

@media (max-width: 1180px) {
  .panel-split {
    grid-template-columns: 1fr;
  }

  .users-reply-card {
    position: static;
  }
}

@media (max-width: 640px) {
  .users-stat-card__value {
    font-size: clamp(22px, 8vw, 30px);
  }

  .status-row :deep(.n-tag) {
    max-width: 100%;
  }
}
</style>
