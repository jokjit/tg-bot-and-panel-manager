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
const ADMIN_PASSWORD_HASH_ITERATIONS = 100000

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

function buildWorkerReadinessUrl(value) {
  const normalized = normalizeExternalHttpUrl(value)
  if (!normalized) return ''
  const parsed = new URL(normalized)
  parsed.pathname = '/ready'
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

function parseWorkerReadinessStatus(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const checks = source.checks && typeof source.checks === 'object' && !Array.isArray(source.checks)
    ? source.checks
    : null
  const valid = Boolean(
    checks
    && typeof checks.botToken === 'boolean'
    && typeof checks.adminChatId === 'boolean',
  )
  return {
    valid,
    ready: valid && source.ok === true && source.status === 'ready',
    hasToken: valid && checks.botToken === true,
    hasAdminChatId: valid && checks.adminChatId === true,
  }
}

function getAdminPasswordHashIterations(value) {
  const match = /^pbkdf2-sha256\$(\d+)\$[0-9a-f]{32}\$[0-9a-f]{64}$/i.exec(String(value || ''))
  if (!match) return 0
  const iterations = Number(match[1])
  return Number.isInteger(iterations) && iterations >= 100000 ? iterations : 0
}

function isAdminPasswordHash(value) {
  return getAdminPasswordHashIterations(value) > 0
}

function isSupportedAdminPasswordHash(value) {
  const iterations = getAdminPasswordHashIterations(value)
  return iterations > 0 && iterations <= ADMIN_PASSWORD_HASH_ITERATIONS
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
  ADMIN_PASSWORD_HASH_ITERATIONS,
  buildWorkerReadinessUrl,
  getAdminPasswordHashIterations,
  isAllowedAction,
  isAdminPasswordHash,
  isSupportedAdminPasswordHash,
  normalizeAccountInput,
  normalizeExternalHttpUrl,
  parseWorkerReadinessStatus,
  sanitizeDeploymentResumeState,
}
