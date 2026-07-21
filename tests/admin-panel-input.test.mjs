import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginAdminPanelInput,
  getAdminPanelInputScopeKey,
  tryHandleAdminPanelInputMessage,
} from '../worker-src/telegram/admin-panel-input.js';

function message(text = '') {
  return {
    chat: { id: -100, type: 'supergroup' },
    from: { id: 7 },
    message_thread_id: 3,
    message_id: 9,
    text,
  };
}

function createHandlers() {
  const sessions = new Map();
  const calls = [];
  return {
    calls,
    handlers: {
      now: () => new Date('2026-07-21T00:00:00.000Z'),
      getSession: async (key) => sessions.get(key) || null,
      setSession: async (key, value) => { sessions.set(key, value); },
      clearSession: async (key) => { sessions.delete(key); },
      sendNotice: async (text) => { calls.push(['notice', text]); },
      runAdminCommand: async (text) => { calls.push(['command', text]); },
      sendReply: async (userId, text) => { calls.push(['reply', userId, text]); },
      requestDeleteConfirmation: async (userId) => { calls.push(['confirm', userId]); },
    },
    sessions,
  };
}

test('input state accepts a plain ID and runs the selected admin command', async () => {
  const { calls, handlers, sessions } = createHandlers();
  const key = getAdminPanelInputScopeKey(message());
  assert.equal(await beginAdminPanelInput(message(), 'restart', handlers), true);
  assert.equal(sessions.get(key).stage, 'id');
  await tryHandleAdminPanelInputMessage(message('not-an-id'), handlers);
  assert.equal(sessions.get(key).stage, 'id');
  await tryHandleAdminPanelInputMessage(message('12345'), handlers);
  assert.deepEqual(calls.filter((call) => call[0] === 'command'), [['command', '/restart 12345']]);
  assert.equal(sessions.has(key), false);
});

test('reply input receives an ID first and content second', async () => {
  const { calls, handlers, sessions } = createHandlers();
  const key = getAdminPanelInputScopeKey(message());
  await beginAdminPanelInput(message(), 'reply', handlers);
  await tryHandleAdminPanelInputMessage(message('88'), handlers);
  assert.deepEqual(sessions.get(key), {
    action: 'reply',
    stage: 'content',
    chatId: -100,
    threadId: 3,
    adminId: 7,
    createdAt: '2026-07-21T00:00:00.000Z',
    expiresAt: '2026-07-21T00:10:00.000Z',
    userId: 88,
  });
  await tryHandleAdminPanelInputMessage(message('hello'), handlers);
  assert.deepEqual(calls.filter((call) => call[0] === 'reply'), [['reply', 88, 'hello']]);
  assert.equal(sessions.has(key), false);
});

test('delete input requires a short-lived confirmation and supports cancellation', async () => {
  const { calls, handlers, sessions } = createHandlers();
  const key = getAdminPanelInputScopeKey(message());
  await beginAdminPanelInput(message(), 'deleteuser', handlers);
  await tryHandleAdminPanelInputMessage(message('66'), handlers);
  assert.deepEqual(calls.filter((call) => call[0] === 'confirm'), [['confirm', 66]]);
  assert.equal(sessions.get(key).stage, 'confirm');
  await tryHandleAdminPanelInputMessage(message('77'), handlers);
  assert.equal(calls.filter((call) => call[0] === 'command').length, 0);
  await tryHandleAdminPanelInputMessage(message('/cancel'), handlers);
  assert.equal(sessions.has(key), false);
});
