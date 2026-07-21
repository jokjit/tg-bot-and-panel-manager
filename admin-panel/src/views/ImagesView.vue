<template>
  <div class="page-stack">
    <n-card class="glass-card hero-strip" :bordered="false">
      <div class="panel-heading">
        <div>
          <div class="panel-kicker">{{ t('images.title') }}</div>
          <h2>{{ t('images.panelTitle') }}</h2>
          <p>{{ t('images.desc') }}</p>
        </div>
        <div class="panel-toolbar">
          <n-tag round type="info">{{ t('images.total', { count: total }) }}</n-tag>
          <n-tag round type="success">{{ t('images.usage', { size: formatBytes(pageBytes) }) }}</n-tag>
          <n-button secondary :loading="loading" @click="load(true)">
            <template #icon><Icon icon="solar:refresh-linear" /></template>
            {{ t('app.reload') }}
          </n-button>
        </div>
      </div>
    </n-card>

    <n-card class="glass-card upload-panel" :bordered="false">
      <div class="section-heading">
        <div>
          <h3>{{ t('images.uploadTitle') }}</h3>
          <p>{{ t('images.uploadRules') }}</p>
        </div>
        <n-tag v-if="uploading" round type="warning">
          {{ t('images.uploading', { count: uploadRemaining }) }}
        </n-tag>
      </div>

      <input
        ref="fileInput"
        class="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        @change="onFileInput"
      />
      <button
        type="button"
        class="drop-zone"
        :class="{ 'drop-zone--active': dragActive, 'drop-zone--busy': uploading }"
        :disabled="uploading"
        @click="fileInput?.click()"
        @dragenter.prevent="dragActive = true"
        @dragover.prevent="dragActive = true"
        @dragleave.prevent="dragActive = false"
        @drop.prevent="onDrop"
      >
        <span class="drop-zone__icon"><Icon icon="solar:gallery-add-bold-duotone" width="34" /></span>
        <strong>{{ t('images.uploadHint') }}</strong>
        <span>{{ t('images.chooseFiles') }}</span>
      </button>
    </n-card>

    <n-card class="glass-card library-panel" :bordered="false">
      <div class="section-heading">
        <div>
          <h3>{{ t('images.library') }}</h3>
          <p>{{ t('images.page', { page: currentPage }) }}</p>
        </div>
      </div>

      <n-spin :show="loading">
        <div v-if="images.length" class="image-grid">
          <article v-for="image in images" :key="image.id" class="image-tile">
            <a class="image-preview" :href="image.url" target="_blank" rel="noopener noreferrer">
              <img :src="image.url" :alt="image.originalName" loading="lazy" />
              <span class="image-preview__open" :title="t('images.openImage')">
                <Icon icon="solar:maximize-square-3-linear" width="20" />
              </span>
            </a>
            <div class="image-info">
              <div class="image-name" :title="image.originalName">{{ image.originalName }}</div>
              <div class="image-meta">
                <span>{{ formatBytes(image.sizeBytes) }}</span>
                <span>{{ formatTime(image.createdAt) }}</span>
              </div>
              <div class="image-actions">
                <n-button size="small" secondary @click="copyUrl(image.url)">
                  <template #icon><Icon icon="solar:copy-linear" /></template>
                  {{ t('images.copyUrl') }}
                </n-button>
                <n-popconfirm
                  :positive-text="t('images.delete')"
                  :negative-text="t('images.cancel')"
                  @positive-click="remove(image)"
                >
                  <template #trigger>
                    <n-button size="small" tertiary type="error" :loading="deletingId === image.id">
                      <template #icon><Icon icon="solar:trash-bin-trash-linear" /></template>
                      {{ t('images.delete') }}
                    </n-button>
                  </template>
                  {{ t('images.deleteConfirm', { name: image.originalName }) }}
                </n-popconfirm>
              </div>
            </div>
          </article>
        </div>
        <n-empty v-else-if="!loading" :description="t('images.empty')" class="image-empty" />
      </n-spin>

      <div v-if="total > limit" class="pagination-bar">
        <n-button secondary :disabled="offset <= 0 || loading" @click="goPrevious">
          <template #icon><Icon icon="solar:arrow-left-linear" /></template>
          {{ t('images.previous') }}
        </n-button>
        <span>{{ t('images.page', { page: currentPage }) }}</span>
        <n-button secondary :disabled="!hasMore || loading" @click="goNext">
          {{ t('images.next') }}
          <template #icon><Icon icon="solar:arrow-right-linear" /></template>
        </n-button>
      </div>
    </n-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { NButton, NCard, NEmpty, NPopconfirm, NSpin, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { deleteImage, fetchImages, uploadImage } from '../services/api';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const limit = 24;

const { t } = useI18n();
const message = useMessage();
const fileInput = ref(null);
const images = ref([]);
const total = ref(0);
const offset = ref(0);
const hasMore = ref(false);
const loading = ref(false);
const uploading = ref(false);
const uploadRemaining = ref(0);
const deletingId = ref('');
const dragActive = ref(false);

const currentPage = computed(() => Math.floor(offset.value / limit) + 1);
const pageBytes = computed(() => images.value.reduce((sum, image) => sum + Number(image.sizeBytes || 0), 0));

function formatBytes(value) {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

async function load(force = false) {
  loading.value = true;
  try {
    const data = await fetchImages({ limit, offset: offset.value, force });
    images.value = Array.isArray(data.images) ? data.images : [];
    total.value = Number(data.total || 0);
    hasMore.value = Boolean(data.hasMore);
  } catch (error) {
    message.error(error.message || t('images.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function validateFile(file) {
  if (!ACCEPTED_TYPES.has(String(file?.type || '').toLowerCase())) {
    message.warning(t('images.invalidType'));
    return false;
  }
  if (Number(file?.size || 0) > MAX_IMAGE_BYTES) {
    message.warning(t('images.tooLarge'));
    return false;
  }
  return true;
}

async function uploadFiles(fileList) {
  const files = [...fileList].filter(validateFile);
  if (!files.length || uploading.value) return;
  uploading.value = true;
  uploadRemaining.value = files.length;
  let uploaded = 0;
  for (const file of files) {
    try {
      await uploadImage(file);
      uploaded += 1;
    } catch (error) {
      message.error(`${file.name}: ${error.message || t('images.uploadFailed')}`);
    } finally {
      uploadRemaining.value -= 1;
    }
  }
  uploading.value = false;
  if (fileInput.value) fileInput.value.value = '';
  if (uploaded > 0) {
    message.success(t('images.uploadSuccess'));
    offset.value = 0;
    await load(true);
  }
}

function onFileInput(event) {
  uploadFiles(event.target.files || []);
}

function onDrop(event) {
  dragActive.value = false;
  uploadFiles(event.dataTransfer?.files || []);
}

async function copyUrl(url) {
  try {
    await navigator.clipboard.writeText(String(url || ''));
    message.success(t('images.copied'));
  } catch {
    message.error(t('images.copyFailed'));
  }
}

async function remove(image) {
  deletingId.value = image.id;
  try {
    await deleteImage(image.id);
    message.success(t('images.deleteSuccess'));
    if (images.value.length === 1 && offset.value > 0) {
      offset.value = Math.max(0, offset.value - limit);
    }
    await load(true);
  } catch (error) {
    message.error(error.message || t('images.deleteFailed'));
  } finally {
    deletingId.value = '';
  }
}

function goPrevious() {
  offset.value = Math.max(0, offset.value - limit);
  load();
}

function goNext() {
  if (!hasMore.value) return;
  offset.value += limit;
  load();
}

onMounted(() => load());
</script>

<style scoped>
.upload-panel,
.library-panel {
  overflow: hidden;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.section-heading h3,
.section-heading p {
  margin: 0;
}

.section-heading h3 {
  color: var(--text-primary);
  font-size: 17px;
}

.section-heading p {
  margin-top: 5px;
  color: var(--text-secondary);
  font-size: 13px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.drop-zone {
  width: 100%;
  min-height: 176px;
  border: 1px dashed var(--panel-border-strong);
  border-radius: 18px;
  background: var(--message-bg);
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: border-color var(--motion-fast) ease, background var(--motion-fast) ease, transform var(--motion-fast) ease;
}

.drop-zone:hover,
.drop-zone--active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--message-bg));
  transform: translateY(-1px);
}

.drop-zone--busy {
  cursor: wait;
  opacity: 0.7;
}

.drop-zone__icon {
  color: var(--accent);
}

.drop-zone strong {
  color: var(--text-primary);
  font-size: 15px;
}

.drop-zone span:last-child {
  font-size: 13px;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.image-tile {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: var(--panel-strong);
  box-shadow: var(--card-shadow);
}

.image-preview {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--message-bg);
}

.image-preview img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  transition: transform var(--motion-mid) ease;
}

.image-preview:hover img {
  transform: scale(1.035);
}

.image-preview__open {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: rgba(14, 23, 40, 0.72);
  backdrop-filter: blur(8px);
}

.image-info {
  padding: 14px;
}

.image-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  font-weight: 700;
}

.image-meta {
  min-height: 38px;
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 4px 10px;
  color: var(--text-muted);
  font-size: 12px;
}

.image-actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
}

.image-empty {
  padding: 54px 0;
}

.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-top: 20px;
  color: var(--text-secondary);
  font-size: 13px;
}

@media (max-width: 680px) {
  .image-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .image-actions {
    flex-direction: column;
  }

  .image-actions :deep(.n-button) {
    width: 100%;
  }
}

@media (max-width: 440px) {
  .image-grid {
    grid-template-columns: 1fr;
  }

  .section-heading {
    flex-direction: column;
  }
}
</style>
