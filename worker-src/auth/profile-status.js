export async function markProfileVerificationPassedState(context = {}, handlers = {}) {
  if (!handlers.hasKv()) return null;

  const { userId, verifiedAt = null } = context;
  const nowIso = await handlers.nowIso();
  const passedAt = await handlers.writeLocalPassed(userId, verifiedAt || nowIso);
  await handlers.writeD1Passed(userId, passedAt, nowIso);

  const existing = (await handlers.getProfile(userId)) || { userId: Number(userId) };
  const next = {
    ...existing,
    userId: Number(userId),
    verificationStatus: 'verified',
    verificationPassedAt: passedAt,
    verificationClearedAt: null,
    verificationUpdatedAt: nowIso,
  };
  await handlers.saveProfile(userId, next, existing);
  return next;
}

export async function clearProfileVerificationPassedState(context = {}, handlers = {}) {
  const { userId } = context;
  const nowIso = await handlers.nowIso();
  await handlers.writeLocalCleared(userId, nowIso);
  await handlers.writeD1Cleared(userId, nowIso);

  if (!handlers.hasKv()) return null;
  const existing = await handlers.getProfile(userId);
  if (!existing) return null;

  const next = {
    ...existing,
    userId: Number(userId),
    verificationStatus: 'pending',
    verificationPassedAt: null,
    verificationClearedAt: nowIso,
    verificationUpdatedAt: nowIso,
  };
  await handlers.saveProfile(userId, next, existing);
  return next;
}
