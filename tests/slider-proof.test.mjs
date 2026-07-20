import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSliderSubmitProof,
  buildSliderSubmitProofPayload,
  validateSliderSubmitProof,
} from '../worker-src/auth/slider-proof.js';

const issuedAtMs = Date.parse('2026-07-20T00:00:00.000Z');
const state = { userId: 7, sessionToken: 'session-token' };
const slider = {
  type: 'rotation',
  seed: 'seed',
  createdAt: '2026-07-19T23:59:00.000Z',
  submitNonce: 'nonce',
  submitNonceIssuedAt: new Date(issuedAtMs).toISOString(),
};
const secret = 'proof-secret';

test('slider proof payload binds the user, session, challenge, and nonce', async () => {
  assert.equal(
    buildSliderSubmitProofPayload(state, slider, 'nonce'),
    '7:session-token:rotation:seed:2026-07-19T23:59:00.000Z:nonce',
  );
  const first = await buildSliderSubmitProof(state, slider, secret);
  const second = await buildSliderSubmitProof(state, slider, secret);
  assert.equal(first.nonce, 'nonce');
  assert.equal(first.signature, second.signature);
  assert.match(first.signature, /^[0-9a-f]{64}$/);
});

test('slider proof validation distinguishes missing, mismatched, and expired proofs', async () => {
  const base = {
    state,
    slider,
    secret,
    nowMs: issuedAtMs + 1000,
    sessionExpireMs: 15 * 60 * 1000,
  };
  assert.deepEqual(await validateSliderSubmitProof({ ...base, body: {} }), {
    ok: false,
    reason: 'proof_missing',
  });
  assert.deepEqual(await validateSliderSubmitProof({
    ...base,
    body: { nonce: 'other', signature: 'signature' },
  }), {
    ok: false,
    reason: 'proof_nonce_mismatch',
  });
  const proof = await buildSliderSubmitProof(state, slider, secret);
  assert.deepEqual(await validateSliderSubmitProof({
    ...base,
    nowMs: issuedAtMs + 10 * 60 * 1000 + 1,
    body: proof,
  }), {
    ok: false,
    reason: 'proof_expired',
  });
});

test('slider proof validation rejects altered signatures and accepts a current proof', async () => {
  const proof = await buildSliderSubmitProof(state, slider, secret);
  const base = {
    state,
    slider,
    secret,
    nowMs: issuedAtMs + 1000,
    sessionExpireMs: 15 * 60 * 1000,
  };
  assert.deepEqual(await validateSliderSubmitProof({
    ...base,
    body: { ...proof, signature: `${proof.signature.slice(0, -1)}0` },
  }), {
    ok: false,
    reason: 'proof_signature_mismatch',
  });
  assert.deepEqual(await validateSliderSubmitProof({ ...base, body: proof }), {
    ok: true,
    reason: 'ok',
  });
});
