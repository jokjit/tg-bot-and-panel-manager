import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getVerificationPassedAtFromD1,
  writeVerificationStatusCleared,
  writeVerificationStatusPassed,
} from '../worker-src/storage/verification-status.js';

const nowIso = '2026-07-20T00:00:00.000Z';

function createWriteHandlers(overrides = {}) {
  const calls = [];
  const handlers = {
    ensureSchema: async () => true,
    nowIso: async () => nowIso,
    readCache: () => ({ hit: false, value: null }),
    writeRecord: async (...args) => { calls.push(['write', ...args]); return true; },
    writeCache: (...args) => calls.push(['cache', ...args]),
    ...overrides,
  };
  return { calls, handlers };
}

test('D1 passed status normalizes records and caches successful writes', async () => {
  const { calls, handlers } = createWriteHandlers();
  assert.equal(await writeVerificationStatusPassed({
    userId: '7',
    passedAt: '2026-07-19T00:00:00Z',
  }, handlers), true);
  const record = calls[0][1];
  assert.deepEqual(record, {
    userId: 7,
    status: 'verified',
    passedAt: '2026-07-19T00:00:00.000Z',
    clearedAt: null,
    updatedAt: nowIso,
  });
  assert.deepEqual(calls.map((call) => call[0]), ['write', 'cache']);
});

test('D1 status writes skip equal cached records and stop on schema failure', async () => {
  const record = {
    userId: 7,
    status: 'pending',
    passedAt: null,
    clearedAt: nowIso,
    updatedAt: nowIso,
  };
  const cached = createWriteHandlers({ readCache: () => ({ hit: true, value: record }) });
  assert.equal(await writeVerificationStatusCleared({ userId: 7, clearedAt: nowIso }, cached.handlers), true);
  assert.deepEqual(cached.calls, []);

  const unavailable = createWriteHandlers({ ensureSchema: async () => false });
  assert.equal(await writeVerificationStatusPassed({ userId: 7 }, unavailable.handlers), false);
  assert.deepEqual(unavailable.calls, []);
});

test('D1 status write failures are not cached', async () => {
  const { calls, handlers } = createWriteHandlers({
    writeRecord: async (...args) => { calls.push(['write', ...args]); return false; },
  });
  assert.equal(await writeVerificationStatusCleared({ userId: 8 }, handlers), false);
  assert.deepEqual(calls.map((call) => call[0]), ['write']);
});

test('D1 passed timestamp records effective revocations locally', async () => {
  const calls = [];
  const result = await getVerificationPassedAtFromD1({ userId: 7 }, {
    getStatus: async () => ({
      status: 'verified',
      passedAt: '2026-07-19T00:00:00.000Z',
      clearedAt: '2026-07-20T00:00:00.000Z',
    }),
    writeLocalCleared: (...args) => calls.push(['cleared', ...args]),
    isPassedAtCleared: () => false,
    writeLocalPassed: (...args) => calls.push(['passed', ...args]),
  });
  assert.equal(result, null);
  assert.deepEqual(calls, [['cleared', 7, '2026-07-20T00:00:00.000Z']]);
});

test('D1 passed timestamp updates local status only when still effective', async () => {
  const calls = [];
  const result = await getVerificationPassedAtFromD1({ userId: 8, profile: {} }, {
    getStatus: async () => ({ status: 'verified', passedAt: '2026-07-19T00:00:00Z' }),
    writeLocalCleared: (...args) => calls.push(['cleared', ...args]),
    isPassedAtCleared: () => false,
    writeLocalPassed: (...args) => calls.push(['passed', ...args]),
  });
  assert.equal(result, '2026-07-19T00:00:00.000Z');
  assert.deepEqual(calls, [['passed', 8, '2026-07-19T00:00:00.000Z']]);
});
