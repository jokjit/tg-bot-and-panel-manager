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
  for (const [id, result] of Object.entries(sourceResults)) {
    if (id === 'prepare') continue
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const sanitizedResult = { ...result }
      delete sanitizedResult.deployBootstrapToken
      results[id] = sanitizedResult
    } else {
      results[id] = result
    }
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
