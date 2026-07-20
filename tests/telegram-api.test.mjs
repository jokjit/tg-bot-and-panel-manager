import assert from 'node:assert/strict';
import test from 'node:test';

import {
  telegram,
  telegramMultipart,
  telegramWithThreadFallback,
} from '../worker-src/telegram/api.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('Telegram JSON and multipart requests return API results', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ ok: true, result: { message_id: 42 } });
  };

  const jsonResult = await telegram(
    { BOT_TOKEN: 'secret' },
    'sendMessage',
    { chat_id: 1, text: 'hello' },
    fetchImpl,
  );
  const formData = new FormData();
  formData.set('chat_id', '1');
  const multipartResult = await telegramMultipart(
    { BOT_TOKEN: 'secret' },
    'sendPhoto',
    formData,
    fetchImpl,
  );

  assert.deepEqual(jsonResult, { message_id: 42 });
  assert.deepEqual(multipartResult, { message_id: 42 });
  assert.equal(calls[0].url, 'https://api.telegram.org/botsecret/sendMessage');
  assert.equal(calls[0].init.headers['content-type'], 'application/json; charset=UTF-8');
  assert.equal(calls[1].url, 'https://api.telegram.org/botsecret/sendPhoto');
  assert.equal(calls[1].init.headers, undefined);
});

test('Telegram requests expose API and malformed-response failures', async () => {
  await assert.rejects(
    telegram(
      { BOT_TOKEN: 'secret' },
      'sendMessage',
      {},
      async () => jsonResponse({ ok: false, description: 'chat not found' }, 400),
    ),
    /chat not found/,
  );

  await assert.rejects(
    telegram(
      { BOT_TOKEN: 'secret' },
      'sendMessage',
      {},
      async () => new Response('gateway failure', { status: 502 }),
    ),
    /invalid response: 502/,
  );
});

test('Telegram thread fallback retries once without the topic ID', async () => {
  const payloads = [];
  const send = async (_env, _method, payload) => {
    payloads.push(payload);
    if (payloads.length === 1) throw new Error('thread not found');
    return { message_id: 7 };
  };

  const original = { chat_id: 1, message_thread_id: 99, text: 'hello' };
  const result = await telegramWithThreadFallback({}, 'sendMessage', original, send);

  assert.deepEqual(result, { message_id: 7 });
  assert.deepEqual(payloads, [original, { chat_id: 1, text: 'hello' }]);
  assert.equal(original.message_thread_id, 99);
});
