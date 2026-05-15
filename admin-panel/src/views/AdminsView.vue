<template>
  <div class="page-stack">
    <n-card class="glass-card hero-strip" :bordered="false">
      <div class="panel-heading">
        <div>
          <div class="panel-kicker">{{ t('admins.title') }}</div>
          <h2>{{ t('admins.listTitle') }}</h2>
          <p>{{ t('admins.desc') }}</p>
        </div>
        <div class="panel-toolbar">
          <div class="toolbar-chip">{{ t('app.limit') }}</div>
          <n-input-number v-model:value="limit" :min="1" :max="100" />
          <n-button type="primary" :loading="loading" @click="loadAdmins">{{ t('admins.refresh') }}</n-button>
          <n-tag round>{{ t('admins.total', { count: admins.length }) }}</n-tag>
        </div>
      </div>
    </n-card>

    <n-grid class="admins-summary" :cols="24" x-gap="12 s:16 m:18" y-gap="12 s:16 m:18" responsive="screen" item-responsive>
      <n-gi v-for="card in summaryCards" :key="card.key" span="24 s:12 m:6">
        <n-card class="glass-card admins-stat-card" :bordered="false">
          <div class="admins-stat-card__label">{{ card.label }}</div>
          <div class="admins-stat-card__value">{{ card.value }}</div>
        </n-card>
      </n-gi>
    </n-grid>

    <div class="panel-split">
      <n-card class="glass-card admins-list-card" :bordered="false">
        <div class="panel-heading compact">
          <div>
            <h3>{{ t('admins.title') }}</h3>
            <p>{{ t('admins.desc') }}</p>
          </div>
        </div>

        <div v-if="admins.length" class="entity-grid">
          <article v-for="item in admins" :key="`${item.userId}-${item.source || 'manual'}`" class="entity-card">
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
                <n-button
                  round
                  size="small"
                  :type="item.source === 'root-env' ? 'default' : 'warning'"
                  :disabled="item.source === 'root-env'"
                  @click="removeAdmin(item)"
                >
                  {{ item.source === 'root-env' ? t('admins.rootAdmin') : t('admins.remove') }}
                </n-button>
              </div>
            </div>

            <div class="entity-meta entity-meta--3">
              <div class="entity-meta-item">
                <span>{{ t('admins.source') }}</span>
                <strong>{{ item.source || t('app.unknown') }}</strong>
              </div>
              <div class="entity-meta-item">
                <span>{{ t('admins.createdAt') }}</span>
                <strong>{{ toLocalTime(item.createdAt) }}</strong>
              </div>
              <div class="entity-meta-item">
                <span>{{ t('profile.recentStatus') }}</span>
                <strong>{{ profileStatusLabel(item.profileStatus) }}</strong>
              </div>
            </div>

            <div class="entity-message">
              <span>{{ t('admins.note') }}</span>
              <p>{{ item.note || t('app.noData') }}</p>
            </div>

            <details class="entity-details">
              <summary>{{ t('profile.details') }}</summary>
              <div class="entity-details__content">
                <div class="entity-group-grid">
                  <section class="entity-group">
                    <h4>{{ t('admins.title') }}</h4>
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
                        <dt>{{ t('admins.source') }}</dt>
                        <dd>{{ item.source || t('app.unknown') }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('admins.createdAt') }}</dt>
                        <dd>{{ toLocalTime(item.createdAt) }}</dd>
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

      <n-card class="glass-card admins-form-card" :bordered="false">
        <div class="panel-heading compact">
          <div>
            <h3>{{ t('admins.addTitle') }}</h3>
            <p>{{ t('admins.addDesc') }}</p>
          </div>
        </div>

        <n-form :model="form" label-placement="top" class="panel-form">
          <n-form-item :label="t('admins.userId')">
            <n-input v-model:value="form.userId" :placeholder="t('admins.inputUserId')" />
          </n-form-item>
          <n-form-item :label="t('admins.note')">
            <n-input
              v-model:value="form.note"
              type="textarea"
              :autosize="{ minRows: 4, maxRows: 8 }"
              :placeholder="t('admins.notePlaceholder')"
            />
          </n-form-item>
          <n-button block type="primary" :loading="saving" @click="addAdmin">
            {{ t('admins.add') }}
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
import { fetchAdmins, resolveProtectedMediaUrl, updateAdmins } from '../services/api';

const message = useMessage();
const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);
const limit = ref(50);
const admins = ref([]);

const form = reactive({
  userId: '',
  note: '',
});

const summaryCards = computed(() => {
  const list = admins.value || [];
  const root = list.filter((item) => item.source === 'root-env').length;
  const group = list.filter((item) => item.source === 'group-admin').length;
  const manual = list.filter((item) => item.source === 'kv').length;
  return [
    { key: 'total', label: t('admins.title'), value: String(list.length) },
    { key: 'root', label: t('admins.rootAdmin'), value: String(root) },
    { key: 'group', label: t('admins.source'), value: t('admins.groupCount', { n: group }) },
    { key: 'manual', label: t('admins.note'), value: t('admins.kvCount', { n: manual }) },
  ];
});

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
  return item?.displayName || (item?.username ? `@${item.username}` : `${t('admins.title')} ${item?.userId || ''}`.trim());
}

function initialsOf(item) {
  const seed = displayName(item).replace(/^@/, '').trim() || String(item?.userId || '?');
  return seed.slice(0, 2).toUpperCase();
}

function avatarUrlOf(item) {
  return resolveProtectedMediaUrl(item?.avatarUrl || '');
}

async function loadAdmins() {
  loading.value = true;
  try {
    const data = await fetchAdmins(limit.value || 50);
    admins.value = data.admins || [];
  } catch (error) {
    message.error(error.message || t('admins.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function addAdmin() {
  if (!form.userId) {
    message.warning(t('admins.fillRequired'));
    return;
  }
  saving.value = true;
  try {
    await updateAdmins({
      action: 'add',
      userId: form.userId,
      note: form.note,
    });
    message.success(t('admins.addSuccess'));
    form.userId = '';
    form.note = '';
    await loadAdmins();
  } catch (error) {
    message.error(error.message || t('admins.addFailed'));
  } finally {
    saving.value = false;
  }
}

async function removeAdmin(row) {
  if (row.source === 'root-env') return;
  try {
    await updateAdmins({
      action: 'remove',
      userId: row.userId,
    });
    message.success(t('admins.removeSuccess'));
    await loadAdmins();
  } catch (error) {
    message.error(error.message || t('admins.removeFailed'));
  }
}

onMounted(loadAdmins);
</script>

<style scoped>
.admins-summary {
  margin-top: -2px;
}

.admins-stat-card {
  position: relative;
  overflow: hidden;
}

.admins-stat-card::before {
  content: '';
  position: absolute;
  inset: 0 auto auto 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
}

.admins-stat-card__label {
  font-size: 13px;
  color: var(--text-secondary);
}

.admins-stat-card__value {
  margin-top: 10px;
  font-size: clamp(24px, 4vw, 32px);
  line-height: 1.15;
  font-weight: 800;
  color: var(--text-primary);
  word-break: break-word;
}

.panel-split {
  display: grid;
  grid-template-columns: minmax(0, 1.75fr) minmax(320px, 1fr);
  gap: 18px;
  align-items: start;
}

.admins-form-card {
  position: sticky;
  top: 10px;
}

@media (max-width: 1180px) {
  .panel-split {
    grid-template-columns: 1fr;
  }

  .admins-form-card {
    position: static;
  }
}

@media (max-width: 640px) {
  .admins-stat-card__value {
    font-size: clamp(22px, 8vw, 28px);
  }
}
</style>
