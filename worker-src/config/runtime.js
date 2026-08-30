export const RUNTIME_CONFIG_KEYS = [
  'VERIFY_EXPIRE_MS',
  'VERIFY_FAIL_BLOCK_MS',
  'VERIFY_TIMEOUT_BLOCK_MS',
  'VERIFY_MAX_FAILURES',
  'VERIFY_MATH_ENABLED',
  'VERIFY_CAPTCHA_ENABLED',
  'VERIFY_WEB_SESSION_EXPIRE_MS',
  'VERIFY_RETRY_BLOCK_MS',
  'VERIFY_STAGE_MAX_ATTEMPTS',
  'VERIFY_MIN_SLIDER_TIME_MS',
  'VERIFY_SLIDER_TOLERANCE',
  'VERIFY_ROTATION_TOLERANCE',
  'VERIFY_PROOF_SECRET',
  'VERIFY_OBSERVE_MESSAGE_COUNT',
  'VERIFY_FAIL_TOPIC_ID',
  'BOT_TOKEN',
  'ADMIN_CHAT_ID',
  'ADMIN_IDS',
  'ADMIN_ID',
  'WEBHOOK_SECRET',
  'PUBLIC_BASE_URL',
  'VERIFY_PUBLIC_BASE_URL',
  'WEBHOOK_PATH',
  'TOPIC_MODE',
  'USER_VERIFICATION',
  'ADMIN_META_MODE',
  'WELCOME_TYPE',
  'WELCOME_MEDIA',
  'WELCOME_TEXT',
  'BOT_DESCRIPTION',
  'BOT_SHORT_DESCRIPTION',
  'BOT_DESCRIPTION_DEFAULT',
  'BOT_SHORT_DESCRIPTION_DEFAULT',
  'BOT_DESCRIPTION_ZH_CN',
  'BOT_SHORT_DESCRIPTION_ZH_CN',
  'BOT_DESCRIPTION_EN_US',
  'BOT_SHORT_DESCRIPTION_EN_US',
  'BLOCKED_TEXT',
  'DATA_RETENTION_DAYS',
  'DATA_CLEANUP_BATCH_SIZE',
  'DATA_CLEANUP_AUTO',
  'DELETED_ACCOUNT_SWEEP_AUTO',
  'DELETED_ACCOUNT_SWEEP_BATCH_SIZE',
  'ADMIN_API_KEY',
  'ADMIN_PANEL_URL',
  'ADMIN_PANEL_USER',
  'KEYWORD_FILTERS',
];

function readTrimmedString(source, key) {
  const value = source?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function mergeRuntimeEnv(env = {}, systemConfig = {}) {
  const runtime = { ...env };
  for (const key of RUNTIME_CONFIG_KEYS) {
    const value = readTrimmedString(systemConfig, key);
    if (value) runtime[key] = value;
  }

  if (!readTrimmedString(runtime, 'BOT_DESCRIPTION')) {
    runtime.BOT_DESCRIPTION = [
      readTrimmedString(systemConfig, 'BOT_DESCRIPTION_DEFAULT'),
      readTrimmedString(systemConfig, 'BOT_DESCRIPTION_ZH_CN'),
      readTrimmedString(systemConfig, 'BOT_DESCRIPTION_EN_US'),
    ].find(Boolean) || '';
  }
  if (!readTrimmedString(runtime, 'BOT_SHORT_DESCRIPTION')) {
    runtime.BOT_SHORT_DESCRIPTION = [
      readTrimmedString(systemConfig, 'BOT_SHORT_DESCRIPTION_DEFAULT'),
      readTrimmedString(systemConfig, 'BOT_SHORT_DESCRIPTION_ZH_CN'),
      readTrimmedString(systemConfig, 'BOT_SHORT_DESCRIPTION_EN_US'),
    ].find(Boolean) || '';
  }

  return runtime;
}

export function buildEffectiveSystemConfig(env = {}, config = {}) {
  const effective = { ...config };
  for (const key of RUNTIME_CONFIG_KEYS) {
    const runtimeValue = readTrimmedString(env, key);
    if (runtimeValue) effective[key] = runtimeValue;
  }
  for (const key of RUNTIME_CONFIG_KEYS) {
    const storedValue = readTrimmedString(config, key);
    if (storedValue) effective[key] = storedValue;
  }
  effective.updatedAt = config.updatedAt || null;
  return effective;
}
