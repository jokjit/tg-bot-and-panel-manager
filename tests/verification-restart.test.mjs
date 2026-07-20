import assert from 'node:assert/strict';
import test from 'node:test';

import { restartUserVerificationState } from '../worker-src/telegram/verification-restart.js';

test('verification restart removes the old prompt and resets all challenge fields', async () => {
  const calls = [];
  const existing = {
    promptMessageId: 44,
    verified: true,
    flowMode: 'graphic-two-step',
    stage: 'grid',
    sessionToken: 'session',
    slider: { attempts: 1 },
    grid: { attempts: 2 },
    choice: { attempts: 3 },
    challenge: { token: 'legacy' },
    failureCount: 4,
    customField: 'preserved',
  };
  const result = await restartUserVerificationState({
    userId: '7',
    operator: 'admin-1',
  }, {
    getState: async () => existing,
    deletePrompt: async (...args) => calls.push(['deletePrompt', ...args]),
    clearProfilePassed: async (...args) => calls.push(['clearProfile', ...args]),
    nowIso: async () => '2026-07-20T00:00:00.000Z',
    saveState: async (...args) => calls.push(['save', ...args]),
  });

  assert.equal(result.userId, 7);
  assert.equal(result.verified, false);
  assert.equal(result.promptMessageId, null);
  assert.equal(result.flowMode, null);
  assert.equal(result.stage, null);
  assert.equal(result.sessionToken, null);
  assert.equal(result.slider, null);
  assert.equal(result.grid, null);
  assert.equal(result.choice, null);
  assert.equal(result.challenge, null);
  assert.equal(result.failureCount, 0);
  assert.equal(result.customField, 'preserved');
  assert.equal(result.restartedBy, 'admin-1');
  assert.deepEqual(calls.map((call) => call[0]), ['deletePrompt', 'clearProfile', 'save']);
  assert.deepEqual(calls[0].slice(1), ['7', 44]);
  assert.equal(calls[2][3], existing);
});

test('verification restart works without an existing state or prompt', async () => {
  const calls = [];
  const result = await restartUserVerificationState({ userId: 8 }, {
    getState: async () => null,
    deletePrompt: async () => calls.push('deletePrompt'),
    clearProfilePassed: async () => calls.push('clearProfile'),
    nowIso: async () => '2026-07-20T00:00:00.000Z',
    saveState: async () => calls.push('save'),
  });

  assert.equal(result.restartedBy, 'unknown');
  assert.equal(result.updatedAt, '2026-07-20T00:00:00.000Z');
  assert.deepEqual(calls, ['clearProfile', 'save']);
});
