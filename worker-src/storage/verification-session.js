export async function writeVerificationSessionToD1(context = {}, handlers = {}) {
  const snapshot = handlers.sanitizeState(context.state);
  if (!snapshot?.sessionToken || !(await handlers.ensureSchema())) return false;
  const now = await handlers.nowMs();
  return handlers.writeRecord({
    userId: context.userId,
    sessionToken: snapshot.sessionToken,
    stateJson: JSON.stringify(snapshot),
    expiresAt: snapshot.sessionExpiresAt
      || new Date(now + handlers.getSessionExpireMs()).toISOString(),
    updatedAt: new Date(now).toISOString(),
  });
}

export async function readVerificationSessionFromD1(context = {}, handlers = {}) {
  const token = context.token || '';
  const record = await handlers.readRecord(context.userId);
  if (!record?.stateJson) return null;
  if (token && !handlers.tokensEqual(String(token), String(record.sessionToken || ''))) return null;
  try {
    const state = JSON.parse(String(record.stateJson || '{}'));
    if (!handlers.isSessionUsable(state, token)) return null;
    handlers.writeLocal(context.userId, state);
    return state;
  } catch (error) {
    handlers.onParseError(error);
    return null;
  }
}

export async function persistLatestVerificationSessionState(context = {}, handlers = {}) {
  handlers.writeLocal(context.userId, context.state);
  await handlers.writeD1(context.userId, context.state);
}

export async function clearLatestVerificationSessionState(context = {}, handlers = {}) {
  handlers.clearLocal(context.userId);
  await handlers.clearD1(context.userId);
}

export async function getLatestVerificationSession(context = {}, handlers = {}) {
  const local = handlers.readLocal(context.userId, context.token || '');
  if (local) return local;
  return handlers.readD1(context.userId, context.token || '');
}
