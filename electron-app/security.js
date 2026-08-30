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

function sanitizeDeploymentResumeState(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const sourceResults = source.results && typeof source.results === 'object' && !Array.isArray(source.results)
    ? source.results
    : {}
  const results = {}
  const sanitizeValue = (input) => {
    if (Array.isArray(input)) return input.map(sanitizeValue)
    if (!input || typeof input !== 'object') return input
    const output = {}
    for (const [key, nested] of Object.entries(input)) {
      if (/(token|secret|password|authorization|admin.?chat)/i.test(key)) continue
      output[key] = sanitizeValue(nested)
    }
    return output
  }
  for (const [id, result] of Object.entries(sourceResults)) {
    if (id === 'prepare') continue
    results[id] = sanitizeValue(result)
  }
  const completedSteps = Array.isArray(source.completedSteps)
    ? source.completedSteps.filter((step) => String(step || '').trim() !== 'prepare')
    : []
  return { results, completedSteps }
}

module.exports = {
  isAllowedAction,
  normalizeAccountInput,
  normalizeExternalHttpUrl,
  sanitizeDeploymentResumeState,
}
