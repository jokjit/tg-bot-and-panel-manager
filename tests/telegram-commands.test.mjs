import assert from 'node:assert/strict';
import test from 'node:test';

import { getTelegramCommandCatalog, syncTelegramCommandMenu } from '../worker-src/telegram/commands.js';

test('Telegram command catalog exposes a minimal user menu and unique admin commands', () => {
  const catalog = getTelegramCommandCatalog();
  assert.deepEqual(catalog.default.map((item) => item.command), ['start']);
  assert.equal(catalog.admin.some((item) => item.command === 'reply'), true);
  assert.equal(catalog.admin.some((item) => item.command === 'upload'), true);
  assert.equal(catalog.admin.some((item) => item.command === 'setcommands'), true);
  assert.equal(new Set(catalog.admin.map((item) => item.command)).size, catalog.admin.length);
});

test('Telegram command sync scopes admin commands to private chats and clears legacy group menus', async () => {
  const calls = [];
  const result = await syncTelegramCommandMenu({
    env: {},
    adminChatIds: [-100, 7, 7],
    legacyGroupChatIds: [-100, -100],
    adminUserIds: [-100, 7, 8, 8],
    send: async (env, method, payload) => {
      calls.push({ method, payload });
      if (payload?.scope?.chat_id === 8) throw new Error('chat unavailable');
      return { ok: true };
    },
  });
  assert.deepEqual(result.adminCommandChats, [7]);
  assert.deepEqual(result.adminCommandTargets, [8]);
  assert.deepEqual(result.clearedGroupScopes, [-100]);
  assert.equal(result.appliedCount, 3);
  assert.deepEqual(result.failedScopes, [{ scope: 'admin_private', userId: 8, error: 'chat unavailable' }]);
  assert.equal(calls[0].payload.scope.type, 'default');
  assert.equal(calls[1].method, 'setChatMenuButton');
  assert.deepEqual(calls[2], {
    method: 'deleteMyCommands',
    payload: { scope: { type: 'chat', chat_id: -100 } },
  });
  assert.equal(calls.filter((call) => call.method === 'setMyCommands').length, 3);
  assert.equal(calls.some((call) => call.method === 'setMyCommands' && call.payload.scope.chat_id === -100), false);
});

test('Telegram command sync reports when no admin scope is available', async () => {
  const result = await syncTelegramCommandMenu({ env: {}, send: async () => ({ ok: true }) });
  assert.equal(result.appliedCount, 2);
  assert.deepEqual(result.adminCommandChats, []);
  assert.deepEqual(result.adminCommandTargets, []);
  assert.match(result.note, /未找到可用/);
});
