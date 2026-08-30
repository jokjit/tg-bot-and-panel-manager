function formatErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function removePlaintextPasswords(config) {
  delete config.ADMIN_PANEL_PASSWORD;
  delete config.ADMIN_BOOTSTRAP_PASSWORD;
}

export async function ensureAdminPasswordState(context = {}, handlers = {}) {
  const { env, bootstrapTtlMs } = context;
  handlers.ensureKv(env);
  let config = await handlers.getSystemConfig(env);
  const username = handlers.getAdminPanelUser(env);
  const nowMs = handlers.nowMs?.() ?? Date.now();
  const isPasswordHashSupported = typeof handlers.isPasswordHashSupported === 'function'
    ? handlers.isPasswordHashSupported
    : () => true;
  let permanentPasswordHash = String(config.ADMIN_PANEL_PASSWORD_HASH || '').trim();
  const permanentPassword = String(config.ADMIN_PANEL_PASSWORD || '').trim();

  if (!permanentPasswordHash && permanentPassword) {
    permanentPasswordHash = await handlers.hashPassword(permanentPassword);
    config = {
      ...config,
      ADMIN_PANEL_PASSWORD_HASH: permanentPasswordHash,
      updatedAt: new Date(nowMs).toISOString(),
    };
    delete config.ADMIN_PANEL_PASSWORD;
    await handlers.setSystemConfig(env, config);
  }

  if (permanentPasswordHash && isPasswordHashSupported(permanentPasswordHash)) {
    return {
      username,
      passwordReady: true,
      passwordMode: 'permanent',
      passwordHash: permanentPasswordHash,
      mustChangePassword: false,
      bootstrapExpiresAt: null,
    };
  }

  let bootstrapPasswordHash = String(config.ADMIN_BOOTSTRAP_PASSWORD_HASH || '').trim();
  const bootstrapPassword = String(config.ADMIN_BOOTSTRAP_PASSWORD || '').trim();
  const bootstrapExpiresAt = String(config.ADMIN_BOOTSTRAP_EXPIRES_AT || '').trim() || null;
  const bootstrapExpireMs = bootstrapExpiresAt ? new Date(bootstrapExpiresAt).getTime() : 0;

  if (!bootstrapPasswordHash && bootstrapPassword && bootstrapExpireMs > nowMs) {
    bootstrapPasswordHash = await handlers.hashPassword(bootstrapPassword);
    config = {
      ...config,
      ADMIN_BOOTSTRAP_PASSWORD_HASH: bootstrapPasswordHash,
      updatedAt: new Date(nowMs).toISOString(),
    };
    delete config.ADMIN_BOOTSTRAP_PASSWORD;
    await handlers.setSystemConfig(env, config);
  }

  if (
    bootstrapPasswordHash
    && bootstrapExpireMs > nowMs
    && isPasswordHashSupported(bootstrapPasswordHash)
  ) {
    return {
      username,
      passwordReady: true,
      passwordMode: 'bootstrap',
      passwordHash: bootstrapPasswordHash,
      mustChangePassword: true,
      bootstrapExpiresAt,
      bootstrapNotifyError: String(config.ADMIN_BOOTSTRAP_NOTIFY_ERROR || '').trim() || null,
    };
  }

  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) {
    return {
      username,
      passwordReady: false,
      passwordMode: 'none',
      passwordHash: '',
      mustChangePassword: false,
      bootstrapExpiresAt: null,
    };
  }

  const bootstrapGeneratedPassword = handlers.createBootstrapPassword();
  const generatedPasswordHash = await handlers.hashPassword(bootstrapGeneratedPassword);
  const expiresAt = new Date(nowMs + bootstrapTtlMs).toISOString();
  const next = {
    ...config,
    ADMIN_BOOTSTRAP_PASSWORD_HASH: generatedPasswordHash,
    ADMIN_BOOTSTRAP_EXPIRES_AT: expiresAt,
    ADMIN_FORCE_PASSWORD_CHANGE: 'true',
    ADMIN_SESSION_VERSION: String(handlers.getAdminSessionVersion(config) + 1),
    updatedAt: new Date(nowMs).toISOString(),
  };

  removePlaintextPasswords(next);
  delete next.ADMIN_PANEL_PASSWORD_HASH;
  delete next.ADMIN_BOOTSTRAP_NOTIFY_ERROR;
  await handlers.setSystemConfig(env, next);
  let bootstrapNotifyError = null;
  try {
    await handlers.notifyBootstrapPassword(env, username, bootstrapGeneratedPassword, expiresAt);
  } catch (error) {
    bootstrapNotifyError = formatErrorMessage(error);
    next.ADMIN_BOOTSTRAP_NOTIFY_ERROR = bootstrapNotifyError;
    await handlers.setSystemConfig(env, next);
  }

  return {
    username,
    passwordReady: true,
    passwordMode: 'bootstrap',
    passwordHash: generatedPasswordHash,
    mustChangePassword: true,
    bootstrapExpiresAt: expiresAt,
    bootstrapNotifyError,
  };
}

export async function resetAdminBootstrapPassword(context = {}, handlers = {}) {
  const { env, bootstrapTtlMs } = context;
  handlers.ensureKv(env);
  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) {
    return {
      ok: false,
      message: '当前还无法重置面板密码，请先确保 BOT_TOKEN 与 ADMIN_CHAT_ID 已正确配置。',
    };
  }

  const nowMs = handlers.nowMs?.() ?? Date.now();
  const config = await handlers.getSystemConfig(env);
  const username = handlers.getAdminPanelUser(env);
  const bootstrapGeneratedPassword = handlers.createBootstrapPassword();
  const bootstrapPasswordHash = await handlers.hashPassword(bootstrapGeneratedPassword);
  const expiresAt = new Date(nowMs + bootstrapTtlMs).toISOString();
  const next = {
    ...config,
    ADMIN_BOOTSTRAP_PASSWORD_HASH: bootstrapPasswordHash,
    ADMIN_BOOTSTRAP_EXPIRES_AT: expiresAt,
    ADMIN_FORCE_PASSWORD_CHANGE: 'true',
    ADMIN_SESSION_VERSION: String(handlers.getAdminSessionVersion(config) + 1),
    updatedAt: new Date(nowMs).toISOString(),
  };

  removePlaintextPasswords(next);
  delete next.ADMIN_PANEL_PASSWORD_HASH;
  delete next.ADMIN_BOOTSTRAP_NOTIFY_ERROR;
  await handlers.setSystemConfig(env, next);
  try {
    await handlers.notifyBootstrapPassword(env, username, bootstrapGeneratedPassword, expiresAt);
  } catch (error) {
    next.ADMIN_BOOTSTRAP_NOTIFY_ERROR = formatErrorMessage(error);
    await handlers.setSystemConfig(env, next);
    return {
      ok: false,
      message: `新的临时密码已生成，但发送到 Telegram 失败：${next.ADMIN_BOOTSTRAP_NOTIFY_ERROR}`,
    };
  }

  return {
    ok: true,
    message: `新的临时密码已生成并发送到管理员会话。有效期至：${expiresAt}`,
    expiresAt,
  };
}
