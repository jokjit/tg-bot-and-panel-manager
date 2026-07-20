export const VERIFICATION_API_ROUTES = Object.freeze({
  SESSION: 'session',
  SLIDER: 'slider',
  GRID: 'grid',
  CHOICE: 'choice',
});

export function classifyVerificationApiRoute(pathname, prefix) {
  const route = pathname === `${prefix}/session`
    ? VERIFICATION_API_ROUTES.SESSION
    : pathname === `${prefix}/slider`
      ? VERIFICATION_API_ROUTES.SLIDER
      : pathname === `${prefix}/grid`
        ? VERIFICATION_API_ROUTES.GRID
        : pathname === `${prefix}/choice`
          ? VERIFICATION_API_ROUTES.CHOICE
          : null;
  return route;
}

export async function dispatchVerificationApiRoute(context, handlers) {
  const { pathname, prefix, env, body, publicBaseUrl } = context;
  const route = classifyVerificationApiRoute(pathname, prefix);
  if (!route) return null;

  return handlers[route](env, body, publicBaseUrl);
}
