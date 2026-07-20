import { normalizeIsoTime } from '../utils/time.js';

export function normalizeD1VerificationStatusRecord(record) {
  if (!record) return null;
  return {
    userId: Number(record.userId),
    status: String(record.status || '').toLowerCase(),
    passedAt: normalizeIsoTime(record.passedAt),
    clearedAt: normalizeIsoTime(record.clearedAt),
    updatedAt: normalizeIsoTime(record.updatedAt),
  };
}

export function isSameD1VerificationMeaning(left, right) {
  const normalizedLeft = normalizeD1VerificationStatusRecord(left);
  const normalizedRight = normalizeD1VerificationStatusRecord(right);
  return (
    normalizedLeft?.status === normalizedRight?.status &&
    normalizedLeft?.passedAt === normalizedRight?.passedAt &&
    normalizedLeft?.clearedAt === normalizedRight?.clearedAt
  );
}
