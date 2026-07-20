export async function handleAdminUserRoute(context = {}, handlers = {}) {
  const { request, url } = context;
  const prefix = handlers.getAdminApiPrefix();

  if (request.method === 'GET' && url.pathname === `${prefix}/users`) {
    await handlers.requireAdmin(request);
    const limit = handlers.parseLimit(url.searchParams.get('limit'), 50);
    const offset = handlers.parseOffset(url.searchParams.get('offset'), 0);
    const page = await handlers.listUsersPage({ limit, offset });
    return handlers.json({
      ok: true,
      users: page.items,
      summary: page.summary,
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      nextOffset: page.nextOffset,
      prevOffset: page.prevOffset,
      hasMore: page.hasMore,
      source: page.source || 'kv',
    }, 200, {}, request);
  }

  if (request.method === 'GET' && url.pathname === `${prefix}/history`) {
    await handlers.requireAdmin(request);
    const userIdRaw = url.searchParams.get('userId');
    const limit = handlers.parseLimit(url.searchParams.get('limit'), 50);
    const userId = userIdRaw ? handlers.toChatId(userIdRaw) : null;
    const beforeId = handlers.parsePositiveInt(url.searchParams.get('beforeId'), 0);
    const query = String(url.searchParams.get('q') || '').trim();
    const direction = String(url.searchParams.get('direction') || '').trim().toLowerCase();
    const messageType = String(url.searchParams.get('messageType') || '').trim().toLowerCase();
    const history = await handlers.listMessageHistory({
      userId,
      limit,
      beforeId,
      query,
      direction,
      messageType,
    });
    return handlers.json({ ok: true, ...history }, 200, {}, request);
  }

  if (request.method === 'GET' && url.pathname === `${prefix}/avatar`) {
    await handlers.requireAdmin(request);
    return handlers.handleAvatarProxy(request);
  }

  if (request.method === 'POST' && url.pathname === `${prefix}/welcome-media/upload`) {
    await handlers.requireAdmin(request);
    handlers.ensureUploadEnvironment();
    const form = await request.formData();
    const type = String(form.get('type') || '').trim().toLowerCase();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      throw handlers.createError(400, '请先选择要上传的文件');
    }
    const result = await handlers.uploadWelcomeMedia(type, file);
    return handlers.json({ ok: true, result }, 200, {}, request);
  }

  if (request.method === 'POST' && url.pathname === `${prefix}/users/action`) {
    await handlers.requireAdmin(request);
    const body = await handlers.readJsonBody(request);
    const action = String(body.action || '').trim().toLowerCase();
    const userId = handlers.toChatId(body.userId);
    const operator = handlers.getOperator(request);

    if (action === 'ban') {
      const entry = await handlers.setBlacklist(userId, {
        reason: String(body.reason || '通过用户管理封禁').trim() || '通过用户管理封禁',
        createdAt: await handlers.nowIso(),
        createdBy: operator,
      });
      return handlers.json({ ok: true, action, entry }, 200, {}, request);
    }
    if (action === 'unban') {
      await handlers.deleteBlacklist(userId);
      return handlers.json({ ok: true, action, userId }, 200, {}, request);
    }
    if (action === 'trust') {
      const entry = await handlers.setTrust(userId, {
        note: String(body.note || '通过用户管理设为信任用户').trim() || '通过用户管理设为信任用户',
        createdAt: await handlers.nowIso(),
        createdBy: operator,
      });
      return handlers.json({ ok: true, action, entry }, 200, {}, request);
    }
    if (action === 'untrust') {
      await handlers.deleteTrust(userId);
      return handlers.json({ ok: true, action, userId }, 200, {}, request);
    }
    if (action === 'restart') {
      const state = await handlers.restartVerification(userId, operator);
      return handlers.json({ ok: true, action, state }, 200, {}, request);
    }
    if (action === 'verifypass') {
      const state = await handlers.approveVerification(userId, operator, { notifyUser: true });
      return handlers.json({ ok: true, action, state }, 200, {}, request);
    }
    if (action === 'delete') {
      const result = await handlers.purgeUser(userId);
      return handlers.json({ ok: true, action, userId, result }, 200, {}, request);
    }

    throw handlers.createError(400, 'action 必须是 ban / unban / trust / untrust / restart / verifypass / delete');
  }

  return null;
}
