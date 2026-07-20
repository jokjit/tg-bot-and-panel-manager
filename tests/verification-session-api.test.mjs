import assert from 'node:assert/strict';
import test from 'node:test';

import { handleVerificationSessionApiRequest } from '../worker-src/telegram/verification-session-api.js';

function createHandlers(state, latestState = null) {
  const calls = [];
  return {
    calls,
    handlers: {
      parseIdentity: () => ({ userId: 7, token: 'token' }),
      getState: async () => state,
      getLatestSession: async () => latestState,
      putState: async (...args) => { calls.push(['put', ...args]); },
      tokensEqual: (left, right) => left === right,
      now: () => 100,
      isExpired: () => false,
      ensureProof: async (userId, value) => { calls.push(['proof', userId]); return value; },
      buildPayload: (value, baseUrl) => ({ userId: value.userId, baseUrl }),
      error: (status, message) => Object.assign(new Error(message), { status }),
    },
  };
}

test('verification session API restores a newer D1 session and builds payload', async () => {
  const { calls, handlers } = createHandlers({ userId: 7, sessionToken: 'old' }, { userId: 7, sessionToken: 'token' });
  const result = await handleVerificationSessionApiRequest({ body: {}, publicBaseUrl: 'https://worker.example.com' }, handlers);
  assert.deepEqual(result, { userId: 7, baseUrl: 'https://worker.example.com' });
  assert.equal(calls[0][0], 'put');
  assert.deepEqual(calls[1], ['proof', 7]);
});

test('verification session API reports missing, verified, mismatched, and expired sessions', async () => {
  for (const setup of [
    [null, 401],
    [{ verified: true, sessionToken: 'token' }, 410],
    [{ sessionToken: 'other' }, 401],
  ]) {
    const { handlers } = createHandlers(setup[0]);
    await assert.rejects(
      handleVerificationSessionApiRequest({ body: {} }, handlers),
      (error) => error.status === setup[1],
    );
  }
  const { handlers } = createHandlers({ userId: 7, sessionToken: 'token', blockedUntil: 200 });
  handlers.now = () => 100;
  assert.deepEqual(await handleVerificationSessionApiRequest({ body: {} }, handlers), { userId: 7, baseUrl: undefined });
  const expired = createHandlers({ sessionToken: 'token' });
  expired.handlers.isExpired = () => true;
  await assert.rejects(handleVerificationSessionApiRequest({ body: {} }, expired.handlers), (error) => error.status === 410);
});
