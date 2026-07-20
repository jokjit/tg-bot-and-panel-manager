const DEPLOY_BOOTSTRAP_CONSUMED_PREFIX = 'sys:deploy_bootstrap_consumed:';

export async function buildDeployBootstrapConsumptionKey(token) {
  const bytes = new TextEncoder().encode(String(token || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${DEPLOY_BOOTSTRAP_CONSUMED_PREFIX}${hex}`;
}
