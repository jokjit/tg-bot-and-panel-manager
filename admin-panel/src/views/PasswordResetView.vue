<template>
  <div class="auth-shell">
    <n-card class="glass-card auth-card" :bordered="false">
      <div class="auth-header">
        <div class="logo-badge accent-warning">
          <Icon icon="solar:lock-password-bold" width="24" />
        </div>
        <div>
          <div class="panel-kicker">{{ t('auth.forceResetTitle') }}</div>
          <h1>{{ t('auth.forceResetTitle') }}</h1>
          <p>{{ t('auth.forceResetDesc') }}</p>
        </div>
      </div>

      <n-form class="auth-form" @submit.prevent="handleSubmit">
        <n-form-item :label="t('auth.newPassword')">
          <n-input
            v-model:value="form.newPassword"
            type="password"
            show-password-on="click"
            :placeholder="t('auth.newPasswordPlaceholder')"
          />
        </n-form-item>

        <n-form-item :label="t('auth.confirmPassword')">
          <n-input
            v-model:value="form.confirmPassword"
            type="password"
            show-password-on="click"
            :placeholder="t('auth.confirmPasswordPlaceholder')"
          />
        </n-form-item>

        <n-button type="primary" size="large" block :loading="loading" @click="handleSubmit">
          {{ t('auth.submitPassword') }}
        </n-button>
      </n-form>
    </n-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NCard, NForm, NFormItem, NInput, useMessage } from 'naive-ui';
import { Icon } from '@iconify/vue';
import { useI18n } from 'vue-i18n';
import { changeAdminPassword } from '../services/api';
import { setAuthState } from '../stores/admin';

const router = useRouter();
const message = useMessage();
const { t } = useI18n();
const loading = ref(false);
const form = reactive({
  newPassword: '',
  confirmPassword: '',
});

async function handleSubmit() {
  if (form.newPassword.trim().length < 6) {
    message.warning(t('auth.passwordTooShort'));
    return;
  }

  if (form.newPassword !== form.confirmPassword) {
    message.warning(t('auth.passwordMismatch'));
    return;
  }

  loading.value = true;
  try {
    const data = await changeAdminPassword(form.newPassword);
    setAuthState(data);
    form.newPassword = '';
    form.confirmPassword = '';
    message.success(t('auth.resetSuccess'));
    router.replace('/dashboard');
  } catch (error) {
    message.error(error.message || t('auth.resetFailed'));
  } finally {
    loading.value = false;
  }
}
</script>
