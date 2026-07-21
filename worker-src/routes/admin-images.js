export async function handleAdminImageRoute(context = {}, handlers = {}) {
  const { request, url, publicBaseUrl } = context;
  const prefix = `${handlers.getAdminApiPrefix()}/images`;

  if (request.method === 'GET' && url.pathname === prefix) {
    await handlers.requireAdmin(request);
    handlers.ensureBindings();
    const page = await handlers.listPage({
      limit: handlers.parseLimit(url.searchParams.get('limit'), 24),
      offset: handlers.parseOffset(url.searchParams.get('offset'), 0),
    });
    return handlers.json({
      ok: true,
      images: page.items.map((item) => handlers.buildView(item, publicBaseUrl)),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      nextOffset: page.nextOffset,
      prevOffset: page.prevOffset,
      hasMore: page.hasMore,
    }, 200, {}, request);
  }

  if (request.method === 'POST' && url.pathname === prefix) {
    await handlers.requireAdmin(request);
    handlers.ensureBindings();
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') throw handlers.createError(400, '请先选择要上传的图片');
    try {
      const asset = await handlers.store(file, handlers.getOperator(request));
      return handlers.json({ ok: true, image: handlers.buildView(asset, publicBaseUrl) }, 201, {}, request);
    } catch (error) {
      throw handlers.mapUploadError(error);
    }
  }

  const detailPrefix = `${prefix}/`;
  if (request.method === 'DELETE' && url.pathname.startsWith(detailPrefix)) {
    await handlers.requireAdmin(request);
    handlers.ensureBindings();
    const id = decodeURIComponent(url.pathname.slice(detailPrefix.length));
    if (!handlers.isValidId(id)) throw handlers.createError(400, '图片 ID 无效');
    const asset = await handlers.remove(id);
    if (!asset) throw handlers.createError(404, '图片不存在');
    return handlers.json({ ok: true, image: handlers.buildView(asset, publicBaseUrl) }, 200, {}, request);
  }

  return null;
}
