import assert from 'node:assert/strict';
import test from 'node:test';

import { handleVerificationSliderApiRequest } from '../worker-src/telegram/verification-slider-api.js';

function createHandlers(session, options = {}) {
  const calls = [];
  return {
    calls,
    handlers: {
      loadContext: async () => session,
      buildPayload: async (state, baseUrl) => ({
        stage: state?.stage,
        nonce: state?.slider?.submitNonce,
        baseUrl,
      }),
      ensureProof: async (userId, state) => {
        calls.push(['ensureProof', userId, state]);
        if (state?.slider?.submitNonce) return state;
        return {
          ...state,
          slider: { ...state.slider, submitNonce: 'issued-proof', submitNonceIssuedAt: 'issued-at' },
        };
      },
      validateAttempt: async (...args) => {
        calls.push(['validate', ...args]);
        return options.validation || { ok: false, reason: 'trace_too_short' };
      },
      nowMs: () => Date.parse('2026-07-20T00:00:00.000Z'),
      getSessionExpireMs: () => 15 * 60 * 1000,
      nowIso: () => '2026-07-20T00:00:00.000Z',
      createNonce: () => 'next-proof',
      getMaxAttempts: () => options.maxAttempts || 3,
      lock: async (...args) => {
        calls.push(['lock', ...args]);
        return { ...args[1], stage: 'locked' };
      },
      saveState: async (...args) => { calls.push(['save', ...args]); },
      persistLatest: async (...args) => { calls.push(['persist', ...args]); },
    },
  };
}

test('slider API returns terminal and non-slider payloads without proof mutation', async () => {
  for (const session of [
    { userId: 7, terminal: true, current: { stage: 'slider' } },
    { userId: 7, terminal: false, current: { stage: 'grid' } },
  ]) {
    const { calls, handlers } = createHandlers(session);
    const result = await handleVerificationSliderApiRequest(
      { body: {}, publicBaseUrl: 'https://worker.example.com' },
      handlers,
    );
    assert.equal(result.stage, session.current.stage);
    assert.equal(result.baseUrl, 'https://worker.example.com');
    assert.deepEqual(calls, []);
  }
});

test('slider API issues a missing proof before requiring a signed submission', async () => {
  const current = { stage: 'slider', slider: { attempts: 0 } };
  const { calls, handlers } = createHandlers({ userId: 7, terminal: false, current });
  const result = await handleVerificationSliderApiRequest({ body: {} }, handlers);

  assert.equal(result.status, 'slider_failed');
  assert.equal(result.reason, 'proof_missing');
  assert.equal(result.nonce, 'issued-proof');
  assert.equal(calls[0][0], 'ensureProof');
  assert.equal(calls.some((call) => call[0] === 'validate'), false);
});

test('slider API advances a valid session and consumes its submit proof', async () => {
  const current = {
    stage: 'slider',
    slider: { attempts: 1, submitNonce: 'proof', submitNonceIssuedAt: 'issued-at' },
  };
  const { calls, handlers } = createHandlers(
    { userId: 7, terminal: false, current },
    { validation: { ok: true } },
  );
  const result = await handleVerificationSliderApiRequest({ body: { nonce: 'proof', signature: 'sig' } }, handlers);

  assert.equal(result.stage, 'grid');
  const saved = calls.find((call) => call[0] === 'save');
  assert.equal(saved[2].slider.submitNonce, null);
  assert.equal(saved[2].slider.submitNonceIssuedAt, null);
  assert.equal(saved[2].sessionExpiresAt, '2026-07-20T00:15:00.000Z');
  assert.deepEqual(calls.find((call) => call[0] === 'persist').slice(0, 2), ['persist', 7]);
});

test('slider API rotates proof and records a failed attempt before the lock threshold', async () => {
  const current = { stage: 'slider', slider: { attempts: 1, submitNonce: 'proof' } };
  const { calls, handlers } = createHandlers({ userId: 7, terminal: false, current });
  const result = await handleVerificationSliderApiRequest({ body: { nonce: 'proof', signature: 'bad' } }, handlers);

  assert.equal(result.status, 'slider_failed');
  assert.equal(result.reason, 'trace_too_short');
  assert.equal(result.nonce, 'next-proof');
  const saved = calls.find((call) => call[0] === 'save');
  assert.equal(saved[2].slider.attempts, 2);
  assert.equal(saved[2].slider.lastReason, 'trace_too_short');
  assert.equal(saved[2].slider.lastFailedAt, '2026-07-20T00:00:00.000Z');
});

test('slider API locks the session when validation reaches the attempt limit', async () => {
  const current = { stage: 'slider', slider: { attempts: 2, submitNonce: 'proof' } };
  const { calls, handlers } = createHandlers({ userId: 7, terminal: false, current });
  const result = await handleVerificationSliderApiRequest({ body: { nonce: 'proof', signature: 'bad' } }, handlers);

  assert.equal(result.stage, 'locked');
  const locked = calls.find((call) => call[0] === 'lock');
  assert.equal(locked[2].slider.attempts, 3);
  assert.equal(locked[2].slider.submitNonce, 'next-proof');
  assert.deepEqual(locked[3], { stage: 'slider', reason: 'trace_too_short' });
  assert.equal(calls.some((call) => call[0] === 'save' || call[0] === 'persist'), false);
});
