import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDataCleanupBatchSize,
  getDataRetentionDays,
  getDeletedAccountSweepBatchSize,
  normalizeDeletedAccountMarker,
  parsePositiveInt,
} from '../worker-src/maintenance/config.js';
import { createIntervalGate } from '../worker-src/maintenance/schedule.js';

test('maintenance config clamps retention and batch settings', () => {
  assert.equal(parsePositiveInt('12.9', 1), 12);
  assert.equal(parsePositiveInt('-2', 9), 9);
  assert.equal(getDataRetentionDays({ DATA_RETENTION_DAYS: 1 }), 7);
  assert.equal(getDataRetentionDays({ DATA_RETENTION_DAYS: 99999 }), 3650);
  assert.equal(getDataCleanupBatchSize({ DATA_CLEANUP_BATCH_SIZE: 1 }), 20);
  assert.equal(getDeletedAccountSweepBatchSize({ DELETED_ACCOUNT_SWEEP_BATCH_SIZE: 99999 }), 1000);
  assert.equal(normalizeDeletedAccountMarker('  Deleted   Account  '), 'deleted account');
});

test('maintenance interval gates trigger once per interval', () => {
  const gate = createIntervalGate(1000);
  assert.equal(gate(0), false);
  assert.equal(gate(1000), true);
  assert.equal(gate(1500), false);
  assert.equal(gate(2000), true);
});
