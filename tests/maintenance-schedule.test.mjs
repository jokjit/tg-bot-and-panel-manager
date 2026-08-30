import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runMaintenanceIfDue,
  runScheduledMaintenance,
} from '../worker-src/maintenance/schedule.js';

test('maintenance due check reports missing bindings and recent runs', async () => {
  const missing = await runMaintenanceIfDue(
    { env: {}, missingBindingReason: 'missing_kv' },
    {
      hasRequiredBindings: () => false,
      readLastState: async () => { throw new Error('should not read'); },
      run: async () => { throw new Error('should not run'); },
    },
  );
  assert.deepEqual(missing, { ok: false, skipped: 'missing_kv' });

  const finishedAt = '2026-08-30T00:00:00.000Z';
  const recent = await runMaintenanceIfDue(
    { env: { BOT_KV: {} }, intervalMs: 60_000 },
    {
      hasRequiredBindings: () => true,
      readLastState: async () => ({ finishedAt }),
      nowMs: () => Date.parse(finishedAt) + 30_000,
      run: async () => { throw new Error('should not run'); },
    },
  );
  assert.deepEqual(recent, { ok: false, skipped: 'not_due', lastFinishedAt: finishedAt });
});

test('maintenance due check starts an overdue task with the auto source', async () => {
  const calls = [];
  const result = await runMaintenanceIfDue(
    { env: { BOT_KV: {} }, intervalMs: 60_000 },
    {
      hasRequiredBindings: () => true,
      readLastState: async () => ({ finishedAt: '2026-08-30T00:00:00.000Z' }),
      nowMs: () => Date.parse('2026-08-30T00:02:00.000Z'),
      run: async (...args) => {
        calls.push(args);
        return { ok: true };
      },
    },
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls[0][1], { source: 'auto' });
});

test('scheduled maintenance skips disabled deployments without storage', async () => {
  const result = await runScheduledMaintenance({}, {
    isDataCleanupAutoEnabled: () => false,
    isDeletedAccountSweepAutoEnabled: () => false,
  });
  assert.deepEqual(result, { ok: true, skipped: 'disabled' });
});

test('scheduled maintenance isolates task and directory backfill failures', async () => {
  const result = await runScheduledMaintenance(
    { BOT_KV: {}, DB: {} },
    {
      isDataCleanupAutoEnabled: () => true,
      isDeletedAccountSweepAutoEnabled: () => true,
      runDataCleanupIfDue: async () => ({ ok: true, task: 'cleanup' }),
      runDeletedAccountSweepIfDue: async () => { throw new Error('sweep failed'); },
      runDirectoryIndexBackfill: () => { throw new Error('backfill failed'); },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.results.length, 3);
  assert.equal(result.results[0].status, 'fulfilled');
  assert.equal(result.results[1].status, 'rejected');
  assert.equal(result.results[2].status, 'rejected');
});
