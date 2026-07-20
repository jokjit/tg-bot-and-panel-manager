export async function approveUserVerificationState(context = {}, handlers = {}) {
  const userId = context.userId;
  const operator = context.operator || 'unknown';
  const options = context.options || {};
  const notifyUser = options.notifyUser !== false;
  const keepSession = Boolean(options.keepSession);
  const existing = (await handlers.getState(userId)) || {};
  const nowIso = await handlers.nowIso();

  await handlers.markProfilePassed(userId, nowIso);
  const nextState = {
    ...existing,
    userId: Number(userId),
    verificationVersion: 'web-v2',
    verified: true,
    verifiedAt: nowIso,
    answeredAt: nowIso,
    blockedUntil: null,
    stage: keepSession ? existing?.stage || 'grid' : 'passed',
    sessionToken: keepSession ? existing?.sessionToken || null : null,
    sessionExpiresAt: keepSession ? existing?.sessionExpiresAt || null : null,
    sessionIssuedAt: keepSession ? existing?.sessionIssuedAt || null : null,
    challenge: null,
    choice: keepSession ? existing?.choice || null : null,
    failureCount: 0,
    selectedAnswer: null,
    correctAnswer: null,
    postVerifyRemaining: await handlers.getObserveMessageCount(),
    approvedBy: operator,
    approvedAt: nowIso,
    updatedAt: nowIso,
  };

  await handlers.saveState(userId, nextState, existing);
  await handlers.clearLatest(userId);

  const promptMessageId = Number(nextState?.promptMessageId || 0);
  if (promptMessageId) {
    await handlers.clearPrompt(userId, promptMessageId);
  }

  if (notifyUser) {
    try {
      await handlers.notifyUser(userId);
    } catch (error) {
      // Notification failure must not undo an approved state.
    }
  }

  return nextState;
}
