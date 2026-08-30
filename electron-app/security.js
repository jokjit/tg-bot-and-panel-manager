const ALLOWED_ACTIONS = new Set([
  'show-config',
  'merge-config',
  'setup-d1',
  'setup-kv',
  'deploy-worker',
  'deploy-panel',
  'deploy-all',
  'first-deploy',
])

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeAccountInput(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    name: normalizeText(source.name, 100),
    apiToken: normalizeText(source.apiToken, 4096),
    accountId: normalizeText(source.accountId, 128),
    email: normalizeText(source.email, 254),
  }
}

function isAllowedAction(action) {
  return ALLOWED_ACTIONS.has(String(action || ''))
}

function normalizeExternalHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim())
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : ''
  } catch {
    return ''
  }
}

module.exports = {
  isAllowedAction,
  normalizeAccountInput,
  normalizeExternalHttpUrl,
}
