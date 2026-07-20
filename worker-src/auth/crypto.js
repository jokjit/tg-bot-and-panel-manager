export function bytesToHex(bytes) {
  return Array.from(bytes || [], (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createRandomToken(byteLength = 16) {
  const bytes = new Uint8Array(Math.max(1, Math.floor(Number(byteLength) || 16)));
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function createSessionToken() {
  return createRandomToken(24);
}

export function createChallengeToken() {
  return `${Date.now().toString(36)}${createRandomToken(8)}`;
}

export async function hmacSha256Hex(secret, payload) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(String(payload || '')));
  return bytesToHex(new Uint8Array(signature));
}

export function timingSafeEqualText(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a || !b || a.length !== b.length) return false;

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}
