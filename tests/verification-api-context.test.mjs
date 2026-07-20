import assert from 'node:assert/strict';
import test from 'node:test';

import { loadVerificationApiContext } from '../worker-src/telegram/verification-api-context.js';

function makeHandlers(state, latest = null) {
  const calls = [];
  return {
    calls,
    handlers: {
      parseIdentity: () => ({ userId: 7, token: 'token' }),
      getState: async () => state,
      getLatestSession: async () => latest,
      putState: async (...args) => { calls.push(['put', ...args]); },
      tokensEqual: (left, right) => left === right,
      isExpired: () => false,
      error: (status, message) => Object.assign(new Error(message), { status }),
    },
  };
}

test('verification API context restores latest state and marks verified sessions terminal', async () => {
  const { calls, handlers } = makeHandlers({ sessionToken: 'old' }, { sessionToken: 'token', verified: true });
  const result = await loadVerificationApiContext({ body: {} }, handlers);
  assert.equal(result.terminal, true);
  assert.equal(result.current.verified, true);
  assert.equal(calls[0][0], 'put');
});

test('verification API context rejects mismatched and expired sessions', async () => {
  const mismatch = makeHandlers({ sessionToken: 'other' });
  await assert.rejects(loadVerificationApiContext({ body: {} }, mismatch.handlers), (error) => error.status === 401);
  const expired = makeHandlers({ sessionToken: 'token' });
  expired.handlers.isExpired = () => true;
  await assert.rejects(loadVerificationApiContext({ body: {} }, expired.handlers), (error) => error.status === 410);
});
