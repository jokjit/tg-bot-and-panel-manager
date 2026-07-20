export async function repairVerificationStateFromProfileState(context = {}, handlers = {}) {
  const { userId, state = null, profile = null } = context;
  const passedAt = await handlers.resolvePassedAt(userId, profile);
  if (!passedAt) return null;

  const nowIso = await handlers.nowIso();
  const remaining = Number(state?.postVerifyRemaining);
  const promptMessageId = Number(state?.promptMessageId || 0);
  const nextState = {
    ...(state || {}),
    userId: Number(userId),
    verificationVersion: 'web-v2',
    verified: true,
    verifiedAt: state?.verifiedAt || passedAt,
    answeredAt: state?.answeredAt || passedAt,
    promptMessageId: null,
    blockedUntil: null,
    stage: 'passed',
    sessionToken: null,
    sessionIssuedAt: null,
    sessionExpiresAt: null,
    slider: null,
    grid: null,
    choice: null,
    selectedAnswer: null,
    correctAnswer: null,
    challenge: null,
    failureCount: 0,
    postVerifyRemaining: Number.isFinite(remaining) && remaining > 0 ? remaining : 0,
    repairedFromProfileAt: nowIso,
    updatedAt: nowIso,
  };

  await handlers.saveState(userId, nextState, state);
  await handlers.clearLatest(userId);
  await handlers.markProfilePassed(userId, passedAt);
  if (promptMessageId) {
    await handlers.clearPrompt(userId, promptMessageId);
  }
  return nextState;
}

export async function resetVerificationStateAfterProfileRevocationState(context = {}, handlers = {}) {
  const { userId, state = null } = context;
  const nowIso = await handlers.nowIso();
  const nextState = {
    ...(state || {}),
    userId: Number(userId),
    verificationVersion: 'web-v2',
    flowMode: null,
    verified: false,
    verifiedAt: null,
    answeredAt: null,
    promptMessageId: null,
    blockedUntil: null,
    stage: null,
    sessionToken: null,
    sessionIssuedAt: null,
    sessionExpiresAt: null,
    slider: null,
    grid: null,
    choice: null,
    selectedAnswer: null,
    correctAnswer: null,
    challenge: null,
    failureCount: 0,
    postVerifyRemaining: 0,
    resetFromProfileAt: nowIso,
    updatedAt: nowIso,
  };
  await handlers.saveState(userId, nextState, state);
  await handlers.clearLatest(userId);
  return nextState;
}
