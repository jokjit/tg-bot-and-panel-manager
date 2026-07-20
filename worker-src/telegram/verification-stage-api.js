export async function finalizeVerificationStageFailure(context = {}, handlers = {}) {
  const {
    userId,
    current,
    stage,
    reason,
    status,
    publicBaseUrl,
    lockDetails = {},
    buildNextState,
  } = context;
  const nextAttempts = Number(current?.[stage]?.attempts || 0) + 1;
  const nextState = await buildNextState(nextAttempts);

  if (nextAttempts >= handlers.getMaxAttempts()) {
    const locked = await handlers.lock(userId, nextState, {
      ...lockDetails,
      stage,
      reason,
    });
    return handlers.buildPayload(locked, publicBaseUrl);
  }

  await handlers.saveState(userId, nextState, current);
  await handlers.persistLatest(userId, nextState);
  return {
    ...(await handlers.buildPayload(nextState, publicBaseUrl)),
    status,
    reason,
  };
}
