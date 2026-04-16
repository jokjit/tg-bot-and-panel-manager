<template>
  <div class="auth-shell">
    <n-card class="glass-card auth-card" :bordered="false">
      <div class="auth-header">
        <div class="logo-badge">
          <Icon icon="solar:shield-keyhole-bold" width="24" />
        </div>
        <div>
          <div class="panel-kicker">{{ t('auth.title') }}</div>
          <h1>{{ t('app.title') }}</h1>
          <p>{{ t('auth.subtitle') }}</p>
        </div>
      </div>

      <div class="auth-info-row">
        <div class="info-chip">
          <span>{{ t('auth.username') }}</span>
          <strong>{{ t('auth.defaultAdmin') }}</strong>
        </div>
        <div class="info-chip" v-if="adminStore.passwordMode === 'bootstrap' && adminStore.bootstrapExpiresAt">
          <span>{{ t('auth.passwordModeBootstrap') }}</span>
          <strong>{{ formatTime(adminStore.bootstrapExpiresAt) }}</strong>
        </div>
      </div>

      <n-alert v-if="!adminStore.passwordReady" type="warning" :show-icon="false" class="auth-alert">
        {{ t('auth.passwordNotReady') }}
      </n-alert>
      <n-alert
        v-else-if="adminStore.passwordMode === 'bootstrap' && adminStore.bootstrapExpiresAt"
        type="info"
        :show-icon="false"
        class="auth-alert"
      >
        {{ t('auth.bootstrapHint', { time: formatTime(adminStore.bootstrapExpiresAt) }) }}
      </n-alert>

      <n-form class="auth-form" @submit.prevent="handleLogin">
        <n-form-item :label="t('auth.password')">
          <n-input
            v-model:value="password"
            type="password"
            show-password-on="click"
            :placeholder="t('auth.passwordPlaceholder')"
            :disabled="!adminStore.passwordReady"
          />
        </n-form-item>

        <n-button type="primary" size="large" block :loading="loading" :disabled="!adminStore.passwordReady" @click="handleLogin">
          {{ t('auth.login') }}
        </n-button>
      </n-form>
    </n-card>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { NAlert, NButton, NCard, NForm, NFormItem, NInput, useMessage } from 'naive-ui';
import { Icon } from '@iconify/vue';
import { useI18n } from 'vue-i18n';
import { loginWithPassword } from '../services/api';
import { adminStore, setAuthState } from '../stores/admin';

const router = useRouter();
const message = useMessage();
const { t } = useI18n();
const loading = ref(false);
const password = ref('');

function formatTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

async function handleLogin() {
  if (!password.value.trim()) return;

  loading.value = true;
  try {
    const data = await loginWithPassword(password.value);
    setAuthState(data);
    password.value = '';
    message.success(t('auth.loginSuccess'));
    router.replace(data.mustChangePassword ? '/password-reset' : '/dashboard');
  } catch (error) {
    message.error(error.message || t('auth.loginFailed'));
  } finally {
    loading.value = false;
  }
}
</script>
