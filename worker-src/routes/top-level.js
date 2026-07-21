export const TOP_LEVEL_ROUTES = Object.freeze({
  STATUS: 'status',
  HEALTH: 'health',
  VERIFY_IMAGE: 'verify_image',
  VERIFY_WEB: 'verify_web',
  VERIFY_API: 'verify_api',
  MEDIA: 'media',
  DEPLOY_BOOTSTRAP: 'deploy_bootstrap',
  ADMIN_ENTRY: 'admin_entry',
});

export function classifyTopLevelRoute(method, pathname, paths) {
  if (method === 'GET' && pathname === '/') return TOP_LEVEL_ROUTES.STATUS;
  if (method === 'GET' && pathname === '/health') return TOP_LEVEL_ROUTES.HEALTH;
  if (method === 'GET' && pathname === paths.verifyImage) return TOP_LEVEL_ROUTES.VERIFY_IMAGE;
  if (method === 'GET' && pathname === paths.verifyWeb) return TOP_LEVEL_ROUTES.VERIFY_WEB;
  if (method === 'POST' && pathname.startsWith(paths.verifyApiPrefix)) return TOP_LEVEL_ROUTES.VERIFY_API;
  if (['GET', 'HEAD'].includes(method) && pathname.startsWith(paths.mediaPrefix)) return TOP_LEVEL_ROUTES.MEDIA;
  if (method === 'POST' && pathname === '/deploy/bootstrap') return TOP_LEVEL_ROUTES.DEPLOY_BOOTSTRAP;
  if (method === 'GET' && pathname === paths.adminPanel) return TOP_LEVEL_ROUTES.ADMIN_ENTRY;
  return null;
}
