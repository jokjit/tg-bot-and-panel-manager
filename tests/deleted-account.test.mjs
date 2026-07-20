import assert from 'node:assert/strict';
import test from 'node:test';

import { probeDeletedTelegramUser } from '../worker-src/maintenance/deleted-account.js';

test('deleted-account probe detects active and marker-based deleted users', async () => {
  const active = await probeDeletedTelegramUser({}, 1, async () => ({ first_name: 'Ada' }));
  const deleted = await probeDeletedTelegramUser({}, 2, async () => ({ first_name: ' Deleted   Account ' }));
  assert.deepEqual(active, { deleted: false, reason: 'active', chat: { first_name: 'Ada' } });
  assert.deepEqual(deleted, {
    deleted: true,
    reason: 'deleted_marker',
    chat: { first_name: ' Deleted   Account ' },
  });
});

test('deleted-account probe distinguishes deactivation from transient failures', async () => {
  const deactivated = await probeDeletedTelegramUser({}, 1, async () => {
    throw new Error('Forbidden: user is deactivated');
  });
  const failed = await probeDeletedTelegramUser({}, 2, async () => {
    throw new Error('Bad Gateway');
  });
  assert.deepEqual(deactivated, {
    deleted: true,
    reason: 'deactivated_error',
    error: 'Forbidden: user is deactivated',
  });
  assert.deepEqual(failed, {
    deleted: false,
    reason: 'probe_failed',
    error: 'Bad Gateway',
  });
});
