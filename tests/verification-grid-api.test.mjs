import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareIndexSets,
  handleVerificationGridApiRequest,
  normalizeExpectedGridIndices,
  normalizeSubmittedGridIndices,
} from '../worker-src/telegram/verification-grid-api.js';

function createHandlers(session, maxAttempts = 3) {
  const calls = [];
  return {
    calls,
    handlers: {
      loadContext: async () => session,
      buildPayload: async (state, baseUrl) => ({ stage: state?.stage, verified: state?.verified, baseUrl }),
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

test('grid API normalizes submitted and expected indices without changing set semantics', () => {
  assert.deepEqual(normalizeSubmittedGridIndices(['2', 1, 2, -1, 9, 1.5, 'bad']), [2, 1]);
  assert.deepEqual(normalizeExpectedGridIndices(['8', -1, 1.5, 'bad']), [8, -1]);
  assert.equal(compareIndexSets([8, 2, 5], [5, 8, 2]), true);
  assert.equal(compareIndexSets([8, 2], [8, 2, 2]), false);
});

test('grid API returns terminal and non-grid session payloads without mutation', async () => {
  for (const session of [
    { userId: 7, terminal: true, current: { stage: 'grid', verified: true } },
    { userId: 7, terminal: false, current: { stage: 'choice' } },
  ]) {
    const { calls, handlers } = createHandlers(session);
    const result = await handleVerificationGridApiRequest(
      { body: { selections: [1] }, publicBaseUrl: 'https://worker.example.com' },
      handlers,
    );
    assert.equal(result.stage, session.current.stage);
    assert.equal(result.baseUrl, 'https://worker.example.com');
    assert.deepEqual(calls, []);
  }
});

test('grid API approves matching selections regardless of order and duplicates', async () => {
  const current = { stage: 'grid', grid: { targetIndices: [5, 2], attempts: 1 } };
  const { calls, handlers } = createHandlers({ userId: 7, terminal: false, current });
  const result = await handleVerificationGridApiRequest({ body: { selections: ['2', 5, 2] } }, handlers);

  assert.equal(result.verified, true);
  assert.deepEqual(calls, [[
    'approve',
    7,
    'web-verification',
    { notifyUser: true, keepSession: false },
  ]]);
});

test('grid API records a failed attempt before the lock threshold', async () => {
  const current = { stage: 'grid', grid: { targetIndices: [2, 5], attempts: 1 } };
  const { calls, handlers } = createHandlers({ userId: 7, terminal: false, current });
  const result = await handleVerificationGridApiRequest({ body: { selections: [2, 4] } }, handlers);

  assert.equal(result.status, 'grid_failed');
  assert.equal(result.reason, 'grid_selection_mismatch');
  assert.equal(calls[0][0], 'save');
  assert.equal(calls[0][2].grid.attempts, 2);
  assert.equal(calls[0][2].grid.lastFailedAt, '2026-07-20T00:00:00.000Z');
  assert.deepEqual(calls[1].slice(0, 2), ['persist', 7]);
});

test('grid API locks a session with normalized selections at the attempt limit', async () => {
  const current = { stage: 'grid', grid: { targetIndices: [2, 5], attempts: 2 } };
  const { calls, handlers } = createHandlers({ userId: 7, terminal: false, current });
  const result = await handleVerificationGridApiRequest(
    { body: { selections: ['4', 4, 9, -1] } },
    handlers,
  );

  assert.equal(result.stage, 'locked');
  assert.equal(calls[0][0], 'lock');
  assert.equal(calls[0][2].grid.attempts, 3);
  assert.deepEqual(calls[0][3], {
    stage: 'grid',
    reason: 'grid_selection_mismatch',
    selections: [4],
  });
  assert.equal(calls.some((call) => call[0] === 'save' || call[0] === 'persist'), false);
});
