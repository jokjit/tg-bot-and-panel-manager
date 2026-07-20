import assert from 'node:assert/strict';
import test from 'node:test';

import { purgeDeletedUserRecords } from '../worker-src/maintenance/purge.js';

test('deleted-user purge continues after partial KV and D1 failures', async () => {
  const deletedKeys = [];
  const db = {
    prepare(sql) {
      return {
        bind() { return this; },
        async run() {
          return { meta: { changes: sql.includes('messages') ? 4 : 1 } };
        },
      };
    },
  };
  let conversationsCleared = false;
  const result = await purgeDeletedUserRecords({
    userId: 7,
    kvDeletions: [
      { kind: 'user', key: 'user:7' },
      { kind: 'trust', key: 'trust:7' },
      { kind: 'topicUser', key: 'topic:user:7' },
    ],
    topicThreadKey: 'topic:thread:9',
    deleteKv: async (key) => {
      if (key === 'trust:7') throw new Error('KV unavailable');
      deletedKeys.push(key);
    },
    db,
    deleteDirectory: async () => false,
    deleteVerificationStatus: async () => ({ ok: true, changes: 1 }),
    deleteVerificationSession: async () => ({ ok: false, changes: 0 }),
    onConversationsDeleted: () => { conversationsCleared = true; },
  });

  assert.deepEqual(deletedKeys, ['user:7', 'topic:user:7', 'topic:thread:9']);
  assert.equal(result.kv.deletedUsers, 1);
  assert.equal(result.kv.deletedTrustEntries, 0);
  assert.equal(result.kv.deletedTopicMappings, 2);
  assert.equal(result.kv.errors, 1);
  assert.equal(result.d1.deletedMessages, 4);
  assert.equal(result.d1.deletedConversations, 1);
  assert.equal(result.d1.deletedVerificationStatuses, 1);
  assert.equal(result.d1.deletedVerificationSessions, 0);
  assert.equal(result.d1.errors, 2);
  assert.equal(conversationsCleared, true);
});

test('deleted-user purge skips D1 adapters when no database is bound', async () => {
  let d1Called = false;
  const result = await purgeDeletedUserRecords({
    userId: 8,
    kvDeletions: [],
    deleteKv: async () => {},
    db: null,
    deleteDirectory: async () => { d1Called = true; },
  });
  assert.equal(d1Called, false);
  assert.equal(result.d1.errors, 0);
});
