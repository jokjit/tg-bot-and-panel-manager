export async function handleAuthorizedAdminRoute(context = {}, handlers = {}) {
  const { request, url } = context;
  const pathname = `${handlers.getAdminApiPrefix()}/admins`;

  if (request.method === 'GET' && url.pathname === pathname) {
    await handlers.requireAdmin(request);
    const admins = await handlers.listAdmins(handlers.parseLimit(url.searchParams.get('limit'), 50));
    return handlers.json({ ok: true, admins }, 200, {}, request);
  }

  if (request.method === 'POST' && url.pathname === pathname) {
    await handlers.requireAdmin(request);
    const body = await handlers.readJsonBody(request);
    const action = String(body.action || '').trim().toLowerCase();
    const userId = handlers.toChatId(body.userId);
    const operator = handlers.getOperator(request);

    if (action === 'add') {
      const entry = await handlers.setAdmin(userId, {
        note: String(body.note || '').trim() || null,
        createdAt: await handlers.nowIso(),
        createdBy: operator,
      });
      return handlers.json({ ok: true, action, entry }, 200, {}, request);
    }
    if (action === 'remove') {
      await handlers.deleteAdmin(userId);
      return handlers.json({ ok: true, action, userId }, 200, {}, request);
    }
    throw handlers.createError(400, 'action 必须是 add 或 remove');
  }

  return null;
}
