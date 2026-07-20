import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAdminMaintenanceCommand } from '../worker-src/telegram/admin-maintenance-commands.js';

function cleanupResult() {
  return {
    retentionDays: 30,
    kv: { scannedUsers: 8, deletedUsers: 2, deletedVerifyStates: 2, deletedTopicMappings: 1, protectedUsers: 1, errors: 1 },
    d1: { deletedMessages: 5, deletedConversations: 2 },
  };
}

function sweepResult() {
  return {
    detections: [{ userId: 7 }],
    kv: { scannedUsers: 9, deletedUsers: 1, deletedVerifyStates: 1, deletedTopicMappings: 2, deletedBlacklistEntries: 1, deletedTrustEntries: 1, deletedAdminEntries: 0, protectedUsers: 1, probeErrors: 2 },
    d1: { deletedMessages: 4, deletedConversations: 1 },
  };
}

test('cleanup command passes retention options and renders nonzero warnings', async () => {
  let options = null;
  let notice = '';
  const handled = await handleAdminMaintenanceCommand({ trimmed: '/cleanup 30' }, {
    runDataCleanup: async (value) => { options = value; return cleanupResult(); },
    sendNotice: async (text) => { notice = text; },
  });
  assert.equal(handled, true);
  assert.deepEqual(options, { retentionDays: 30, source: 'telegram-admin', force: true });
  assert.match(notice, /删除历史消息：5/);
  assert.match(notice, /保护跳过：1/);
  assert.match(notice, /异常条数：1/);
});

test('deleted-account sweep command passes batch size and renders probe metrics', async () => {
  let options = null;
  let notice = '';
  await handleAdminMaintenanceCommand({ trimmed: '/sweepdeleted 12' }, {
    runDeletedAccountSweep: async (value) => { options = value; return sweepResult(); },
    sendNotice: async (text) => { notice = text; },
  });
  assert.deepEqual(options, { batchSize: 12, source: 'telegram-admin', force: true });
  assert.match(notice, /命中：1/);
  assert.match(notice, /探测失败：2/);
});

test('delete-user command resolves context targets and reports storage errors', async () => {
  let purgedUserId = null;
  const notices = [];
  const handlers = {
    purgeDeletedUser: async (userId) => {
      purgedUserId = userId;
      return {
        kv: { deletedUsers: 1, deletedVerifyStates: 1, deletedTopicMappings: 1, deletedBlacklistEntries: 0, deletedTrustEntries: 0, deletedAdminEntries: 0, errors: 1 },
        d1: { deletedMessages: 3, deletedConversations: 1, errors: 2 },
      };
    },
    sendNotice: async (text) => { notices.push(text); },
  };
  assert.equal(await handleAdminMaintenanceCommand({ trimmed: '/deleteuser', defaultTargetUserId: 17 }, handlers), true);
  assert.equal(purgedUserId, 17);
  assert.match(notices[0], /KV 异常：1/);
  assert.match(notices[0], /D1 异常：2/);
  assert.equal(await handleAdminMaintenanceCommand({ trimmed: '/users 5' }, handlers), false);
});
