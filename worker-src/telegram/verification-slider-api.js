import { finalizeVerificationStageFailure } from './verification-stage-api.js';

export async function handleVerificationSliderApiRequest(context = {}, handlers = {}) {
  const session = await handlers.loadContext(context.body);
  const { userId } = session;
  let current = session.current;

  if (session.terminal || current?.stage !== 'slider') {
    return handlers.buildPayload(current, context.publicBaseUrl);
  }

  const hadSubmitProof = Boolean(current?.slider?.submitNonce);
  current = await handlers.ensureProof(userId, current);
  if (!hadSubmitProof && (!context.body?.nonce || !context.body?.signature)) {
    return {
      ...(await handlers.buildPayload(current, context.publicBaseUrl)),
      status: 'slider_failed',
      reason: 'proof_missing',
    };
  }

  const validation = await handlers.validateAttempt(current, context.body);
  if (validation.ok) {
    const nextState = {
      ...current,
      stage: 'grid',
      slider: {
        ...(current?.slider || {}),
        submitNonce: null,
        submitNonceIssuedAt: null,
      },
      sessionExpiresAt: new Date(handlers.nowMs() + handlers.getSessionExpireMs()).toISOString(),
      updatedAt: handlers.nowIso(),
    };
    await handlers.saveState(userId, nextState, current);
    await handlers.persistLatest(userId, nextState);
    return handlers.buildPayload(nextState, context.publicBaseUrl);
  }

  return finalizeVerificationStageFailure(
    {
      userId,
      current,
      stage: 'slider',
      reason: validation.reason,
      status: 'slider_failed',
      publicBaseUrl: context.publicBaseUrl,
      buildNextState: (nextAttempts) => ({
        ...current,
        slider: {
          ...(current?.slider || {}),
          attempts: nextAttempts,
          submitNonce: handlers.createNonce(),
          submitNonceIssuedAt: handlers.nowIso(),
          lastReason: validation.reason,
          lastFailedAt: handlers.nowIso(),
        },
        updatedAt: handlers.nowIso(),
      }),
    },
    handlers,
  );
}
