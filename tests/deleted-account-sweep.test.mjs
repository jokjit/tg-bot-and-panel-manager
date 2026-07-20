import assert from 'node:assert/strict';
import test from 'node:test';

import { executeDeletedAccountSweep } from '../worker-src/maintenance/deleted-account-sweep.js';

test('deleted-account sweep orders candidates, protects admins, and aggregates purge results', async () => {
  const profiles = {
    'user:1': { userId: 1, lastSeenAt: '2026-01-01T00:00:00.000Z' },
    'user:2': { userId: 2, lastSeenAt: '2026-01-02T00:00:00.000Z' },
    'user:3': { userId: 3, lastSeenAt: '2026-01-03T00:00:00.000Z' },
    'user:4': { userId: 4 },
  };
  let persisted = null;
  let notified = null;
  const probed = [];
  const result = await executeDeletedAccountSweep({
    source: 'test', batchSize: 3, scanLimit: 500, now: () => Date.parse('2026-07-20T12:00:00.000Z'),
    rootAdminIds: [2],
    listUserKeys: async (limit) => { assert.equal(limit, 500); return Object.keys(profiles); },
    readUserProfile: async (key) => profiles[key],
    probeDeletedUser: async (userId) => {
      probed.push(userId);
      return userId === 1 ? { deleted: true, reason: 'deleted_marker' } : { deleted: false, reason: 'active' };
    },
    purgeDeletedUser: async () => ({
      kv: { deletedUsers: 1, deletedVerifyStates: 1, deletedTopicMappings: 2, deletedBlacklistEntries: 1, deletedTrustEntries: 1, deletedAdminEntries: 1, errors: 2 },
      d1: { deletedMessages: 4, deletedConversations: 1, deletedVerificationStatuses: 1, deletedVerificationSessions: 1, errors: 1 },
    }),
    persistState: async (metrics) => { persisted = metrics; },
    notify: async (metrics) => { notified = metrics; },
  });
  assert.deepEqual(probed, [1, 3]);
  assert.equal(result.kv.scannedUsers, 4);
  assert.equal(result.kv.candidates, 3);
  assert.equal(result.kv.protectedUsers, 1);
  assert.equal(result.kv.probedUsers, 2);
  assert.equal(result.kv.notDeleted, 1);
  assert.equal(result.kv.deletedUsers, 1);
  assert.equal(result.kv.deletedTopicMappings, 2);
  assert.equal(result.kv.errors, 2);
  assert.equal(result.d1.deletedMessages, 4);
  assert.equal(result.d1.deletedVerificationStatuses, 1);
  assert.equal(result.d1.errors, 1);
  assert.deepEqual(result.detections, [{ userId: 1, reason: 'deleted_marker' }]);
  assert.equal(persisted, result);
  assert.equal(notified, result);
});

test('deleted-account sweep records probe errors and tolerates adapter failures', async () => {
  const result = await executeDeletedAccountSweep({
    source: 'test', batchSize: 1, scanLimit: 1, rootAdminIds: [],
    listUserKeys: async () => ['user:9'],
    readUserProfile: async () => ({ userId: 9, lastSeenAt: '2026-01-01T00:00:00.000Z' }),
    probeDeletedUser: async () => ({ deleted: false, reason: 'probe_failed', error: 'timeout' }),
    purgeDeletedUser: async () => { throw new Error('should not purge'); },
    persistState: async () => { throw new Error('KV unavailable'); },
    notify: async () => { throw new Error('Telegram unavailable'); },
  });
  assert.equal(result.kv.probedUsers, 1);
  assert.equal(result.kv.notDeleted, 1);
  assert.equal(result.kv.probeErrors, 1);
  assert.equal(result.kv.errors, 0);
  assert.equal(result.detections.length, 0);
  assert.ok(result.finishedAt);
});
