const KV_COUNTERS = {
  user: 'deletedUsers',
  verify: 'deletedVerifyStates',
  topicUser: 'deletedTopicMappings',
  blacklist: 'deletedBlacklistEntries',
  trust: 'deletedTrustEntries',
  admin: 'deletedAdminEntries',
};

function emptyMetrics() {
  return {
    kv: {
      deletedUsers: 0,
      deletedVerifyStates: 0,
      deletedTopicMappings: 0,
      deletedBlacklistEntries: 0,
      deletedTrustEntries: 0,
      deletedAdminEntries: 0,
      errors: 0,
    },
    d1: {
      deletedMessages: 0,
      deletedConversations: 0,
      deletedVerificationStatuses: 0,
      deletedVerificationSessions: 0,
      errors: 0,
    },
  };
}

async function deleteD1Rows(db, table, userId) {
  const result = await db.prepare(`DELETE FROM ${table} WHERE user_id = ?1`).bind(Number(userId)).run();
  return Number(result?.meta?.changes || 0);
}

export async function purgeDeletedUserRecords(options = {}) {
  const metrics = emptyMetrics();
  const userId = Number(options.userId);
  const deleteKv = options.deleteKv;
  const onKvDeleted = typeof options.onKvDeleted === 'function' ? options.onKvDeleted : () => {};

  for (const deletion of Array.isArray(options.kvDeletions) ? options.kvDeletions : []) {
    try {
      await deleteKv(deletion.key);
      onKvDeleted(deletion.key);
      const counter = KV_COUNTERS[deletion.kind];
      if (counter) metrics.kv[counter] += 1;
    } catch {
      metrics.kv.errors += 1;
    }
  }

  if (options.topicThreadKey) {
    try {
      await deleteKv(options.topicThreadKey);
      onKvDeleted(options.topicThreadKey);
      metrics.kv.deletedTopicMappings += 1;
    } catch {
      metrics.kv.errors += 1;
    }
  }

  if (!options.db) return metrics;

  try {
    if (!(await options.deleteDirectory())) metrics.d1.errors += 1;
  } catch {
    metrics.d1.errors += 1;
  }

  try {
    const result = await options.deleteVerificationStatus();
    if (result?.ok) {
      metrics.d1.deletedVerificationStatuses = Number(result.changes || 0);
      options.onVerificationStatusDeleted?.();
    } else {
      metrics.d1.errors += 1;
    }
  } catch {
    metrics.d1.errors += 1;
  }

  try {
    const result = await options.deleteVerificationSession();
    if (result?.ok) {
      metrics.d1.deletedVerificationSessions = Number(result.changes || 0);
    } else {
      metrics.d1.errors += 1;
    }
  } catch {
    metrics.d1.errors += 1;
  }

  try {
    metrics.d1.deletedMessages = await deleteD1Rows(options.db, 'messages', userId);
  } catch {
    metrics.d1.errors += 1;
  }

  try {
    metrics.d1.deletedConversations = await deleteD1Rows(options.db, 'conversations', userId);
    options.onConversationsDeleted?.();
  } catch {
    metrics.d1.errors += 1;
  }

  return metrics;
}
