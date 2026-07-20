<template>
  <div class="page-stack">
    <n-card class="glass-card hero-strip" :bordered="false">
      <div class="panel-heading">
        <div>
          <div class="panel-kicker">{{ t('trust.title') }}</div>
          <h2>{{ t('trust.listTitle') }}</h2>
          <p>{{ t('trust.desc') }}</p>
        </div>
        <div class="panel-toolbar">
          <div class="toolbar-chip">{{ t('app.limit') }}</div>
          <n-input-number :value="limit" :min="1" :max="100" @update:value="onLimitChange" />
          <n-button type="primary" :loading="loading" @click="loadList(true)">{{ t('trust.refresh') }}</n-button>
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

    <div class="summary-metric-grid trust-summary">
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
      <n-card class="glass-card trust-list-card" :bordered="false">
        <div class="panel-heading compact">
          <div>
            <h3>{{ t('trust.title') }}</h3>
            <p>{{ t('trust.desc') }}</p>
          </div>
        </div>

        <div v-if="trustList.length" class="entity-grid">
          <article v-for="item in trustList" :key="`${item.userId}-${item.createdAt || 'unknown'}`" class="entity-card">
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
                      <n-tag size="small" round type="success">{{ t('trust.trusted') }}</n-tag>
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
                  {{ t('trust.remove') }}
                </n-button>
              </div>
            </div>

            <div class="entity-meta entity-meta--3">
              <div class="entity-meta-item">
                <span>{{ t('trust.userId') }}</span>
                <strong>{{ item.userId }}</strong>
              </div>
              <div class="entity-meta-item">
                <span>{{ t('trust.addedAt') }}</span>
                <strong>{{ toLocalTime(item.createdAt) }}</strong>
              </div>
              <div class="entity-meta-item">
                <span>{{ t('profile.recentStatus') }}</span>
                <strong>{{ profileStatusLabel(item.profileStatus) }}</strong>
              </div>
            </div>

            <div class="entity-message">
              <span>{{ t('trust.note') }}</span>
              <p>{{ item.note || t('app.noData') }}</p>
            </div>

            <details class="entity-details">
              <summary>{{ t('profile.details') }}</summary>
              <div class="entity-details__content">
                <div class="entity-group-grid">
                  <section class="entity-group">
                    <h4>{{ t('trust.title') }}</h4>
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
                        <dt>{{ t('trust.addedAt') }}</dt>
                        <dd>{{ toLocalTime(item.createdAt) }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('trust.note') }}</dt>
                        <dd>{{ item.note || t('app.noData') }}</dd>
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

      <n-card class="glass-card trust-form-card" :bordered="false">
        <div class="panel-heading compact">
          <div>
            <h3>{{ t('trust.addTitle') }}</h3>
            <p>{{ t('trust.addDesc') }}</p>
          </div>
        </div>

        <n-form :model="form" label-placement="top" class="panel-form">
          <n-form-item :label="t('trust.userId')">
            <n-input v-model:value="form.userId" :placeholder="t('trust.inputUserId')" />
          </n-form-item>
          <n-form-item :label="t('trust.note')">
            <n-input
              v-model:value="form.note"
              type="textarea"
              :autosize="{ minRows: 4, maxRows: 8 }"
              :placeholder="t('trust.notePlaceholder')"
            />
          </n-form-item>
          <n-button block type="primary" :loading="saving" @click="addTrust">
            {{ t('trust.add') }}
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
import { fetchTrust, resolveProtectedMediaUrl, updateTrust } from '../services/api';

const message = useMessage();
const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);
const limit = ref(50);
const trustList = ref([]);
const offset = ref(0);
const hasMore = ref(false);
const nextOffset = ref(null);
const prevOffset = ref(null);
const totalItems = ref(0);

const form = reactive({
  userId: '',
  note: '',
});

const summaryCards = computed(() => {
  const list = trustList.value || [];
  const withNote = list.filter((item) => String(item.note || '').trim()).length;
  const withAvatar = list.filter((item) => item.hasAvatar).length;
  return [
    { key: 'total', label: t('trust.title'), value: String(totalItems.value), icon: 'solar:verified-check-bold', tone: 'green' },
    { key: 'notes', label: t('trust.note'), value: String(withNote), icon: 'solar:notes-bold', tone: 'amber' },
    { key: 'avatar', label: t('profile.avatar'), value: `${withAvatar}/${list.length || 0}`, icon: 'solar:user-circle-bold', tone: 'blue' },
    { key: 'latest', label: t('trust.addedAt'), value: list[0]?.createdAt ? toLocalTime(list[0].createdAt) : '-', icon: 'solar:clock-circle-bold', tone: 'orange' },
  ];
});

const canGoPrev = computed(() => offset.value > 0);
const currentPage = computed(() => Math.floor(offset.value / Math.max(1, Number(limit.value) || 50)) + 1);
const pageStart = computed(() => (trustList.value.length ? offset.value + 1 : 0));
const pageEnd = computed(() => offset.value + trustList.value.length);
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
  return item?.displayName || (item?.username ? `@${item.username}` : `${t('trust.title')} ${item?.userId || ''}`.trim());
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
    const data = await fetchTrust({
      limit: limit.value || 50,
      offset: Math.max(0, Number(requestedOffset) || 0),
      force,
    });
    trustList.value = data.trust || [];
    offset.value = Number(data.offset ?? requestedOffset) || 0;
    hasMore.value = Boolean(data.hasMore);
    nextOffset.value = data.nextOffset ?? null;
    prevOffset.value = data.prevOffset ?? null;
    totalItems.value = Number(data.total ?? trustList.value.length) || 0;
  } catch (error) {
    message.error(error.message || t('trust.loadFailed'));
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

async function addTrust() {
  if (!form.userId) {
    message.warning(t('trust.fillRequired'));
    return;
  }
  saving.value = true;
  try {
    await updateTrust({
      action: 'add',
      userId: form.userId,
      note: form.note || t('trust.defaultNote'),
    });
    message.success(t('trust.addSuccess'));
    form.userId = '';
    form.note = '';
    await loadList(true);
  } catch (error) {
    message.error(error.message || t('trust.addFailed'));
  } finally {
    saving.value = false;
  }
}

async function removeItem(row) {
  try {
    await updateTrust({
      action: 'remove',
      userId: row.userId,
    });
    message.success(t('trust.removeSuccess'));
    await loadList(true);
    if (!trustList.value.length && offset.value > 0) await loadPreviousPage();
  } catch (error) {
    message.error(error.message || t('trust.removeFailed'));
  }
}

onMounted(() => loadList(false));
</script>

<style scoped>
.trust-summary {
  margin-top: -2px;
}

.panel-split {
  display: grid;
  grid-template-columns: minmax(0, 1.75fr) minmax(320px, 1fr);
  gap: 18px;
  align-items: start;
}

.trust-form-card {
  position: sticky;
  top: 10px;
}

@media (max-width: 1180px) {
  .panel-split {
    grid-template-columns: 1fr;
  }

  .trust-form-card {
    position: static;
  }
}

</style>
