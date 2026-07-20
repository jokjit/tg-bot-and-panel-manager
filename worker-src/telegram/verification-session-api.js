export async function handleVerificationSessionApiRequest(context = {}, handlers = {}) {
  const { userId, token } = handlers.parseIdentity(context.body);
  let state = await handlers.getState(userId);
  const latestState = await handlers.getLatestSession(userId, token);
  if (latestState && (!state?.sessionToken || !handlers.tokensEqual(token, state.sessionToken))) {
    await handlers.putState(userId, latestState, state || null);
    state = latestState;
  }
  if (!state) throw handlers.error(401, '验证会话不存在');
  if (state.verified) throw handlers.error(410, '验证链接已失效，请返回 Telegram 点击最新验证按钮。');
  if (!state.sessionToken) throw handlers.error(401, '验证会话不存在');
  if (!handlers.tokensEqual(token, state.sessionToken)) throw handlers.error(401, '验证会话不匹配');

  const blockedUntilMs = state.blockedUntil ? new Date(state.blockedUntil).getTime() : 0;
  if (blockedUntilMs && blockedUntilMs > handlers.now()) {
    return handlers.buildPayload(state, context.publicBaseUrl);
  }
  if (handlers.isExpired(state)) {
    throw handlers.error(410, '验证会话已过期，请返回 Telegram 重新获取最新验证按钮。');
  }
  state = await handlers.ensureProof(userId, state);
  return handlers.buildPayload(state, context.publicBaseUrl);
}
