import assert from 'node:assert/strict';
import test from 'node:test';

import { handleDeployBootstrapRequest } from '../worker-src/routes/deploy-bootstrap.js';

function createHarness(overrides = {}) {
  const kvWrites = [];
  const logs = [];
  const env = {
    DEPLOY_BOOTSTRAP_TOKEN: 'bootstrap-token',
    BOT_TOKEN: 'bot-token',
    ADMIN_CHAT_ID: '123',
    WEBHOOK_SECRET: 'webhook-secret',
    BOT_KV: {
      get: async () => null,
      put: async (...args) => kvWrites.push(args),
    },
  };
  const handlers = {
    createError: (status, message) => Object.assign(new Error(message), { status }),
    ensureEnv: () => {},
    ensureKv: () => {},
    telegram: async () => ({ ok: true }),
    syncTelegramCommands: async () => ({ ok: true }),
    ensureAdminPasswordState: async () => ({
      passwordReady: true,
      passwordMode: 'bootstrap',
      bootstrapNotifyError: null,
    }),
    json: (body, status) => ({ body, status }),
    writeStructuredLog: (...args) => logs.push(args),
    nowMs: (() => {
      const values = [100, 125];
      return () => values.shift() ?? 125;
    })(),
    ...overrides,
  };
  return { env, handlers, kvWrites, logs };
}

test('deployment bootstrap emits a credential-free structured health event', async () => {
  const { env, handlers, kvWrites, logs } = createHarness();
  const response = await handleDeployBootstrapRequest({
    request: new Request('https://bot.example.com/deploy/bootstrap', {
      method: 'POST',
      headers: { 'x-deploy-bootstrap-token': 'bootstrap-token' },
    }),
    env,
    webhookPath: '/webhook',
    publicBaseUrl: 'https://bot.example.com',
    requestId: 'request-123',
  }, handlers);

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(kvWrites.length, 2);
  assert.deepEqual(logs, [[
    'info',
    'deployment_bootstrap_completed',
    { requestId: 'request-123', stage: 'deploy_bootstrap' },
    {
      durationMs: 25,
      status: 'healthy',
      webhookReady: true,
      commandsReady: true,
      passwordReady: true,
      bootstrapNotifyReady: true,
    },
  ]]);
  assert.equal(JSON.stringify(logs).includes('bootstrap-token'), false);
  assert.equal(JSON.stringify(logs).includes('bot-token'), false);
});

test('deployment bootstrap logs degraded readiness without consuming its token', async () => {
  const { env, handlers, kvWrites, logs } = createHarness({
    syncTelegramCommands: async () => {
      throw new Error('commands_unavailable');
    },
  });
  const response = await handleDeployBootstrapRequest({
    request: new Request('https://bot.example.com/deploy/bootstrap', {
      method: 'POST',
      headers: { 'x-deploy-bootstrap-token': 'bootstrap-token' },
    }),
    env,
    webhookPath: '/webhook',
    publicBaseUrl: 'https://bot.example.com',
    requestId: 'request-456',
  }, handlers);

  assert.equal(response.body.ok, false);
  assert.equal(kvWrites.length, 1);
  assert.equal(logs[0][0], 'warn');
  assert.equal(logs[0][1], 'deployment_bootstrap_completed');
  assert.deepEqual(logs[0][3], {
    durationMs: 25,
    status: 'degraded',
    webhookReady: true,
    commandsReady: false,
    passwordReady: true,
    bootstrapNotifyReady: true,
  });
});
