import { hmacSha256Hex, timingSafeEqualText } from './crypto.js';

export function buildSliderSubmitProofPayload(state, slider, nonce) {
  return [
    Number(state?.userId || 0),
    String(state?.sessionToken || ''),
    String(slider?.type || 'slider'),
    String(slider?.seed || ''),
    String(slider?.createdAt || ''),
    String(nonce || ''),
  ].join(':');
}

export async function signSliderSubmitNonce(state, slider, nonce, secret) {
  return hmacSha256Hex(secret, buildSliderSubmitProofPayload(state, slider, nonce));
}

export async function buildSliderSubmitProof(state, slider, secret) {
  const nonce = String(slider?.submitNonce || '').trim();
  return {
    nonce,
    signature: await signSliderSubmitNonce(state, slider, nonce, secret),
  };
}

export async function validateSliderSubmitProof(context = {}) {
  const { state, slider, body, secret } = context;
  const nonce = String(body?.nonce || '').trim();
  const signature = String(body?.signature || '').trim();
  const expectedNonce = String(slider?.submitNonce || '').trim();
  if (!nonce || !signature || !expectedNonce) {
    return { ok: false, reason: 'proof_missing' };
  }
  if (!timingSafeEqualText(nonce, expectedNonce)) {
    return { ok: false, reason: 'proof_nonce_mismatch' };
  }

  const issuedAtMs = slider?.submitNonceIssuedAt ? new Date(slider.submitNonceIssuedAt).getTime() : 0;
  const maxAgeMs = Math.max(30 * 1000, Math.min(Number(context.sessionExpireMs), 10 * 60 * 1000));
  if (!issuedAtMs || Number(context.nowMs) - issuedAtMs > maxAgeMs) {
    return { ok: false, reason: 'proof_expired' };
  }

  const expectedSignature = await signSliderSubmitNonce(state, slider, nonce, secret);
  if (!timingSafeEqualText(signature, expectedSignature)) {
    return { ok: false, reason: 'proof_signature_mismatch' };
  }
  return { ok: true, reason: 'ok' };
}
