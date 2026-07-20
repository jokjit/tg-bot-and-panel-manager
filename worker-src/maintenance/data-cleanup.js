function createMetrics({ source, startedAt, retentionDays, cutoffIso, batchSize }) {
  return {
    ok: true,
    source: String(source || 'manual'),
    startedAt,
    finishedAt: null,
    retentionDays,
    cutoffIso,
    batchSize,
    kv: {
      scannedUsers: 0,
      staleUsers: 0,
      deletedUsers: 0,
      deletedVerifyStates: 0,
      deletedTopicMappings: 0,
      skippedNoTimestamp: 0,
      protectedUsers: 0,
      errors: 0,
    },
    d1: {
      deletedDirectoryEntries: 0,
      deletedMessages: 0,
      deletedConversations: 0,
      deletedVerificationStatuses: 0,
      deletedVerificationSessions: 0,
      errors: 0,
    },
  };
}

async function deleteD1Batch(db, sql, cutoffIso, limit) {
  const result = await db.prepare(sql).bind(cutoffIso, limit).run();
  return Number(result?.meta?.changes || 0);
}

export async function executeDataCleanup(options = {}) {
  const retentionDays = Number(options.retentionDays);
  const batchSize = Number(options.batchSize);
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const cutoffTime = now() - retentionDays * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffTime).toISOString();
  const metrics = createMetrics({
    source: options.source,
    startedAt: new Date(now()).toISOString(),
    retentionDays,
    cutoffIso,
    batchSize,
  });
  const rootAdminIds = new Set(
    (Array.isArray(options.rootAdminIds) ? options.rootAdminIds : []).map((id) => Number(id)),
  );
  const onKvDeleted = typeof options.onKvDeleted === 'function' ? options.onKvDeleted : () => {};

  try {
    const userNames = await options.listUserKeys(Math.max(batchSize * 3, batchSize));
    metrics.kv.scannedUsers = userNames.length;
    const staleTargets = [];

    for (const keyName of userNames) {
      if (staleTargets.length >= batchSize) break;
      const profile = await options.readUserProfile(keyName);
      if (!profile || typeof profile !== 'object') continue;
      const userId = Number(profile.userId);
      if (!(Number.isFinite(userId) && userId > 0)) continue;
      const seenMs = Date.parse(String(profile.lastSeenAt || profile.firstSeenAt || ''));
      if (!Number.isFinite(seenMs)) {
        metrics.kv.skippedNoTimestamp += 1;
        continue;
      }
      if (seenMs >= cutoffTime) continue;
      if (rootAdminIds.has(userId) || (await options.isProtectedUser(userId))) {
        metrics.kv.protectedUsers += 1;
        continue;
      }
      staleTargets.push({ userId });
    }

    metrics.kv.staleUsers = staleTargets.length;
    for (const { userId } of staleTargets) {
      let topicRecord = null;
      try {
        topicRecord = await options.readTopic(userId);
      } catch {
        metrics.kv.errors += 1;
      }
      const keys = options.buildUserKeys(userId, topicRecord);

      for (const deletion of [
        { key: keys.user, counter: 'deletedUsers' },
        { key: keys.verify, counter: 'deletedVerifyStates' },
      ]) {
        try {
          await options.deleteKv(deletion.key);
          onKvDeleted(deletion.key);
          metrics.kv[deletion.counter] += 1;
        } catch {
          metrics.kv.errors += 1;
        }
      }

      try {
        await options.deleteKv(keys.topicUser);
        onKvDeleted(keys.topicUser);
        if (keys.topicThread) {
          await options.deleteKv(keys.topicThread);
          onKvDeleted(keys.topicThread);
          metrics.kv.deletedTopicMappings += 1;
        }
      } catch {
        metrics.kv.errors += 1;
      }

      if (options.db) {
        try {
          if (await options.deleteDirectory(userId)) {
            metrics.d1.deletedDirectoryEntries += 1;
          } else {
            metrics.d1.errors += 1;
          }
        } catch {
          metrics.d1.errors += 1;
        }
      }
    }
  } catch {
    metrics.kv.errors += 1;
  }

  if (options.db) {
    try {
      metrics.d1.deletedMessages = await deleteD1Batch(
        options.db,
        `DELETE FROM messages
         WHERE id IN (
           SELECT id FROM messages
           WHERE created_at < ?1
           ORDER BY created_at ASC
           LIMIT ?2
         )`,
        cutoffIso,
        batchSize * 20,
      );
    } catch {
      metrics.d1.errors += 1;
    }

    try {
      metrics.d1.deletedConversations = await deleteD1Batch(
        options.db,
        `DELETE FROM conversations
         WHERE id IN (
           SELECT c.id
           FROM conversations c
           LEFT JOIN messages m ON m.conversation_id = c.id
           WHERE m.id IS NULL
             AND (c.last_message_at IS NULL OR c.last_message_at < ?1)
           LIMIT ?2
         )`,
        cutoffIso,
        batchSize * 2,
      );
      if (metrics.d1.deletedConversations > 0) {
        options.onConversationsDeleted?.();
      }
    } catch {
      metrics.d1.errors += 1;
    }
  }

  metrics.finishedAt = new Date(now()).toISOString();
  try {
    await options.persistState(metrics);
  } catch {}
  return metrics;
}
