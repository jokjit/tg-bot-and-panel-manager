import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAdminModerationCommand } from '../worker-src/telegram/admin-moderation-commands.js';

function createHandlers(overrides = {}) {
  const calls = [];
  return {
    calls,
    handlers: {
      sendNotice: async (text) => { calls.push(['notice', text]); },
      setTrust: async (userId, payload) => { calls.push(['setTrust', userId, payload]); return payload; },
      deleteTrust: async (userId) => { calls.push(['deleteTrust', userId]); },
      setBlacklist: async (userId, payload) => { calls.push(['setBlacklist', userId, payload]); return payload; },
      deleteBlacklist: async (userId) => { calls.push(['deleteBlacklist', userId]); },
      sendBlockedMessage: async (userId, text) => { calls.push(['blocked', userId, text]); },
      listBlacklist: async () => [],
      listTrust: async () => [],
      parseLimit: (value, fallback) => Number(value) || fallback,
      ...overrides,
    },
  };
}

test('moderation commands use context targets and persist audit fields', async () => {
  const { calls, handlers } = createHandlers();
  const handled = await handleAdminModerationCommand({
    trimmed: '/trust important user',
    defaultTargetUserId: 7,
    operator: 'admin:1',
    now: () => '2026-07-20T00:00:00.000Z',
  }, handlers);
  assert.equal(handled, true);
  assert.deepEqual(calls[0], ['setTrust', 7, {
    note: 'important user', createdAt: '2026-07-20T00:00:00.000Z', createdBy: 'admin:1',
  }]);
  assert.match(calls[1][1], /已设为信任用户：7/);
});

test('ban command records the reason and tolerates blocked-message delivery failures', async () => {
  const { calls, handlers } = createHandlers({
    sendBlockedMessage: async () => { throw new Error('Telegram unavailable'); },
  });
  const handled = await handleAdminModerationCommand({
    trimmed: '/ban 9 spam', defaultTargetUserId: null, blockedText: 'blocked', operator: 'admin:1',
  }, handlers);
  assert.equal(handled, true);
  assert.equal(calls[0][0], 'setBlacklist');
  assert.equal(calls[0][1], 9);
  assert.equal(calls[0][2].reason, 'spam');
  assert.match(calls[1][1], /已加入黑名单：9/);
});

test('blacklist command renders entries and unrelated commands fall through', async () => {
  const { calls, handlers } = createHandlers({
    listBlacklist: async (limit) => [{ userId: 2, reason: `limit:${limit}` }],
  });
  assert.equal(await handleAdminModerationCommand({ trimmed: '/blacklist 5' }, handlers), true);
  assert.match(calls[0][1], /2 \| limit:5/);
  assert.equal(await handleAdminModerationCommand({ trimmed: '/users 5' }, handlers), false);
});

test('trust list command renders trusted users', async () => {
  const { calls, handlers } = createHandlers({
    listTrust: async (limit) => [{ userId: 3, note: `limit:${limit}` }],
  });
  assert.equal(await handleAdminModerationCommand({ trimmed: '/trustlist 8' }, handlers), true);
  assert.match(calls[0][1], /3 \| limit:8/);
});
