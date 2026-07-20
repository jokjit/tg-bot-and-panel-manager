export async function restartUserVerificationState(context = {}, handlers = {}) {
  const userId = context.userId;
  const operator = context.operator || 'unknown';
  const existing = await handlers.getState(userId);

  if (existing?.promptMessageId) {
    await handlers.deletePrompt(userId, existing.promptMessageId);
  }
  await handlers.clearProfilePassed(userId);

  const state = {
    ...(existing || {}),
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
    updatedAt: await handlers.nowIso(),
    restartedBy: operator,
  };

  await handlers.saveState(userId, state, existing);
  return state;
}
