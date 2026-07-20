export async function loadVerificationApiContext(context = {}, handlers = {}) {
  const { userId, token } = handlers.parseIdentity(context.body);
  let current = await handlers.getState(userId);
  const latestState = await handlers.getLatestSession(userId, token);
  if (latestState && (!current?.sessionToken || !handlers.tokensEqual(token, current.sessionToken))) {
    await handlers.putState(userId, latestState, current || null);
    current = latestState;
  }
  if (!current?.sessionToken || !handlers.tokensEqual(token, current.sessionToken)) {
    throw handlers.error(401, '验证会话不匹配');
  }
  if (current.verified) return { userId, token, current, terminal: true };
  if (handlers.isExpired(current)) throw handlers.error(410, '验证会话已过期');
  return { userId, token, current, terminal: false };
}
