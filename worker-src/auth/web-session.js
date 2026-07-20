export function isReusableVerificationWebSession(state, flowMode, nowMs) {
  const sessionExpiresAtMs = state?.sessionExpiresAt ? new Date(state.sessionExpiresAt).getTime() : 0;
  return Boolean(
    state?.sessionToken &&
      sessionExpiresAtMs > nowMs &&
      state?.flowMode === flowMode &&
      (flowMode === 'numeric-choice'
        ? state?.stage === 'choice' && state?.choice
        : (state?.stage === 'slider' || state?.stage === 'grid') && state?.slider && state?.grid),
  );
}

export async function createOrRefreshVerificationWebSessionState(context = {}, handlers = {}) {
  const userId = Number(context.userId);
  const forceNew = Boolean(context.forceNew);
  let existing = (await handlers.getState(userId)) || {};
  const flowMode = handlers.getFlowMode();

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

  const blockedUntilMs = existing?.blockedUntil ? new Date(existing.blockedUntil).getTime() : 0;
  if (blockedUntilMs && blockedUntilMs > handlers.nowMs()) return existing;

  if (isReusableVerificationWebSession(existing, flowMode, handlers.nowMs()) && !forceNew) {
    return handlers.ensureProof(userId, existing);
  }

  if (forceNew && existing?.promptMessageId) {
    await handlers.deletePrompt(userId, existing.promptMessageId);
  }

  const now = handlers.nowMs();
  const nextState = {
    ...(existing || {}),
    userId,
    verificationVersion: 'web-v2',
    flowMode,
    verified: false,
    verifiedAt: null,
    answeredAt: null,
    promptMessageId: forceNew ? null : existing?.promptMessageId || null,
    blockedUntil: null,
    selectedAnswer: null,
    correctAnswer: null,
    challenge: null,
    failureCount: 0,
    stage: flowMode === 'numeric-choice' ? 'choice' : 'slider',
    sessionToken: handlers.createSessionToken(),
    sessionIssuedAt: new Date(now).toISOString(),
    sessionExpiresAt: new Date(now + handlers.getSessionExpireMs()).toISOString(),
    slider: flowMode === 'numeric-choice' ? null : handlers.createSliderChallenge(),
    grid: flowMode === 'numeric-choice' ? null : handlers.createGridChallenge(),
    choice: flowMode === 'numeric-choice' ? handlers.createChoiceChallenge() : null,
    updatedAt: new Date(now).toISOString(),
  };

  await handlers.saveState(userId, nextState, existing);
  await handlers.persistLatest(userId, nextState);
  return nextState;
}
