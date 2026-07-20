async function handleModerationListRoute(context = {}, config = {}, handlers = {}) {
  const { request, url } = context;
  const pathname = `${handlers.getAdminApiPrefix()}/${config.path}`;

  if (request.method === 'GET' && url.pathname === pathname) {
    await handlers.requireAdmin(request);
    const page = await handlers.listPage({
      limit: handlers.parseLimit(url.searchParams.get('limit'), 50),
      offset: handlers.parseOffset(url.searchParams.get('offset'), 0),
    });
    return handlers.json({
      ok: true,
      [config.responseKey]: page.items,
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      nextOffset: page.nextOffset,
      prevOffset: page.prevOffset,
      hasMore: page.hasMore,
      source: page.source,
    }, 200, {}, request);
  }

  if (request.method === 'POST' && url.pathname === pathname) {
    await handlers.requireAdmin(request);
    const body = await handlers.readJsonBody(request);
    const action = String(body.action || '').trim().toLowerCase();
    const userId = handlers.toChatId(body.userId);
    const operator = handlers.getOperator(request);

    if (action === 'add') {
      const value = String(body[config.field] || config.defaultValue).trim() || config.defaultValue;
      const entry = await handlers.addEntry(userId, {
        [config.field]: value,
        createdAt: await handlers.nowIso(),
        createdBy: operator,
      });
      return handlers.json({ ok: true, action, entry }, 200, {}, request);
    }
    if (action === 'remove') {
      await handlers.deleteEntry(userId);
      return handlers.json({ ok: true, action, userId }, 200, {}, request);
    }
    throw handlers.createError(400, 'action 必须是 add 或 remove');
  }

  return null;
}

export function handleAdminBlacklistRoute(context = {}, handlers = {}) {
  return handleModerationListRoute(context, {
    path: 'blacklist',
    responseKey: 'blacklist',
    field: 'reason',
    defaultValue: '通过管理面板封禁',
  }, handlers);
}

export function handleAdminTrustRoute(context = {}, handlers = {}) {
  return handleModerationListRoute(context, {
    path: 'trust',
    responseKey: 'trust',
    field: 'note',
    defaultValue: '通过白名单面板设为信任用户',
  }, handlers);
}
