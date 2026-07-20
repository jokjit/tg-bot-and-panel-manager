import { isSameD1VerificationMeaning } from './d1.js';
import { normalizeIsoTime, parseIsoTimeMs } from '../utils/time.js';

export async function writeVerificationStatusPassed(context = {}, handlers = {}) {
  if (!(await handlers.ensureSchema())) return false;
  const fallbackNow = await handlers.nowIso();
  const record = {
    userId: Number(context.userId),
    status: 'verified',
    passedAt: normalizeIsoTime(context.passedAt) || fallbackNow,
    clearedAt: null,
    updatedAt: normalizeIsoTime(context.updatedAt) || fallbackNow,
  };
  const cached = handlers.readCache(context.userId);
  if (cached.hit && isSameD1VerificationMeaning(cached.value, record)) {
    return true;
  }
  if (await handlers.writeRecord(record)) {
    handlers.writeCache(context.userId, record);
    return true;
  }
  return false;
}

export async function writeVerificationStatusCleared(context = {}, handlers = {}) {
  if (!(await handlers.ensureSchema())) return false;
  const nowIso = normalizeIsoTime(context.clearedAt) || await handlers.nowIso();
  const record = {
    userId: Number(context.userId),
    status: 'pending',
    passedAt: null,
    clearedAt: nowIso,
    updatedAt: nowIso,
  };
  const cached = handlers.readCache(context.userId);
  if (cached.hit && isSameD1VerificationMeaning(cached.value, record)) {
    return true;
  }
  if (await handlers.writeRecord(record)) {
    handlers.writeCache(context.userId, record);
    return true;
  }
  return false;
}

export async function getVerificationPassedAtFromD1(context = {}, handlers = {}) {
  const record = await handlers.getStatus(context.userId);
  if (!record) return null;

  const clearedAt = normalizeIsoTime(record.clearedAt);
  const status = String(record.status || '').toLowerCase();
  if (clearedAt && status !== 'verified') {
    handlers.writeLocalCleared(context.userId, clearedAt);
    return null;
  }

  const passedAt = normalizeIsoTime(record.passedAt);
  if (status !== 'verified' || !passedAt) return null;
  if (clearedAt && parseIsoTimeMs(clearedAt) >= parseIsoTimeMs(passedAt)) {
    handlers.writeLocalCleared(context.userId, clearedAt);
    return null;
  }
  if (handlers.isPassedAtCleared(context.userId, passedAt, context.profile)) return null;

  handlers.writeLocalPassed(context.userId, passedAt);
  return passedAt;
}
