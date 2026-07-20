import { finalizeVerificationStageFailure } from './verification-stage-api.js';

export function normalizeSubmittedGridIndices(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 0 && item <= 8),
    ),
  );
}

export function normalizeExpectedGridIndices(values) {
  if (!Array.isArray(values)) return [];
  return values.map((item) => Number(item)).filter((item) => Number.isInteger(item));
}

export function compareIndexSets(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  const a = [...left].sort((x, y) => x - y);
  const b = [...right].sort((x, y) => x - y);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

export async function handleVerificationGridApiRequest(context = {}, handlers = {}) {
  const session = await handlers.loadContext(context.body);
  const { userId } = session;
  const current = session.current;

  if (session.terminal || current?.stage !== 'grid') {
    return handlers.buildPayload(current, context.publicBaseUrl);
  }

  const selections = normalizeSubmittedGridIndices(context.body?.selections);
  const expected = normalizeExpectedGridIndices(current?.grid?.targetIndices);
  if (compareIndexSets(selections, expected)) {
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
      stage: 'grid',
      reason: 'grid_selection_mismatch',
      status: 'grid_failed',
      publicBaseUrl: context.publicBaseUrl,
      lockDetails: { selections },
      buildNextState: (nextAttempts) => ({
        ...current,
        grid: {
          ...(current?.grid || {}),
          attempts: nextAttempts,
          lastFailedAt: handlers.nowIso(),
        },
        updatedAt: handlers.nowIso(),
      }),
    },
    handlers,
  );
}
