import assert from 'node:assert/strict';
import test from 'node:test';

import { approveUserVerificationState } from '../worker-src/telegram/verification-approval.js';

test('admin approval persists the approved state before clearing and notifying', async () => {
  const calls = [];
  const existing = {
    userId: 7,
    promptMessageId: 44,
    stage: 'slider',
    sessionToken: 'session',
    sessionExpiresAt: 'expires',
    sessionIssuedAt: 'issued',
    choice: { answer: 2 },
    challenge: { stale: true },
  };
  const result = await approveUserVerificationState({
    userId: '7',
    operator: 'admin-1',
  }, {
    getState: async () => existing,
    nowIso: async () => '2026-07-20T00:00:00.000Z',
    markProfilePassed: async (...args) => calls.push(['profile', ...args]),
    getObserveMessageCount: async () => 5,
    saveState: async (...args) => calls.push(['save', ...args]),
    clearLatest: async (...args) => calls.push(['clear', ...args]),
    clearPrompt: async (...args) => calls.push(['prompt', ...args]),
    notifyUser: async (...args) => calls.push(['notify', ...args]),
  });

  assert.equal(result.verified, true);
  assert.equal(result.stage, 'passed');
  assert.equal(result.sessionToken, null);
  assert.equal(result.challenge, null);
  assert.equal(result.choice, null);
  assert.equal(result.postVerifyRemaining, 5);
  assert.equal(result.approvedBy, 'admin-1');
  assert.deepEqual(calls.map((call) => call[0]), ['profile', 'save', 'clear', 'prompt', 'notify']);
  assert.equal(calls[1][3], existing);
  assert.deepEqual(calls[3].slice(1), ['7', 44]);
});

test('admin approval can retain the verification session and skip user notification', async () => {
  const calls = [];
  const existing = {
    stage: 'choice',
    sessionToken: 'session',
    sessionExpiresAt: 'expires',
    sessionIssuedAt: 'issued',
    choice: { answer: 1 },
  };
  const result = await approveUserVerificationState({
    userId: 8,
    operator: 'system',
    options: { keepSession: true, notifyUser: false },
  }, {
    getState: async () => existing,
    nowIso: async () => '2026-07-20T00:00:00.000Z',
    markProfilePassed: async () => {},
    getObserveMessageCount: async () => 0,
    saveState: async (...args) => calls.push(['save', ...args]),
    clearLatest: async () => {},
    clearPrompt: async () => {},
    notifyUser: async () => { throw new Error('must not notify'); },
  });

  assert.equal(result.stage, 'choice');
  assert.equal(result.sessionToken, 'session');
  assert.equal(result.sessionExpiresAt, 'expires');
  assert.deepEqual(result.choice, { answer: 1 });
  assert.equal(calls.length, 1);
});

test('approval survives a user notification failure after persistence', async () => {
  const calls = [];
  const result = await approveUserVerificationState({ userId: 9 }, {
    getState: async () => ({}),
    nowIso: async () => '2026-07-20T00:00:00.000Z',
    markProfilePassed: async () => {},
    getObserveMessageCount: async () => 1,
    saveState: async () => calls.push('save'),
    clearLatest: async () => calls.push('clear'),
    clearPrompt: async () => {},
    notifyUser: async () => { calls.push('notify'); throw new Error('Telegram unavailable'); },
  });

  assert.equal(result.verified, true);
  assert.deepEqual(calls, ['save', 'clear', 'notify']);
});
