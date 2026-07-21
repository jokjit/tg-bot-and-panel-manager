export async function handlePublicMediaRoute(context = {}, handlers = {}) {
  const { request, url } = context;
  const prefix = handlers.getMediaPrefix();
  if (!['GET', 'HEAD'].includes(request.method) || !url.pathname.startsWith(prefix)) return null;
  handlers.ensureBucket();

  let objectKey = '';
  try {
    objectKey = decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return new Response('Invalid image path', { status: 400 });
  }
  if (!handlers.isSafeKey(objectKey)) return new Response('Invalid image path', { status: 400 });

  const object = await handlers.getObject(objectKey);
  if (!object) return new Response('Image not found', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  if (!headers.has('content-type') && object.httpMetadata?.contentType) {
    headers.set('content-type', object.httpMetadata.contentType);
  }
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('access-control-allow-origin', '*');
  headers.set('x-content-type-options', 'nosniff');
  if (object.httpEtag || object.etag) headers.set('etag', object.httpEtag || object.etag);
  if (Number.isFinite(Number(object.size))) headers.set('content-length', String(object.size));
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}
