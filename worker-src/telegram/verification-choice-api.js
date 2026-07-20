import { finalizeVerificationStageFailure } from './verification-stage-api.js';

export async function handleVerificationChoiceApiRequest(context = {}, handlers = {}) {
  const session = await handlers.loadContext(context.body);
  const { userId } = session;
  const current = session.current;

  if (session.terminal || current?.stage !== 'choice') {
    return handlers.buildPayload(current, context.publicBaseUrl);
  }

  const answer = String(context.body?.answer ?? '').trim();
  const expected = String(current?.choice?.correct ?? '').trim();
  if (answer && expected && handlers.answersEqual(answer, expected)) {
    const nextState = await handlers.approve(userId, 'web-verification', {
      notifyUser: true,
      keepSession: false,
    });
    return handlers.buildPayload(nextState, context.publicBaseUrl);
  }

  return finalizeVerificationStageFailure(
    {
      userId,
      current,
      stage: 'choice',
      reason: 'choice_selection_mismatch',
      status: 'choice_failed',
      publicBaseUrl: context.publicBaseUrl,
      lockDetails: { selectedAnswer: answer },
      buildNextState: (nextAttempts) => ({
        ...current,
        selectedAnswer: answer,
        correctAnswer: expected,
        choice: {
          ...(current?.choice || {}),
          attempts: nextAttempts,
          lastFailedAt: handlers.nowIso(),
        },
        updatedAt: handlers.nowIso(),
      }),
    },
    handlers,
  );
}
