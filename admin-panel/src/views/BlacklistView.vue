<template>
  <div class="page-stack">
    <n-card class="glass-card hero-strip" :bordered="false">
      <div class="panel-heading">
        <div>
          <div class="panel-kicker">{{ t('blacklist.title') }}</div>
          <h2>{{ t('blacklist.listTitle') }}</h2>
          <p>{{ t('blacklist.desc') }}</p>
        </div>
        <div class="panel-toolbar">
          <div class="toolbar-chip">{{ t('app.limit') }}</div>
          <n-input-number :value="limit" :min="1" :max="100" @update:value="onLimitChange" />
          <n-button type="primary" :loading="loading" @click="loadList(true)">{{ t('blacklist.refresh') }}</n-button>
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

    <div class="summary-metric-grid blacklist-summary">
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
      <n-card class="glass-card blacklist-list-card" :bordered="false">
        <div class="panel-heading compact">
          <div>
            <h3>{{ t('blacklist.title') }}</h3>
            <p>{{ t('blacklist.desc') }}</p>
          </div>
        </div>

        <div v-if="blacklist.length" class="entity-grid">
          <article v-for="item in blacklist" :key="`${item.userId}-${item.createdAt || 'unknown'}`" class="entity-card">
            <div class="entity-card__head entity-card__head--profile">
              <div class="entity-profile">
                <div class="entity-avatar">
                  <img v-if="avatarUrlOf(item)" :src="avatarUrlOf(item)" :alt="displayName(item)" />
                  <span v-else>{{ initialsOf(item) }}</span>
                </div>

                <div class="entity-profile__body">
                  <div class="entity-profile__main">
                    <div>
                      <h3 class="entity-card__title">{{ displayName(item) }}</h3>
                      <p class="entity-card__subtitle">#{{ item.userId }}</p>
                    </div>
                    <div class="entity-chip-list">
                      <n-tag size="small" round :type="item.hasAvatar ? 'success' : 'default'">
                        {{ item.hasAvatar ? t('profile.avatarSynced') : t('profile.avatarMissing') }}
                      </n-tag>
                      <n-tag size="small" round :type="profileStatusType(item.profileStatus)">
                        {{ profileStatusLabel(item.profileStatus) }}
                      </n-tag>
                    </div>
                  </div>

                  <div class="entity-inline-list">
                    <div class="entity-inline-item">
                      <span>{{ t('profile.username') }}</span>
                      <strong>{{ item.username ? `@${item.username}` : '-' }}</strong>
                    </div>
                    <div class="entity-inline-item">
                      <span>{{ t('profile.firstName') }}</span>
                      <strong>{{ item.firstName || '-' }}</strong>
                    </div>
                    <div class="entity-inline-item">
                      <span>{{ t('profile.lastName') }}</span>
                      <strong>{{ item.lastName || '-' }}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div class="entity-actions entity-actions--stack">
                <n-button round size="small" type="warning" @click="removeItem(item)">
                  {{ t('blacklist.unban') }}
                </n-button>
              </div>
            </div>

            <div class="entity-meta entity-meta--3">
              <div class="entity-meta-item">
                <span>{{ t('blacklist.userId') }}</span>
                <strong>{{ item.userId }}</strong>
              </div>
              <div class="entity-meta-item">
                <span>{{ t('blacklist.bannedAt') }}</span>
                <strong>{{ toLocalTime(item.createdAt) }}</strong>
              </div>
              <div class="entity-meta-item">
                <span>{{ t('profile.recentStatus') }}</span>
                <strong>{{ profileStatusLabel(item.profileStatus) }}</strong>
              </div>
            </div>

            <div class="entity-message">
              <span>{{ t('blacklist.reason') }}</span>
              <p>{{ item.reason || t('app.noData') }}</p>
            </div>

            <details class="entity-details">
              <summary>{{ t('profile.details') }}</summary>
              <div class="entity-details__content">
                <div class="entity-group-grid">
                  <section class="entity-group">
                    <h4>{{ t('blacklist.title') }}</h4>
                    <dl>
                      <div>
                        <dt>{{ t('profile.userId') }}</dt>
                        <dd>#{{ item.userId }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('profile.username') }}</dt>
                        <dd>{{ item.username ? `@${item.username}` : '-' }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('profile.firstName') }}</dt>
                        <dd>{{ item.firstName || '-' }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('profile.lastName') }}</dt>
                        <dd>{{ item.lastName || '-' }}</dd>
                      </div>
                    </dl>
                  </section>

                  <section class="entity-group">
                    <h4>{{ t('profile.recentStatus') }}</h4>
                    <dl>
                      <div>
                        <dt>{{ t('profile.profileStatus') }}</dt>
                        <dd>{{ profileStatusLabel(item.profileStatus) }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('profile.avatar') }}</dt>
                        <dd>{{ item.hasAvatar ? t('profile.avatarSynced') : t('profile.avatarMissing') }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('blacklist.bannedAt') }}</dt>
                        <dd>{{ toLocalTime(item.createdAt) }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('blacklist.reason') }}</dt>
                        <dd>{{ item.reason || t('app.noData') }}</dd>
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

      <n-card class="glass-card blacklist-form-card" :bordered="false">
        <div class="panel-heading compact">
          <div>
            <h3>{{ t('blacklist.addTitle') }}</h3>
            <p>{{ t('blacklist.addDesc') }}</p>
          </div>
        </div>

        <n-form :model="form" label-placement="top" class="panel-form">
          <n-form-item :label="t('blacklist.userId')">
            <n-input v-model:value="form.userId" :placeholder="t('blacklist.inputUserId')" />
          </n-form-item>
          <n-form-item :label="t('blacklist.reason')">
            <n-input
              v-model:value="form.reason"
              type="textarea"
              :autosize="{ minRows: 4, maxRows: 8 }"
              :placeholder="t('blacklist.reasonPlaceholder')"
            />
          </n-form-item>
          <n-button block type="error" :loading="saving" @click="addBlacklist">
            {{ t('blacklist.add') }}
          </n-button>
        </n-form>
      </n-card>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { NButton, NCard, NEmpty, NForm, NFormItem, NInput, NInputNumber, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchBlacklist, resolveProtectedMediaUrl, updateBlacklist } from '../services/api';

const message = useMessage();
const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);
const limit = ref(50);
const blacklist = ref([]);
const offset = ref(0);
const hasMore = ref(false);
const nextOffset = ref(null);
const prevOffset = ref(null);
const totalItems = ref(0);

const form = reactive({
  userId: '',
  reason: t('blacklist.defaultReason'),
});

const summaryCards = computed(() => {
  const list = blacklist.value || [];
  const withReason = list.filter((item) => String(item.reason || '').trim()).length;
  const withAvatar = list.filter((item) => item.hasAvatar).length;
  return [
    { key: 'total', label: t('blacklist.title'), value: String(totalItems.value), icon: 'solar:shield-cross-bold', tone: 'red' },
    { key: 'reason', label: t('blacklist.reason'), value: String(withReason), icon: 'solar:document-text-bold', tone: 'amber' },
    { key: 'avatar', label: t('profile.avatar'), value: `${withAvatar}/${list.length || 0}`, icon: 'solar:user-circle-bold', tone: 'blue' },
    { key: 'latest', label: t('blacklist.bannedAt'), value: list[0]?.createdAt ? toLocalTime(list[0].createdAt) : '-', icon: 'solar:clock-circle-bold', tone: 'orange' },
  ];
});

const canGoPrev = computed(() => offset.value > 0);
const currentPage = computed(() => Math.floor(offset.value / Math.max(1, Number(limit.value) || 50)) + 1);
const pageStart = computed(() => (blacklist.value.length ? offset.value + 1 : 0));
const pageEnd = computed(() => offset.value + blacklist.value.length);
const pageStatusText = computed(() => t('users.pageStatus', {
  page: currentPage.value,
  start: pageStart.value,
  end: pageEnd.value,
  total: totalItems.value,
}));

function toLocalTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
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

function displayName(item) {
  return item?.displayName || (item?.username ? `@${item.username}` : `${t('blacklist.title')} ${item?.userId || ''}`.trim());
}

function initialsOf(item) {
  const seed = displayName(item).replace(/^@/, '').trim() || String(item?.userId || '?');
  return seed.slice(0, 2).toUpperCase();
}

function avatarUrlOf(item) {
  return resolveProtectedMediaUrl(item?.avatarUrl || '');
}

async function loadList(force = false, requestedOffset = offset.value) {
  loading.value = true;
  try {
    const data = await fetchBlacklist({
      limit: limit.value || 50,
      offset: Math.max(0, Number(requestedOffset) || 0),
      force,
    });
    blacklist.value = data.blacklist || [];
    offset.value = Number(data.offset ?? requestedOffset) || 0;
    hasMore.value = Boolean(data.hasMore);
    nextOffset.value = data.nextOffset ?? null;
    prevOffset.value = data.prevOffset ?? null;
    totalItems.value = Number(data.total ?? blacklist.value.length) || 0;
  } catch (error) {
    message.error(error.message || t('blacklist.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function onLimitChange(value) {
  limit.value = Math.max(1, Math.min(100, Number(value) || 50));
  offset.value = 0;
  nextOffset.value = null;
  prevOffset.value = null;
  hasMore.value = false;
}

function loadPreviousPage() {
  const fallbackOffset = Math.max(0, offset.value - (Number(limit.value) || 50));
  return loadList(false, prevOffset.value ?? fallbackOffset);
}

function loadNextPage() {
  if (nextOffset.value === null) return null;
  return loadList(false, nextOffset.value);
}

async function addBlacklist() {
  if (!form.userId) {
    message.warning(t('blacklist.fillRequired'));
    return;
  }
  saving.value = true;
  try {
    await updateBlacklist({
      action: 'add',
      userId: form.userId,
      reason: form.reason,
    });
    message.success(t('blacklist.addSuccess'));
    form.userId = '';
    form.reason = t('blacklist.defaultReason');
    await loadList(true);
  } catch (error) {
    message.error(error.message || t('blacklist.addFailed'));
  } finally {
    saving.value = false;
  }
}

async function removeItem(row) {
  try {
    await updateBlacklist({
      action: 'remove',
      userId: row.userId,
    });
    message.success(t('blacklist.removeSuccess'));
    await loadList(true);
    if (!blacklist.value.length && offset.value > 0) await loadPreviousPage();
  } catch (error) {
    message.error(error.message || t('blacklist.removeFailed'));
  }
}

onMounted(() => loadList(false));
</script>

<style scoped>
.blacklist-summary {
  margin-top: -2px;
}

.panel-split {
  display: grid;
  grid-template-columns: minmax(0, 1.75fr) minmax(320px, 1fr);
  gap: 18px;
  align-items: start;
}

.blacklist-form-card {
  position: sticky;
  top: 10px;
}

@media (max-width: 1180px) {
  .panel-split {
    grid-template-columns: 1fr;
  }

  .blacklist-form-card {
    position: static;
  }
}

</style>
