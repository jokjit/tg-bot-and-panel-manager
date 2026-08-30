import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ensureAdminPasswordState,
  resetAdminBootstrapPassword,
} from '../worker-src/auth/password-state.js';

const NOW_MS = Date.parse('2026-08-30T00:00:00.000Z');
const TTL_MS = 60 * 60 * 1000;

function createHarness(initialConfig = {}, options = {}) {
  let config = { ...initialConfig };
  const writes = [];
  const notifications = [];
  const handlers = {
    ensureKv: () => {},
    getSystemConfig: async () => ({ ...config }),
    getAdminPanelUser: () => 'admin',
    hashPassword: async (password) => `hash:${password}`,
    setSystemConfig: async (_env, next) => {
      config = { ...next };
      writes.push({ ...next });
    },
    getAdminSessionVersion: (value) => Number(value.ADMIN_SESSION_VERSION || 1),
    createBootstrapPassword: () => 'generated-password',
    notifyBootstrapPassword: async (...args) => {
      notifications.push(args);
      if (options.notifyError) throw new Error(options.notifyError);
    },
    nowMs: () => NOW_MS,
  };
  return { handlers, writes, notifications, getConfig: () => config };
}

test('admin password state migrates a plaintext permanent password', async () => {
  const harness = createHarness({ ADMIN_PANEL_PASSWORD: 'legacy-password' });
  const result = await ensureAdminPasswordState(
    { env: {}, bootstrapTtlMs: TTL_MS },
    harness.handlers,
  );

  assert.equal(result.passwordMode, 'permanent');
  assert.equal(result.passwordHash, 'hash:legacy-password');
  assert.equal(harness.writes.length, 1);
  assert.equal('ADMIN_PANEL_PASSWORD' in harness.getConfig(), false);
});

test('admin password state migrates an active plaintext bootstrap password', async () => {
  const expiresAt = new Date(NOW_MS + TTL_MS).toISOString();
  const harness = createHarness({
    ADMIN_BOOTSTRAP_PASSWORD: 'legacy-bootstrap',
    ADMIN_BOOTSTRAP_EXPIRES_AT: expiresAt,
  });
  const result = await ensureAdminPasswordState(
    { env: {}, bootstrapTtlMs: TTL_MS },
    harness.handlers,
  );

  assert.equal(result.passwordMode, 'bootstrap');
  assert.equal(result.passwordHash, 'hash:legacy-bootstrap');
  assert.equal(result.bootstrapExpiresAt, expiresAt);
  assert.equal(harness.notifications.length, 0);
  assert.equal('ADMIN_BOOTSTRAP_PASSWORD' in harness.getConfig(), false);
});

test('admin password state persists generated credentials before notification failures', async () => {
  const harness = createHarness({ ADMIN_SESSION_VERSION: '3' }, { notifyError: 'telegram unavailable' });
  const env = { BOT_TOKEN: 'bot-token', ADMIN_CHAT_ID: '123' };
  const result = await ensureAdminPasswordState(
    { env, bootstrapTtlMs: TTL_MS },
    harness.handlers,
  );

  assert.equal(result.passwordReady, true);
  assert.equal(result.passwordHash, 'hash:generated-password');
  assert.equal(result.bootstrapNotifyError, 'telegram unavailable');
  assert.equal(harness.getConfig().ADMIN_SESSION_VERSION, '4');
  assert.equal(harness.getConfig().ADMIN_BOOTSTRAP_NOTIFY_ERROR, 'telegram unavailable');
  assert.equal(harness.writes.length, 2);
});

test('admin bootstrap reset rotates the password and session version', async () => {
  const harness = createHarness({
    ADMIN_PANEL_PASSWORD_HASH: 'old-permanent-hash',
    ADMIN_SESSION_VERSION: '7',
  });
  const env = { BOT_TOKEN: 'bot-token', ADMIN_CHAT_ID: '123' };
  const result = await resetAdminBootstrapPassword(
    { env, bootstrapTtlMs: TTL_MS },
    harness.handlers,
  );

  assert.equal(result.ok, true);
  assert.equal(result.expiresAt, new Date(NOW_MS + TTL_MS).toISOString());
  assert.equal(harness.getConfig().ADMIN_SESSION_VERSION, '8');
  assert.equal(harness.getConfig().ADMIN_BOOTSTRAP_PASSWORD_HASH, 'hash:generated-password');
  assert.equal('ADMIN_PANEL_PASSWORD_HASH' in harness.getConfig(), false);
  assert.equal(harness.notifications.length, 1);
});
