import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAdminCommandPanelKeyboard,
  buildAdminCommandPanelText,
  buildHierarchicalAdminCommandPanelKeyboard,
  handleAdminCommandPanelCallback,
  isAdminCommandPanelCallback,
} from '../worker-src/telegram/admin-command-panel.js';

function createHandlers() {
  const calls = [];
  return {
    calls,
    handlers: {
      answer: async (...args) => { calls.push(['answer', ...args]); },
      startUpload: async () => { calls.push(['upload']); },
      runAdminCommand: async (command) => { calls.push(['command', command]); },
      editPanel: async (payload) => { calls.push(['edit', payload]); },
      startInput: async (action) => { calls.push(['input', action]); },
      confirmDeleteInput: async () => { calls.push(['confirmDelete']); return true; },
    },
  };
}

test('admin command panel exposes the expected action buttons', () => {
  const buttons = buildAdminCommandPanelKeyboard().inline_keyboard.flat();
  assert.match(buildAdminCommandPanelText(), /图床上传/);
  assert.deepEqual(buttons.map((button) => button.callback_data), [
    'panel:menu:media', 'panel:menu:messaging',
    'panel:menu:users', 'panel:menu:moderation',
    'panel:menu:admin-system', 'panel:help', 'panel:close',
  ]);
  assert.equal(isAdminCommandPanelCallback('panel:upload'), true);
  assert.equal(isAdminCommandPanelCallback('adm:user:7'), false);
  assert.equal(isAdminCommandPanelCallback('panel:unknown'), false);
});

test('admin command panel routes upload and command actions', async () => {
  const { calls, handlers } = createHandlers();
  await handleAdminCommandPanelCallback({ data: 'panel:upload' }, handlers);
  await handleAdminCommandPanelCallback({ data: 'panel:open' }, handlers);
  await handleAdminCommandPanelCallback({ data: 'panel:users' }, handlers);
  await handleAdminCommandPanelCallback({ data: 'panel:commands' }, handlers);
  assert.deepEqual(calls.filter((call) => call[0] === 'upload'), [['upload']]);
  assert.deepEqual(calls.filter((call) => call[0] === 'command'), [
    ['command', '/panel'], ['command', '/users 10'], ['command', '/setcommands'],
  ]);
});

test('admin command panel switches help, home, and close views', async () => {
  const { calls, handlers } = createHandlers();
  await handleAdminCommandPanelCallback({ data: 'panel:help' }, handlers);
  await handleAdminCommandPanelCallback({ data: 'panel:home' }, handlers);
  await handleAdminCommandPanelCallback({ data: 'panel:close' }, handlers);
  const edits = calls.filter((call) => call[0] === 'edit').map((call) => call[1]);
  assert.match(edits[0].text, /管理员命令总览/);
  assert.match(edits[1].text, /管理员控制面板/);
  assert.match(edits[2].text, /已关闭/);
  assert.deepEqual(edits[2].reply_markup, { inline_keyboard: [] });
});

test('admin command panel rejects unknown actions', async () => {
  const { calls, handlers } = createHandlers();
  assert.equal(await handleAdminCommandPanelCallback({ data: 'panel:unknown' }, handlers), false);
  assert.deepEqual(calls, [['answer', '未识别的面板操作', true]]);
});

test('hierarchical panel exposes the six top-level categories and accepts nested callbacks', () => {
  const callbacks = buildHierarchicalAdminCommandPanelKeyboard().inline_keyboard.flat().map((button) => button.callback_data);
  assert.deepEqual(callbacks, [
    'panel:menu:media', 'panel:menu:messaging',
    'panel:menu:users', 'panel:menu:moderation',
    'panel:menu:admin-system', 'panel:help', 'panel:close',
  ]);
  for (const callback of [
    'panel:menu:maintenance', 'panel:guide:deleteuser', 'panel:command:admins',
    'panel:confirm:cleanup', 'panel:run:cleanup',
  ]) {
    assert.equal(isAdminCommandPanelCallback(callback), true);
  }
});

test('hierarchical panel displays guides and requires confirmation before destructive commands', async () => {
  const { calls, handlers } = createHandlers();
  await handleAdminCommandPanelCallback({ data: 'panel:menu:moderation' }, handlers);
  await handleAdminCommandPanelCallback({ data: 'panel:guide:deleteuser' }, handlers);
  await handleAdminCommandPanelCallback({ data: 'panel:confirm:cleanup' }, handlers);
  assert.equal(calls.filter((call) => call[0] === 'command').length, 0);
  const edits = calls.filter((call) => call[0] === 'edit').map((call) => call[1]);
  assert.equal(edits[0].reply_markup.inline_keyboard[0][0].callback_data, 'panel:command:blacklist');
  assert.match(edits[1].text, /\/deleteuser/);
  assert.equal(edits[2].reply_markup.inline_keyboard[0][0].callback_data, 'panel:run:cleanup');

  await handleAdminCommandPanelCallback({ data: 'panel:run:cleanup' }, handlers);
  assert.deepEqual(calls.filter((call) => call[0] === 'command'), [['command', '/cleanup']]);
});

test('hierarchical panel routes direct commands and preserves navigation', async () => {
  const { calls, handlers } = createHandlers();
  await handleAdminCommandPanelCallback({ data: 'panel:command:admins' }, handlers);
  await handleAdminCommandPanelCallback({ data: 'panel:menu:verification' }, handlers);
  await handleAdminCommandPanelCallback({ data: 'panel:home' }, handlers);
  assert.deepEqual(calls.filter((call) => call[0] === 'command'), [['command', '/admins']]);
  const edits = calls.filter((call) => call[0] === 'edit').map((call) => call[1]);
  assert.equal(edits[0].reply_markup.inline_keyboard[0][0].callback_data, 'panel:guide:restart');
  assert.equal(edits[1].reply_markup.inline_keyboard[0][0].callback_data, 'panel:menu:media');
});

test('panel exposes a plain-ID input action for parameterized commands', async () => {
  const { calls, handlers } = createHandlers();
  await handleAdminCommandPanelCallback({ data: 'panel:guide:deleteuser' }, handlers);
  const guide = calls.find((call) => call[0] === 'edit')[1];
  assert.equal(guide.reply_markup.inline_keyboard[0][0].callback_data, 'panel:input:deleteuser');
  await handleAdminCommandPanelCallback({ data: 'panel:input:deleteuser' }, handlers);
  assert.deepEqual(calls.filter((call) => call[0] === 'input'), [['input', 'deleteuser']]);
  await handleAdminCommandPanelCallback({ data: 'panel:deleteuser' }, handlers);
  assert.deepEqual(calls.filter((call) => call[0] === 'confirmDelete'), [['confirmDelete']]);
});
