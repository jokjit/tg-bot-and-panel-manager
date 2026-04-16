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
          <n-input-number v-model:value="limit" :min="1" :max="100" />
          <n-button type="primary" :loading="loading" @click="loadList">{{ t('trust.refresh') }}</n-button>
          <n-tag round>{{ t('trust.total', { count: trustList.length }) }}</n-tag>
        </div>
      </div>
    </n-card>

    <div class="panel-split">
      <n-card class="glass-card" :bordered="false">
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

      <n-card class="glass-card" :bordered="false">
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
import { onMounted, reactive, ref } from 'vue';
import { NButton, NCard, NEmpty, NForm, NFormItem, NInput, NInputNumber, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchTrust, resolveProtectedMediaUrl, updateTrust } from '../services/api';

const message = useMessage();
const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);
const limit = ref(50);
const trustList = ref([]);

const form = reactive({
  userId: '',
  note: '',
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
  return item?.displayName || (item?.username ? `@${item.username}` : `${t('trust.title')} ${item?.userId || ''}`.trim());
}

function initialsOf(item) {
  const seed = displayName(item).replace(/^@/, '').trim() || String(item?.userId || '?');
  return seed.slice(0, 2).toUpperCase();
}

function avatarUrlOf(item) {
  return resolveProtectedMediaUrl(item?.avatarUrl || '');
}

async function loadList() {
  loading.value = true;
  try {
    const data = await fetchTrust(limit.value || 50);
    trustList.value = data.trust || [];
  } catch (error) {
    message.error(error.message || t('trust.loadFailed'));
  } finally {
    loading.value = false;
  }
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
    await loadList();
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
    await loadList();
  } catch (error) {
    message.error(error.message || t('trust.removeFailed'));
  }
}

onMounted(loadList);
</script>

<style scoped>
.panel-split {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(300px, 1fr);
  gap: 18px;
}

@media (max-width: 1180px) {
  .panel-split {
    grid-template-columns: 1fr;
  }
}
</style>
