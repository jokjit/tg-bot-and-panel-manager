const assert = require('node:assert/strict')
const test = require('node:test')

const {
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
} = require('../electron-app/security.js')

test('Electron accepts only Cloudflare-compatible admin password hashes', () => {
  const salt = '00'.repeat(16)
  const digest = '11'.repeat(32)
  const supported = `pbkdf2-sha256$${ADMIN_PASSWORD_HASH_ITERATIONS}$${salt}$${digest}`
  const incompatible = `pbkdf2-sha256$210000$${salt}$${digest}`

  assert.equal(getAdminPasswordHashIterations(supported), 100000)
  assert.equal(isAdminPasswordHash(supported), true)
  assert.equal(isSupportedAdminPasswordHash(supported), true)
  assert.equal(isAdminPasswordHash(incompatible), true)
  assert.equal(isSupportedAdminPasswordHash(incompatible), false)
  assert.equal(isAdminPasswordHash('invalid'), false)
})

test('Electron account input keeps only bounded expected fields', () => {
  const result = normalizeAccountInput({
    name: '<img src=x onerror=alert(1)>',
    apiToken: ' token ',
    accountId: ' account ',
    email: ' user@example.com ',
    deployPrefs: { botToken: 'secret' },
    unexpected: true,
  })
  assert.deepEqual(result, {
    name: '<img src=x onerror=alert(1)>',
    apiToken: 'token',
    accountId: 'account',
    email: 'user@example.com',
  })
  assert.equal('unexpected' in result, false)
  assert.equal('deployPrefs' in result, false)
})

test('Electron action and external URL allowlists reject dangerous values', () => {
  assert.equal(isAllowedAction('first-deploy'), true)
  assert.equal(isAllowedAction('shell'), false)
  assert.equal(normalizeExternalHttpUrl('https://panel.example.com/admin'), 'https://panel.example.com/admin')
  assert.equal(normalizeExternalHttpUrl('javascript:alert(1)'), '')
  assert.equal(normalizeExternalHttpUrl('file:///C:/secret.txt'), '')
})

test('Electron reads bot configuration state from the Worker readiness endpoint', () => {
  assert.equal(
    buildWorkerReadinessUrl('https://worker.example.com/old/path?cache=1#status'),
    'https://worker.example.com/ready',
  )
  assert.equal(buildWorkerReadinessUrl('javascript:alert(1)'), '')

  assert.deepEqual(parseWorkerReadinessStatus({
    ok: true,
    status: 'ready',
    checks: { botToken: true, adminChatId: true, webhookSecret: true, kv: true },
  }), {
    valid: true,
    ready: true,
    hasToken: true,
    hasAdminChatId: true,
  })

  assert.deepEqual(parseWorkerReadinessStatus({
    ok: false,
    status: 'not_ready',
    checks: { botToken: true, adminChatId: true, webhookSecret: false, kv: true },
  }), {
    valid: true,
    ready: false,
    hasToken: true,
    hasAdminChatId: true,
  })

  assert.deepEqual(parseWorkerReadinessStatus({ ok: true }), {
    valid: false,
    ready: false,
    hasToken: false,
    hasAdminChatId: false,
  })
})

test('Electron deployment resume state never retains bootstrap credentials', () => {
  const state = sanitizeDeploymentResumeState({
    results: {
      prepare: { deployBootstrapToken: 'old-token' },
      worker: {
        workerUrl: 'https://worker.example.com',
        deployBootstrapToken: 'leaked-token',
        nested: { authorization: 'Bearer secret', resourceId: 'safe-id' },
      },
    },
    completedSteps: ['prepare', 'worker'],
  })

  assert.deepEqual(state, {
    results: {
      worker: {
        workerUrl: 'https://worker.example.com',
        nested: { resourceId: 'safe-id' },
      },
    },
    completedSteps: ['worker'],
  })
})
