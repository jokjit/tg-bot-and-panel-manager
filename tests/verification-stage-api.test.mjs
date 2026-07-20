import assert from 'node:assert/strict';
import test from 'node:test';

import { finalizeVerificationStageFailure } from '../worker-src/telegram/verification-stage-api.js';

function createHandlers(maxAttempts = 3) {
  const calls = [];
  return {
    calls,
    handlers: {
      getMaxAttempts: () => maxAttempts,
      lock: async (...args) => {
        calls.push(['lock', ...args]);
        return { ...args[1], stage: 'locked' };
      },
      saveState: async (...args) => { calls.push(['save', ...args]); },
      persistLatest: async (...args) => { calls.push(['persist', ...args]); },
      buildPayload: async (state, baseUrl) => ({ stage: state.stage, status: state.status, baseUrl }),
    },
  };
}

test('shared stage failure helper persists a retry and returns the stage failure', async () => {
  const { calls, handlers } = createHandlers();
  const result = await finalizeVerificationStageFailure({
    userId: 7,
    current: { choice: { attempts: 1 } },
    stage: 'choice',
    reason: 'mismatch',
    status: 'choice_failed',
    publicBaseUrl: 'https://worker.example.com',
    buildNextState: (attempts) => ({ choice: { attempts }, status: 'retry' }),
  }, handlers);

  assert.deepEqual(result, {
    stage: undefined,
    status: 'choice_failed',
    baseUrl: 'https://worker.example.com',
    reason: 'mismatch',
  });
  assert.equal(calls[0][0], 'save');
  assert.equal(calls[0][2].choice.attempts, 2);
  assert.deepEqual(calls[1].slice(0, 2), ['persist', 7]);
});

test('shared stage failure helper locks at the threshold and skips persistence', async () => {
  const { calls, handlers } = createHandlers(2);
  const result = await finalizeVerificationStageFailure({
    userId: 7,
    current: { grid: { attempts: 1 } },
    stage: 'grid',
    reason: 'selection_mismatch',
    status: 'grid_failed',
    lockDetails: { selections: [1, 4] },
    publicBaseUrl: 'https://worker.example.com',
    buildNextState: (attempts) => ({ grid: { attempts } }),
  }, handlers);

  assert.equal(result.stage, 'locked');
  assert.equal(calls[0][0], 'lock');
  assert.deepEqual(calls[0][3], {
    stage: 'grid',
    reason: 'selection_mismatch',
    selections: [1, 4],
  });
  assert.equal(calls.some((call) => call[0] === 'save' || call[0] === 'persist'), false);
});
