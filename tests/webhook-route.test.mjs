import assert from 'node:assert/strict';
import test from 'node:test';

import { handleWebhookRequest } from '../worker-src/routes/webhook.js';

function createHandlers(overrides = {}) {
  const calls = [];
  const handlers = {
    ensureEnv: (...args) => calls.push(['ensureEnv', ...args]),
    getRequestId: () => 'request-1',
    getTelegramUpdateContext: () => ({ updateId: 7, userId: 9, chatId: 11 }),
    handleUpdate: async (...args) => calls.push(['handleUpdate', ...args]),
    writeStructuredLog: (...args) => calls.push(['log', ...args]),
    runNonCriticalTask: async (_ctx, task) => task(),
    recordWebhookError: async (...args) => calls.push(['recordError', ...args]),
    notifyWebhookError: async (...args) => calls.push(['notifyError', ...args]),
    corsHeaders: () => ({ 'x-test-cors': 'ok' }),
    nowMs: (() => {
      let value = 1000;
      return () => (value += 5);
    })(),
    ...overrides,
  };
  return { handlers, calls };
}

test('webhook route rejects an invalid Telegram secret before parsing the update', async () => {
  const { handlers, calls } = createHandlers();
  const request = new Request('https://bot.example.com/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': 'wrong',
    },
    body: JSON.stringify({ update_id: 7 }),
  });

  const response = await handleWebhookRequest(
    { request, env: { BOT_TOKEN: 'bot', ADMIN_CHAT_ID: '11', WEBHOOK_SECRET: 'expected' } },
    handlers,
  );

  assert.equal(response.status, 403);
  assert.equal(calls.some(([name]) => name === 'handleUpdate'), false);
});

test('webhook route handles updates and returns CORS headers', async () => {
  const { handlers, calls } = createHandlers();
  const request = new Request('https://bot.example.com/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'expected' },
    body: JSON.stringify({ update_id: 7 }),
  });

  const response = await handleWebhookRequest(
    { request, env: { BOT_TOKEN: 'bot', ADMIN_CHAT_ID: '11', WEBHOOK_SECRET: 'expected' }, publicBaseUrl: 'https://bot.example.com' },
    handlers,
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ok');
  assert.equal(response.headers.get('x-test-cors'), 'ok');
  assert.equal(calls.some(([name]) => name === 'handleUpdate'), true);
  assert.equal(calls.some(([name]) => name === 'log'), true);
});

test('webhook route records and notifies processing errors without failing the response', async () => {
  const { handlers, calls } = createHandlers({
    handleUpdate: async () => { throw new Error('update failed'); },
  });
  const request = new Request('https://bot.example.com/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ update_id: 7 }),
  });

  const response = await handleWebhookRequest(
    { request, env: { BOT_TOKEN: 'bot', ADMIN_CHAT_ID: '11' } },
    handlers,
  );

  assert.equal(response.status, 200);
  assert.equal(calls.some(([name]) => name === 'recordError'), true);
  assert.equal(calls.some(([name]) => name === 'notifyError'), true);
});
