import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAdminReplyRoute } from '../worker-src/routes/admin-reply.js';

function createHandlers(overrides = {}) {
  const calls = [];
  const handlers = {
    getAdminApiPrefix: () => '/admin/api',
    requireAdmin: async (...args) => calls.push(['auth', ...args]),
    ensureBotToken: () => calls.push(['ensureToken']),
    readJsonBody: async () => ({ userId: 7, text: ' hello ' }),
    toChatId: (value) => Number(value),
    sendMessage: async (...args) => { calls.push(['send', ...args]); return { message_id: 44 }; },
    saveMessageHistory: async (...args) => calls.push(['history', ...args]),
    getOperator: () => 'admin:1',
    createError: (status, message) => Object.assign(new Error(message), { status }),
    json: (body) => body,
    ...overrides,
  };
  return { calls, handlers };
}

test('admin reply sends trimmed text before recording history', async () => {
  const { calls, handlers } = createHandlers();
  const result = await handleAdminReplyRoute({
    request: { method: 'POST' },
    url: new URL('https://example.com/admin/api/reply'),
  }, handlers);
  assert.equal(result.result.message_id, 44);
  assert.deepEqual(calls.map((call) => call[0]), ['auth', 'ensureToken', 'send', 'history']);
  assert.deepEqual(calls.find((call) => call[0] === 'send'), ['send', 7, 'hello']);
  const history = calls.find((call) => call[0] === 'history')[1];
  assert.equal(history.telegramMessageId, 44);
  assert.equal(history.textContent, 'hello');
  assert.equal(history.rawPayload.operator, 'admin:1');
});

test('admin reply rejects empty text before Telegram delivery', async () => {
  const { calls, handlers } = createHandlers({ readJsonBody: async () => ({ userId: 7, text: '  ' }) });
  await assert.rejects(handleAdminReplyRoute({
    request: { method: 'POST' },
    url: new URL('https://example.com/admin/api/reply'),
  }, handlers), (error) => error.status === 400);
  assert.equal(calls.some((call) => call[0] === 'send' || call[0] === 'history'), false);
});

test('admin reply ignores unrelated routes', async () => {
  const { calls, handlers } = createHandlers();
  assert.equal(await handleAdminReplyRoute({
    request: { method: 'GET' },
    url: new URL('https://example.com/admin/api/reply'),
  }, handlers), null);
  assert.deepEqual(calls, []);
});
