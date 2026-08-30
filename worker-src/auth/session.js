export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;

export function parseCookies(cookieHeader) {
  const pairs = String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  const cookies = {};
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

export function buildSessionCookie(token, options = {}) {
  const sameSite = options.crossSite === false ? 'Strict' : 'None';
  return `admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${ADMIN_SESSION_TTL_SECONDS}`;
}

export function buildExpiredSessionCookie() {
  return 'admin_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0';
}
