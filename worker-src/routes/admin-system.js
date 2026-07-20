export async function handleAdminSystemRoute(context = {}, handlers = {}) {
  const { request, url, webhookPath, publicBaseUrl } = context;
  const prefix = handlers.getAdminApiPrefix();

  if (request.method === 'GET' && url.pathname === `${prefix}/status`) {
    await handlers.requireAdmin(request);
    return handlers.json(
      await handlers.getStatus(url, webhookPath, publicBaseUrl),
      200,
      {},
      request,
    );
  }

  if (request.method === 'GET' && url.pathname === `${prefix}/system-config`) {
    await handlers.requireAdmin(request);
    const config = handlers.buildSystemConfigView(await handlers.getEffectiveSystemConfig());
    return handlers.json({ ok: true, config }, 200, {}, request);
  }

  if (request.method === 'POST' && url.pathname === `${prefix}/system-config`) {
    await handlers.requireAdmin(request);
    const body = await handlers.readJsonBody(request);
    const updated = await handlers.updateSystemConfig(body);
    const config = handlers.buildSystemConfigView(await handlers.getEffectiveSystemConfig());
    return handlers.json({
      ok: true,
      config,
      profileMetaSynced: Boolean(updated?.metaSync?.synced),
      profileMetaSyncError: updated?.metaSync?.error || null,
    }, 200, {}, request);
  }

  if (request.method === 'POST' && url.pathname === `${prefix}/maintenance/cleanup`) {
    await handlers.requireAdmin(request);
    const body = await handlers.readJsonBody(request);
    const result = await handlers.runDataCleanup({
      retentionDays: body?.retentionDays,
      batchSize: body?.batchSize,
      source: 'admin-api',
      force: true,
    });
    return handlers.json({ ok: true, result }, 200, {}, request);
  }

  if (request.method === 'POST' && url.pathname === `${prefix}/maintenance/deleted-account-sweep`) {
    await handlers.requireAdmin(request);
    const body = await handlers.readJsonBody(request);
    const result = await handlers.runDeletedAccountSweep({
      batchSize: body?.batchSize,
      source: 'admin-api',
      force: true,
    });
    return handlers.json({ ok: true, result }, 200, {}, request);
  }

  if (request.method === 'POST' && url.pathname === `${prefix}/maintenance/directory-index-backfill`) {
    await handlers.requireAdmin(request);
    const body = await handlers.readJsonBody(request);
    const result = await handlers.runDirectoryIndexBackfill({
      batchSize: body?.batchSize,
      reset: Boolean(body?.reset),
      source: 'admin-api',
    });
    return handlers.json({ ok: true, result }, 200, {}, request);
  }

  return null;
}
