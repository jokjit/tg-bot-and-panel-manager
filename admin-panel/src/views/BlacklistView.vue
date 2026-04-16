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
          <n-input-number v-model:value="limit" :min="1" :max="100" />
          <n-button type="primary" :loading="loading" @click="loadList">{{ t('blacklist.refresh') }}</n-button>
          <n-tag round>{{ t('blacklist.total', { count: blacklist.length }) }}</n-tag>
        </div>
      </div>
    </n-card>

    <div class="panel-split">
      <n-card class="glass-card" :bordered="false">
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

      <n-card class="glass-card" :bordered="false">
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
import { onMounted, reactive, ref } from 'vue';
import { NButton, NCard, NEmpty, NForm, NFormItem, NInput, NInputNumber, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { fetchBlacklist, resolveProtectedMediaUrl, updateBlacklist } from '../services/api';

const message = useMessage();
const { t } = useI18n();
const loading = ref(false);
const saving = ref(false);
const limit = ref(50);
const blacklist = ref([]);

const form = reactive({
  userId: '',
  reason: t('blacklist.defaultReason'),
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
  return item?.displayName || (item?.username ? `@${item.username}` : `${t('blacklist.title')} ${item?.userId || ''}`.trim());
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
    const data = await fetchBlacklist(limit.value || 50);
    blacklist.value = data.blacklist || [];
  } catch (error) {
    message.error(error.message || t('blacklist.loadFailed'));
  } finally {
    loading.value = false;
  }
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
    await loadList();
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
    await loadList();
  } catch (error) {
    message.error(error.message || t('blacklist.removeFailed'));
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
