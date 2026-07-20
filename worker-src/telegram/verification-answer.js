export async function processUserVerificationAnswerState(context = {}, handlers = {}) {
  const { userId, answer } = context;
  const options = context.options || {};
  const state = await handlers.getState(userId);

  if (state?.verified) {
    return { status: 'already-verified' };
  }

  const blockedUntilMs = state?.blockedUntil ? new Date(state.blockedUntil).getTime() : 0;
  if (blockedUntilMs && blockedUntilMs > handlers.nowMs()) {
    return {
      status: 'blocked',
      leftSec: Math.max(1, Math.ceil((blockedUntilMs - handlers.nowMs()) / 1000)),
    };
  }

  if (!state?.challenge) {
    return { status: 'no-challenge' };
  }

  if (options.expectedToken && state.challenge.token !== options.expectedToken) {
    return { status: 'token-mismatch' };
  }

  if (handlers.isChallengeExpired(state.challenge)) {
    await handlers.markFailed(userId, {
      selectedAnswer: '',
      correctAnswer: String(state.challenge.correct || ''),
      blockMs: handlers.getTimeoutBlockMs(),
      countForBan: false,
    });
    return { status: 'expired' };
  }

  if (state?.answeredAt) {
    return { status: 'already-answered' };
  }

  if (String(answer) !== String(state.challenge.correct)) {
    const failedState = await handlers.markFailed(userId, {
      selectedAnswer: answer,
      correctAnswer: String(state.challenge.correct),
      blockMs: handlers.getFailBlockMs(),
    });
    const maxFailures = handlers.getMaxFailures();
    if (failedState.failureCount >= maxFailures) {
      const entry = await handlers.ban(userId, failedState, maxFailures);
      return {
        status: 'banned',
        correctAnswer: String(state.challenge.correct),
        blockedUntil: failedState.blockedUntil,
        failureCount: failedState.failureCount,
        maxFailures,
        blacklist: entry,
      };
    }
    return {
      status: 'incorrect',
      correctAnswer: String(state.challenge.correct),
      blockedUntil: failedState.blockedUntil,
      failureCount: failedState.failureCount,
      maxFailures,
    };
  }

  await handlers.markVerified(userId);
  return { status: 'verified' };
}
