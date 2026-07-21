import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_IMAGE_UPLOAD_TTL_SECONDS,
  getAdminImageUploadScopeKey,
  getTelegramImageDescriptor,
  tryHandleAdminImageUploadMessage,
} from '../worker-src/telegram/admin-image-upload.js';

function createMessage(overrides = {}) {
  return {
    from: { id: 10 },
    chat: { id: -100, type: 'supergroup' },
    message_id: 5,
    ...overrides,
  };
}

function createHandlers(overrides = {}) {
  const calls = [];
  const sessions = new Map();
  return {
    calls,
    handlers: {
      now: () => new Date('2026-07-21T00:00:00.000Z'),
      isReady: () => true,
      getSession: async (key) => sessions.get(key) || null,
      setSession: async (key, value) => { sessions.set(key, value); calls.push(['set', key, value]); },
      clearSession: async (key) => { sessions.delete(key); calls.push(['clear', key]); },
      sendNotice: async (text) => calls.push(['notice', text]),
      downloadFile: async (descriptor) => ({ name: descriptor.fileName, type: descriptor.contentType, size: 9, arrayBuffer: async () => new ArrayBuffer(9) }),
      store: async (file, createdBy) => { calls.push(['store', file.name, createdBy]); return { objectKey: '2026/07/photo.jpg' }; },
      buildView: (asset) => ({ ...asset, url: 'https://img.example.com/2026/07/photo.jpg' }),
      ...overrides,
    },
  };
}

test('upload command creates an expiring session scoped to the administrator and topic', async () => {
  const { calls, handlers } = createHandlers();
  const message = createMessage({ text: '/upload@MyBot', message_thread_id: 12 });
  assert.equal(await tryHandleAdminImageUploadMessage(message, handlers), true);
  const session = calls.find((call) => call[0] === 'set')[2];
  assert.equal(calls.find((call) => call[0] === 'set')[1], '-100:12:10');
  assert.equal(session.adminId, 10);
  assert.equal(new Date(session.expiresAt).getTime() - new Date(session.createdAt).getTime(), ADMIN_IMAGE_UPLOAD_TTL_SECONDS * 1000);
  assert.match(calls.find((call) => call[0] === 'notice')[1], /10 分钟/);
});

test('a pending upload stores the largest Telegram photo and replies with its public URL', async () => {
  const { calls, handlers } = createHandlers();
  await tryHandleAdminImageUploadMessage(createMessage({ text: '/upload' }), handlers);
  const message = createMessage({ photo: [{ file_id: 'small' }, { file_id: 'large', file_size: 9 }] });
  assert.equal(await tryHandleAdminImageUploadMessage(message, handlers), true);
  assert.deepEqual(calls.find((call) => call[0] === 'store').slice(1), ['telegram-photo.jpg', 'telegram:10']);
  assert.equal(calls.filter((call) => call[0] === 'clear').length, 1);
  assert.match(calls.at(-1)[1], /https:\/\/img\.example\.com/);
});

test('non-image messages keep the pending upload active and cancel removes it', async () => {
  const { calls, handlers } = createHandlers();
  await tryHandleAdminImageUploadMessage(createMessage({ text: '/upload' }), handlers);
  await tryHandleAdminImageUploadMessage(createMessage({ text: 'not an image' }), handlers);
  assert.equal(calls.some((call) => call[0] === 'store'), false);
  assert.match(calls.at(-1)[1], /仅支持/);
  await tryHandleAdminImageUploadMessage(createMessage({ text: '/cancel' }), handlers);
  assert.equal(calls.filter((call) => call[0] === 'clear').length, 1);
  assert.match(calls.at(-1)[1], /取消/);
});

test('document uploads accept only supported image MIME types', () => {
  assert.deepEqual(getTelegramImageDescriptor(createMessage({
    document: { file_id: 'png', file_name: 'photo.png', mime_type: 'image/png', file_size: 9 },
  })), {
    fileId: 'png', fileName: 'photo.png', contentType: 'image/png', fileSize: 9,
  });
  assert.equal(getTelegramImageDescriptor(createMessage({
    document: { file_id: 'pdf', mime_type: 'application/pdf' },
  })), null);
  assert.equal(getAdminImageUploadScopeKey(createMessage({ from: {} })), '');
});
