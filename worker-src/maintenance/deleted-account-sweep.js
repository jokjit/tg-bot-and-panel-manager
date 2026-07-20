function createMetrics(source, startedAt, batchSize) {
  return {
    ok: true,
    source: String(source || 'manual'),
    startedAt,
    finishedAt: null,
    batchSize,
    kv: {
      scannedUsers: 0,
      candidates: 0,
      probedUsers: 0,
      deletedUsers: 0,
      deletedVerifyStates: 0,
      deletedTopicMappings: 0,
      deletedBlacklistEntries: 0,
      deletedTrustEntries: 0,
      deletedAdminEntries: 0,
      skippedNoTimestamp: 0,
      protectedUsers: 0,
      notDeleted: 0,
      probeErrors: 0,
      errors: 0,
    },
    d1: {
      deletedMessages: 0,
      deletedConversations: 0,
      deletedVerificationStatuses: 0,
      deletedVerificationSessions: 0,
      errors: 0,
    },
    detections: [],
  };
}

function addDeletionMetrics(metrics, deletion) {
  for (const key of [
    'deletedUsers',
    'deletedVerifyStates',
    'deletedTopicMappings',
    'deletedBlacklistEntries',
    'deletedTrustEntries',
    'deletedAdminEntries',
  ]) {
    metrics.kv[key] += Number(deletion?.kv?.[key] || 0);
  }
  for (const key of [
    'deletedMessages',
    'deletedConversations',
    'deletedVerificationStatuses',
    'deletedVerificationSessions',
  ]) {
    metrics.d1[key] += Number(deletion?.d1?.[key] || 0);
  }
  metrics.kv.errors += Number(deletion?.kv?.errors || 0);
  metrics.d1.errors += Number(deletion?.d1?.errors || 0);
}

export async function executeDeletedAccountSweep(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const metrics = createMetrics(options.source, new Date(now()).toISOString(), Number(options.batchSize));
  const rootAdminIds = new Set(
    (Array.isArray(options.rootAdminIds) ? options.rootAdminIds : []).map((id) => Number(id)),
  );

  try {
    const userNames = await options.listUserKeys(options.scanLimit);
    metrics.kv.scannedUsers = userNames.length;
    const profiles = (
      await Promise.all(
        userNames.map(async (keyName) => {
          const profile = await options.readUserProfile(keyName);
          if (!profile || typeof profile !== 'object') return null;
          const userId = Number(profile.userId);
          if (!(Number.isFinite(userId) && userId > 0)) return null;
          const seenMs = Date.parse(String(profile.lastSeenAt || profile.firstSeenAt || ''));
          if (!Number.isFinite(seenMs)) {
            metrics.kv.skippedNoTimestamp += 1;
            return null;
          }
          return { profile, userId, seenMs };
        }),
      )
    ).filter(Boolean).sort((a, b) => a.seenMs - b.seenMs);

    const candidates = profiles.slice(0, Number(options.batchSize));
    metrics.kv.candidates = candidates.length;
    for (const item of candidates) {
      if (rootAdminIds.has(item.userId)) {
        metrics.kv.protectedUsers += 1;
        continue;
      }

      metrics.kv.probedUsers += 1;
      const probe = await options.probeDeletedUser(item.userId);
      if (!probe.deleted) {
        metrics.kv.notDeleted += 1;
        if (probe.error) metrics.kv.probeErrors += 1;
        continue;
      }

      const deletion = await options.purgeDeletedUser(item.userId, item.profile);
      addDeletionMetrics(metrics, deletion);
      metrics.detections.push({ userId: item.userId, reason: probe.reason });
    }
  } catch {
    metrics.kv.errors += 1;
  }

  metrics.finishedAt = new Date(now()).toISOString();
  try {
    await options.persistState(metrics);
  } catch {}
  try {
    await options.notify?.(metrics);
  } catch {}
  return metrics;
}
