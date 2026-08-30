const DEPLOY_BOOTSTRAP_CONSUMED_PREFIX = 'sys:deploy_bootstrap_consumed:';
const deployBootstrapLocks = new Map();

export async function readDeployBootstrapToken(request) {
  const authorization = request?.headers?.get?.('authorization') || '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const headerToken = request?.headers?.get?.('x-deploy-bootstrap-token') || '';
  let bodyToken = '';

  try {
    const contentType = request?.headers?.get?.('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await request.json();
      bodyToken = String(body?.token || '').trim();
    }
  } catch {
    // Ignore malformed optional bodies; the header remains authoritative when present.
  }

  return String(headerToken || bearerToken || bodyToken || '').trim();
}

export async function buildDeployBootstrapConsumptionKey(token) {
  const bytes = new TextEncoder().encode(String(token || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${DEPLOY_BOOTSTRAP_CONSUMED_PREFIX}${hex}`;
}

// KV has no compare-and-set operation. Serialize requests sharing a Worker
// isolate so a successful bootstrap cannot be processed twice concurrently.
export async function withDeployBootstrapLock(token, task) {
  const key = await buildDeployBootstrapConsumptionKey(token);
  const previous = deployBootstrapLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  deployBootstrapLocks.set(key, current);

  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
    if (deployBootstrapLocks.get(key) === current) {
      deployBootstrapLocks.delete(key);
    }
  }
}
