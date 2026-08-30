const assert = require('node:assert/strict')
const test = require('node:test')

const {
  isAllowedAction,
  normalizeAccountInput,
  normalizeExternalHttpUrl,
} = require('../electron-app/security.js')

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
