import { bytesToHex, createRandomToken, timingSafeEqualText } from './crypto.js';

const PASSWORD_HASH_ALGORITHM = 'PBKDF2';
const PASSWORD_HASH_DIGEST = 'SHA-256';
const PASSWORD_HASH_PREFIX = 'pbkdf2-sha256';
const PASSWORD_HASH_ITERATIONS = 210000;
const PASSWORD_HASH_BYTES = 32;

function parseHashRecord(value) {
  const [prefix, iterationsRaw, saltHex, digestHex, extra] = String(value || '').split('$');
  const iterations = Number(iterationsRaw);
  if (
    extra !== undefined
    || prefix !== PASSWORD_HASH_PREFIX
    || !Number.isInteger(iterations)
    || iterations < 100000
    || !/^[0-9a-f]{32}$/i.test(saltHex || '')
    || !/^[0-9a-f]{64}$/i.test(digestHex || '')
  ) {
    return null;
  }
  return {
    iterations,
    saltHex: saltHex.toLowerCase(),
    digestHex: digestHex.toLowerCase(),
  };
}

function hexToBytes(value) {
  const hex = String(value || '');
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
}

async function derivePasswordDigest(password, saltHex, iterations) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(password || '')),
    PASSWORD_HASH_ALGORITHM,
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: PASSWORD_HASH_ALGORITHM,
      hash: PASSWORD_HASH_DIGEST,
      salt: hexToBytes(saltHex),
      iterations,
    },
    material,
    PASSWORD_HASH_BYTES * 8,
  );
  return bytesToHex(new Uint8Array(bits));
}

export function isPasswordHash(value) {
  return Boolean(parseHashRecord(value));
}

export async function hashPassword(password, options = {}) {
  const normalized = String(password || '');
  if (!normalized) throw new Error('password_required');
  const iterations = Number(options.iterations || PASSWORD_HASH_ITERATIONS);
  const saltHex = String(options.saltHex || createRandomToken(16)).toLowerCase();
  if (!Number.isInteger(iterations) || iterations < 100000 || !/^[0-9a-f]{32}$/i.test(saltHex)) {
    throw new Error('password_hash_options_invalid');
  }
  const digestHex = await derivePasswordDigest(normalized, saltHex, iterations);
  return `${PASSWORD_HASH_PREFIX}$${iterations}$${saltHex}$${digestHex}`;
}

export async function verifyPassword(password, encodedHash) {
  const record = parseHashRecord(encodedHash);
  if (!record || !String(password || '')) return false;
  const actual = await derivePasswordDigest(password, record.saltHex, record.iterations);
  return timingSafeEqualText(actual, record.digestHex);
}

export function passwordHashNeedsUpgrade(encodedHash) {
  const record = parseHashRecord(encodedHash);
  return Boolean(record && record.iterations < PASSWORD_HASH_ITERATIONS);
}
