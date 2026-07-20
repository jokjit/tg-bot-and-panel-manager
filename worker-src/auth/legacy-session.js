export async function createOrRefreshLegacyVerificationState(context = {}, handlers = {}) {
  const userId = context.userId;
  const forceNew = Boolean(context.forceNew);
  let existing = await handlers.getState(userId);

  if (existing?.verified) {
    const profile = await handlers.getProfile(userId);
    if (await handlers.isStateActive(userId, existing, profile)) {
      if (!handlers.isProfilePassed(profile)) {
        await handlers.markProfilePassed(
          userId,
          existing.verifiedAt || existing.answeredAt || existing.updatedAt,
        );
      }
      return existing;
    }
    existing = await handlers.resetAfterRevocation(userId, existing);
  }

  const profile = await handlers.getProfile(userId);
  const repairedState = await handlers.repairFromProfile(userId, existing, profile);
  if (repairedState?.verified) return repairedState;

  if (existing?.challenge && !forceNew && !handlers.isChallengeExpired(existing.challenge)) {
    return existing;
  }

  const state = {
    userId: Number(userId),
    verified: false,
    verifiedAt: null,
    answeredAt: null,
    promptMessageId: existing?.promptMessageId || null,
    blockedUntil: null,
    selectedAnswer: null,
    correctAnswer: null,
    failureCount: Number(existing?.failureCount || 0),
    challenge: await handlers.createChallenge(),
    updatedAt: await handlers.nowIso(),
  };

  await handlers.saveState(userId, state, existing);
  await handlers.clearLatest(userId);
  return state;
}
