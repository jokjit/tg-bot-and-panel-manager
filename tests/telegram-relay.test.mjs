import assert from 'node:assert/strict';
import test from 'node:test';

import { relayAdminMessageToUser, relayUserMessageToAdmins } from '../worker-src/telegram/relay.js';

test('user relay falls back to text and attaches metadata to delivered messages', async () => {
  const calls = [];
  const marked = [];
  const result = await relayUserMessageToAdmins({
    env: {},
    message: { chat: { id: 7 }, message_id: 70 },
    relayChatIds: [10, 11],
    messageThreadId: 90,
    fallbackText: 'fallback',
    metaText: 'meta',
    replyMarkup: { inline_keyboard: [] },
    shouldSendMeta: true,
    topicModeActive: true,
    sendWithThreadFallback: async (env, method, payload) => {
      calls.push({ method, payload });
      if (method === 'forwardMessage' && payload.chat_id === 10) throw new Error('forward blocked');
      return { message_id: calls.length };
    },
    markTopicMeta: async (message) => { marked.push(message.message_id); },
  });
  assert.equal(result.delivered, true);
  assert.equal(result.lastError, null);
  assert.equal(calls.filter((call) => call.method === 'forwardMessage').length, 2);
  assert.equal(calls.some((call) => call.method === 'sendMessage' && call.payload.text === 'fallback'), true);
  assert.equal(calls.filter((call) => call.payload.text === 'meta').length, 2);
  assert.equal(marked.length, 2);
});

test('user relay reports the last error when every delivery path fails', async () => {
  const result = await relayUserMessageToAdmins({
    env: {}, message: { chat: { id: 7 }, message_id: 70 }, relayChatIds: [10],
    sendWithThreadFallback: async () => { throw new Error('unavailable'); },
  });
  assert.equal(result.delivered, false);
  assert.equal(result.lastError.message, 'unavailable');
});

test('admin relay maps text and Telegram media payloads and ignores commands', async () => {
  const calls = [];
  const send = async (env, method, payload) => { calls.push({ method, payload }); return { ok: true }; };
  const entities = [{ type: 'blockquote', offset: 0, length: 5 }];
  const captionEntities = [{ type: 'bold', offset: 0, length: 5 }];
  await relayAdminMessageToUser({ text: 'hello', entities }, {}, 7, send);
  await relayAdminMessageToUser({
    photo: [{ file_id: 'small' }, { file_id: 'large' }],
    caption: 'photo',
    caption_entities: captionEntities,
  }, {}, 7, send);
  await relayAdminMessageToUser({ contact: { phone_number: '123', first_name: 'Ada' } }, {}, 7, send);
  await relayAdminMessageToUser({ text: '/help' }, {}, 7, send);
  assert.deepEqual(calls.map((call) => call.method), ['sendMessage', 'sendPhoto', 'sendContact']);
  assert.equal(calls[0].payload.entities, entities);
  assert.equal(calls[1].payload.photo, 'large');
  assert.equal(calls[1].payload.caption_entities, captionEntities);
  assert.equal(calls[2].payload.first_name, 'Ada');
});
