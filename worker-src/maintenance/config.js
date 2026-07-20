import { clamp } from '../config/values.js';

export const DEFAULT_DATA_RETENTION_DAYS = 90;
export const DEFAULT_DATA_CLEANUP_BATCH_SIZE = 200;
export const DATA_RETENTION_MIN_DAYS = 7;
export const DATA_RETENTION_MAX_DAYS = 3650;
export const DATA_CLEANUP_MIN_BATCH = 20;
export const DATA_CLEANUP_MAX_BATCH = 1000;
export const DATA_CLEANUP_CHECK_MIN_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_DELETED_ACCOUNT_SWEEP_BATCH_SIZE = 120;
export const DELETED_ACCOUNT_SWEEP_MIN_BATCH = 20;
export const DELETED_ACCOUNT_SWEEP_MAX_BATCH = 1000;
export const DELETED_ACCOUNT_SWEEP_CHECK_MIN_INTERVAL_MS = 5 * 60 * 1000;

export function normalizeDeletedAccountMarker(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function parsePositiveInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}

export function getDataRetentionDays(env = {}) {
  return clamp(
    parsePositiveInt(env.DATA_RETENTION_DAYS, DEFAULT_DATA_RETENTION_DAYS),
    DATA_RETENTION_MIN_DAYS,
    DATA_RETENTION_MAX_DAYS,
  );
}

export function getDataCleanupBatchSize(env = {}) {
  return clamp(
    parsePositiveInt(env.DATA_CLEANUP_BATCH_SIZE, DEFAULT_DATA_CLEANUP_BATCH_SIZE),
    DATA_CLEANUP_MIN_BATCH,
    DATA_CLEANUP_MAX_BATCH,
  );
}

export function getDeletedAccountSweepBatchSize(env = {}) {
  return clamp(
    parsePositiveInt(env.DELETED_ACCOUNT_SWEEP_BATCH_SIZE, DEFAULT_DELETED_ACCOUNT_SWEEP_BATCH_SIZE),
    DELETED_ACCOUNT_SWEEP_MIN_BATCH,
    DELETED_ACCOUNT_SWEEP_MAX_BATCH,
  );
}
