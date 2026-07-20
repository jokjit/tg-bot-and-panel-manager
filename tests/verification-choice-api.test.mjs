import assert from 'node:assert/strict';
import test from 'node:test';

import { handleVerificationChoiceApiRequest } from '../worker-src/telegram/verification-choice-api.js';

function createHandlers(session, maxAttempts = 3) {
  const calls = [];
  return {
    calls,
    handlers: {
      loadContext: async () => session,
      buildPayload: async (state, baseUrl) => ({ stage: state?.stage, verified: state?.verified, baseUrl }),
      answersEqual: (left, right) => left === right,
      approve: async (...args) => {
        calls.push(['approve', ...args]);
        return { stage: 'complete', verified: true };
      },
      getMaxAttempts: () => maxAttempts,
      nowIso: () => '2026-07-20T00:00:00.000Z',
      lock: async (...args) => {
        calls.push(['lock', ...args]);
        return { ...args[1], stage: 'locked' };
      },
      saveState: async (...args) => { calls.push(['save', ...args]); },
      persistLatest: async (...args) => { calls.push(['persist', ...args]); },
    },
  };
}

test('choice API returns terminal and non-choice session payloads without mutation', async () => {
  for (const session of [
    { userId: 7, terminal: true, current: { stage: 'choice', verified: true } },
    { userId: 7, terminal: false, current: { stage: 'grid' } },
  ]) {
    const { calls, handlers } = createHandlers(session);
    const result = await handleVerificationChoiceApiRequest(
      { body: { answer: '4' }, publicBaseUrl: 'https://worker.example.com' },
      handlers,
    );
    assert.equal(result.stage, session.current.stage);
    assert.equal(result.baseUrl, 'https://worker.example.com');
    assert.deepEqual(calls, []);
  }
});

test('choice API approves a matching non-empty answer', async () => {
  const session = {
    userId: 7,
    terminal: false,
    current: { stage: 'choice', choice: { correct: ' 42 ', attempts: 1 } },
  };
  const { calls, handlers } = createHandlers(session);
  const result = await handleVerificationChoiceApiRequest({ body: { answer: ' 42 ' } }, handlers);

  assert.equal(result.verified, true);
  assert.deepEqual(calls, [[
    'approve',
    7,
    'web-verification',
    { notifyUser: true, keepSession: false },
  ]]);
});

test('choice API records a failed attempt before the lock threshold', async () => {
  const current = { stage: 'choice', choice: { correct: '42', attempts: 1 } };
  const { calls, handlers } = createHandlers({ userId: 7, terminal: false, current });
  const result = await handleVerificationChoiceApiRequest({ body: { answer: ' 13 ' } }, handlers);

  assert.equal(result.status, 'choice_failed');
  assert.equal(result.reason, 'choice_selection_mismatch');
  assert.equal(calls[0][0], 'save');
  assert.equal(calls[0][2].choice.attempts, 2);
  assert.equal(calls[0][2].selectedAnswer, '13');
  assert.equal(calls[0][2].correctAnswer, '42');
  assert.equal(calls[0][2].updatedAt, '2026-07-20T00:00:00.000Z');
  assert.deepEqual(calls[1].slice(0, 2), ['persist', 7]);
});

test('choice API locks a session when the failed-attempt limit is reached', async () => {
  const current = { stage: 'choice', choice: { correct: '42', attempts: 2 } };
  const { calls, handlers } = createHandlers({ userId: 7, terminal: false, current });
  const result = await handleVerificationChoiceApiRequest({ body: { answer: '' } }, handlers);

  assert.equal(result.stage, 'locked');
  assert.equal(calls[0][0], 'lock');
  assert.equal(calls[0][2].choice.attempts, 3);
  assert.deepEqual(calls[0][3], {
    stage: 'choice',
    reason: 'choice_selection_mismatch',
    selectedAnswer: '',
  });
  assert.equal(calls.some((call) => call[0] === 'save' || call[0] === 'persist'), false);
});
