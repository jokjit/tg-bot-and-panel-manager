export async function dispatchAdminRoutes(context, handlers) {
  const { request, url, env, webhookPath, publicBaseUrl } = context;
  const candidates = [
    () => handlers.auth(request, url, env),
    () => handlers.system(request, url, env, webhookPath, publicBaseUrl),
    () => handlers.users(request, url, env),
    () => handlers.reply(request, url, env),
    () => handlers.blacklist(request, url, env),
    () => handlers.trust(request, url, env),
    () => (handlers.images ? handlers.images(request, url, env, publicBaseUrl) : null),
    () => handlers.authorizedAdmins(request, url, env),
    () => handlers.webhookManagement(request, url, env, webhookPath, publicBaseUrl),
  ];

  for (const candidate of candidates) {
    const response = await candidate();
    if (response) return response;
  }
  return null;
}
