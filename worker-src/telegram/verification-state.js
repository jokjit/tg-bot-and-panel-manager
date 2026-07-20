export async function markUserVerifiedState(context = {}, handlers = {}) {
  const userId = context.userId;
  const existing = await handlers.getState(userId);
  const nowIso = await handlers.nowIso();
  await handlers.markProfilePassed(userId, nowIso);
  const state = {
    ...(existing || {}),
    userId: Number(userId),
    verificationVersion: 'web-v2',
    verified: true,
    verifiedAt: nowIso,
    answeredAt: nowIso,
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
    postVerifyRemaining: await handlers.getObserveMessageCount(),
    updatedAt: nowIso,
  };
  await handlers.saveState(userId, state, existing);
  await handlers.clearLatest(userId);
  return state;
}

export async function markUserVerificationFailedState(context = {}, handlers = {}) {
  const userId = context.userId;
  const payload = context.payload || {};
  const existing = await handlers.getState(userId);
  const blockMs = Number(payload?.blockMs || await handlers.getDefaultBlockMs());
  const now = await handlers.nowMs();
  const nowIso = new Date(now).toISOString();
  const blockedUntil = new Date(now + blockMs).toISOString();
  const countForBan = payload?.countForBan !== false;
  const failureCount = countForBan
    ? Number(existing?.failureCount || 0) + 1
    : Number(existing?.failureCount || 0);
  const state = {
    ...(existing || {}),
    userId: Number(userId),
    verified: false,
    verifiedAt: null,
    answeredAt: nowIso,
    blockedUntil,
    selectedAnswer: String(payload?.selectedAnswer || ''),
    correctAnswer: String(payload?.correctAnswer || ''),
    challenge: null,
    failureCount,
    lastFailureAt: nowIso,
    updatedAt: nowIso,
  };
  await handlers.saveState(userId, state, existing);
  await handlers.clearLatest(userId);
  return state;
}
