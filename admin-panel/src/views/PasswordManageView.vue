<template>
  <div class="page-stack">
    <n-card class="glass-card hero-strip" :bordered="false">
      <div class="panel-heading">
        <div>
          <div class="panel-kicker">{{ t('password.title') }}</div>
          <h2>{{ t('password.panelTitle') }}</h2>
          <p>{{ t('password.desc') }}</p>
        </div>
        <div class="panel-toolbar">
          <n-tag round type="info">{{ t('password.fixedAccount', { name: 'admin' }) }}</n-tag>
        </div>
      </div>
    </n-card>

    <n-grid :cols="24" x-gap="12 s:16 m:18" y-gap="12 s:16 m:18" responsive="screen" item-responsive>
      <n-gi span="24 m:10">
        <n-card class="glass-card" :bordered="false">
          <div class="panel-heading compact">
            <div>
              <h3>{{ t('password.accountTitle') }}</h3>
              <p>{{ t('password.accountDesc') }}</p>
            </div>
          </div>

          <div class="rule-list">
            <div class="switch-tile rule-item">
              <div>
                <strong>{{ t('password.accountLabel') }}</strong>
                <span>{{ t('password.fixedAccount', { name: 'admin' }) }}</span>
              </div>
            </div>
            <div class="switch-tile rule-item">
              <div>
                <strong>{{ t('password.ruleTitle') }}</strong>
                <span>{{ t('password.ruleDesc') }}</span>
              </div>
            </div>
          </div>
        </n-card>
      </n-gi>

      <n-gi span="24 m:14">
        <n-card class="glass-card" :bordered="false">
          <div class="panel-heading compact">
            <div>
              <h3>{{ t('password.formTitle') }}</h3>
              <p>{{ t('password.formDesc') }}</p>
            </div>
          </div>

          <n-form label-placement="top" class="panel-form">
            <n-form-item :label="t('password.newPassword')">
              <n-input
                v-model:value="form.newPassword"
                type="password"
                show-password-on="click"
                :placeholder="t('password.newPasswordPlaceholder')"
              />
            </n-form-item>
            <n-form-item :label="t('password.confirmPassword')">
              <n-input
                v-model:value="form.confirmPassword"
                type="password"
                show-password-on="click"
                :placeholder="t('password.confirmPasswordPlaceholder')"
              />
            </n-form-item>
            <n-button type="primary" block :loading="saving" @click="savePassword">
              {{ t('password.save') }}
            </n-button>
          </n-form>
        </n-card>
      </n-gi>
    </n-grid>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { NButton, NCard, NForm, NFormItem, NGi, NGrid, NInput, NTag, useMessage } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { changeAdminPassword } from '../services/api';
import { setAuthState } from '../stores/admin';

const message = useMessage();
const { t } = useI18n();
const saving = ref(false);
const form = reactive({
  newPassword: '',
  confirmPassword: '',
});

async function savePassword() {
  if (form.newPassword.trim().length < 6) {
    message.warning(t('password.passwordTooShort'));
    return;
  }

  if (form.newPassword !== form.confirmPassword) {
    message.warning(t('password.passwordMismatch'));
    return;
  }

  saving.value = true;
  try {
    const data = await changeAdminPassword(form.newPassword);
    setAuthState(data);
    form.newPassword = '';
    form.confirmPassword = '';
    message.success(t('password.saveSuccess'));
  } catch (error) {
    message.error(error.message || t('password.saveFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.rule-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rule-item {
  min-height: 88px;
}
</style>
