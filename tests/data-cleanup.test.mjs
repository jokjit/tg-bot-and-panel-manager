import assert from 'node:assert/strict';
import test from 'node:test';

import { executeDataCleanup } from '../worker-src/maintenance/data-cleanup.js';

const DAY_MS = 24 * 60 * 60 * 1000;

test('data cleanup protects privileged users and deletes stale data across KV and D1', async () => {
  const nowMs = Date.parse('2026-07-20T12:00:00.000Z');
  const profiles = {
    'user:1': { userId: 1, lastSeenAt: new Date(nowMs - 60 * DAY_MS).toISOString() },
    'user:2': { userId: 2, lastSeenAt: new Date(nowMs - 50 * DAY_MS).toISOString() },
    'user:3': { userId: 3, lastSeenAt: new Date(nowMs - 1 * DAY_MS).toISOString() },
    'user:4': { userId: 4, firstSeenAt: new Date(nowMs - 40 * DAY_MS).toISOString() },
    'user:5': { userId: 5 },
  };
  const deletedKeys = [];
  const d1Calls = [];
  let persisted = null;
  let conversationCacheCleared = false;
  const db = {
    prepare(sql) {
      return {
        bind(cutoff, limit) {
          d1Calls.push({ sql, cutoff, limit });
          return this;
        },
        async run() {
          return { meta: { changes: sql.trimStart().startsWith('DELETE FROM messages') ? 5 : 1 } };
        },
      };
    },
  };

  const result = await executeDataCleanup({
    source: 'test',
    retentionDays: 30,
    batchSize: 2,
    now: () => nowMs,
    rootAdminIds: [2],
    listUserKeys: async (limit) => {
      assert.equal(limit, 6);
      return Object.keys(profiles);
    },
    readUserProfile: async (key) => profiles[key],
    isProtectedUser: async (userId) => userId === 4,
    readTopic: async () => ({ threadId: 90 }),
    buildUserKeys: (userId, topic) => ({
      user: `user:${userId}`,
      verify: `verify:${userId}`,
      topicUser: `topic:user:${userId}`,
      topicThread: `topic:thread:${topic.threadId}`,
    }),
    deleteKv: async (key) => {
      if (key === 'verify:1') throw new Error('KV unavailable');
      deletedKeys.push(key);
    },
    db,
    deleteDirectory: async () => false,
    onConversationsDeleted: () => { conversationCacheCleared = true; },
    persistState: async (metrics) => { persisted = metrics; },
  });

  assert.deepEqual(deletedKeys, ['user:1', 'topic:user:1', 'topic:thread:90']);
  assert.equal(result.kv.scannedUsers, 5);
  assert.equal(result.kv.staleUsers, 1);
  assert.equal(result.kv.protectedUsers, 2);
  assert.equal(result.kv.skippedNoTimestamp, 1);
  assert.equal(result.kv.deletedUsers, 1);
  assert.equal(result.kv.deletedVerifyStates, 0);
  assert.equal(result.kv.deletedTopicMappings, 1);
  assert.equal(result.kv.errors, 1);
  assert.equal(result.d1.deletedDirectoryEntries, 0);
  assert.equal(result.d1.deletedMessages, 5);
  assert.equal(result.d1.deletedConversations, 1);
  assert.equal(result.d1.errors, 1);
  assert.equal(conversationCacheCleared, true);
  assert.equal(d1Calls[0].limit, 40);
  assert.equal(d1Calls[1].limit, 4);
  assert.equal(result.cutoffIso, '2026-06-20T12:00:00.000Z');
  assert.equal(persisted, result);
});

test('data cleanup isolates topic lookup failures and works without D1', async () => {
  const nowMs = Date.parse('2026-07-20T12:00:00.000Z');
  const deletedKeys = [];
  const result = await executeDataCleanup({
    retentionDays: 7,
    batchSize: 1,
    now: () => nowMs,
    rootAdminIds: [],
    listUserKeys: async () => ['user:8'],
    readUserProfile: async () => ({
      userId: 8,
      lastSeenAt: new Date(nowMs - 8 * DAY_MS).toISOString(),
    }),
    isProtectedUser: async () => false,
    readTopic: async () => { throw new Error('KV read failed'); },
    buildUserKeys: (userId) => ({
      user: `user:${userId}`,
      verify: `verify:${userId}`,
      topicUser: `topic:user:${userId}`,
      topicThread: '',
    }),
    deleteKv: async (key) => { deletedKeys.push(key); },
    db: null,
    persistState: async () => { throw new Error('state write failed'); },
  });

  assert.deepEqual(deletedKeys, ['user:8', 'verify:8', 'topic:user:8']);
  assert.equal(result.kv.deletedUsers, 1);
  assert.equal(result.kv.deletedVerifyStates, 1);
  assert.equal(result.kv.deletedTopicMappings, 0);
  assert.equal(result.kv.errors, 1);
  assert.equal(result.d1.errors, 0);
  assert.ok(result.finishedAt);
});
