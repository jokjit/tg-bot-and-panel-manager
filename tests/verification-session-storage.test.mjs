import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearLatestVerificationSessionState,
  getLatestVerificationSession,
  persistLatestVerificationSessionState,
  readVerificationSessionFromD1,
  writeVerificationSessionToD1,
} from '../worker-src/storage/verification-session.js';

const nowMs = Date.parse('2026-07-20T00:00:00.000Z');

test('D1 session write rejects missing tokens and unavailable schemas', async () => {
  const calls = [];
  const handlers = {
    sanitizeState: (state) => state,
    ensureSchema: async () => true,
    nowMs: async () => nowMs,
    getSessionExpireMs: () => 60_000,
    writeRecord: async (...args) => { calls.push(args); return true; },
  };
  assert.equal(await writeVerificationSessionToD1({ userId: 7, state: {} }, handlers), false);
  assert.equal(await writeVerificationSessionToD1({ userId: 7, state: { sessionToken: 'token' } }, {
    ...handlers,
    ensureSchema: async () => false,
  }), false);
  assert.deepEqual(calls, []);
});

test('D1 session write serializes a snapshot with fallback expiry', async () => {
  const calls = [];
  const state = { sessionToken: 'token', nested: { attempts: 1 } };
  const result = await writeVerificationSessionToD1({ userId: 7, state }, {
    sanitizeState: (value) => structuredClone(value),
    ensureSchema: async () => true,
    nowMs: async () => nowMs,
    getSessionExpireMs: () => 60_000,
    writeRecord: async (...args) => { calls.push(args); return true; },
  });
  assert.equal(result, true);
  assert.deepEqual(calls[0][0], {
    userId: 7,
    sessionToken: 'token',
    stateJson: JSON.stringify(state),
    expiresAt: '2026-07-20T00:01:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
  });
});

test('D1 session read rejects token mismatches before parsing state', async () => {
  const calls = [];
  const result = await readVerificationSessionFromD1({ userId: 7, token: 'expected' }, {
    readRecord: async () => ({ sessionToken: 'other', stateJson: '{invalid' }),
    tokensEqual: () => false,
    isSessionUsable: () => { calls.push('usable'); return true; },
    writeLocal: () => calls.push('local'),
    onParseError: () => calls.push('parseError'),
  });
  assert.equal(result, null);
  assert.deepEqual(calls, []);
});

test('D1 session read reports damaged JSON and ignores unusable sessions', async () => {
  const calls = [];
  const base = {
    tokensEqual: () => true,
    isSessionUsable: () => false,
    writeLocal: () => calls.push('local'),
    onParseError: () => calls.push('parseError'),
  };
  assert.equal(await readVerificationSessionFromD1({ userId: 7 }, {
    ...base,
    readRecord: async () => ({ stateJson: '{invalid' }),
  }), null);
  assert.deepEqual(calls, ['parseError']);

  calls.length = 0;
  assert.equal(await readVerificationSessionFromD1({ userId: 7 }, {
    ...base,
    readRecord: async () => ({ stateJson: JSON.stringify({ sessionToken: 'expired' }) }),
  }), null);
  assert.deepEqual(calls, []);
});

test('D1 session read restores valid state to local cache', async () => {
  const calls = [];
  const state = { sessionToken: 'token', sessionExpiresAt: 'later' };
  const result = await readVerificationSessionFromD1({ userId: 8, token: 'token' }, {
    readRecord: async () => ({ sessionToken: 'token', stateJson: JSON.stringify(state) }),
    tokensEqual: (left, right) => left === right,
    isSessionUsable: () => true,
    writeLocal: (...args) => calls.push(args),
    onParseError: () => {},
  });
  assert.deepEqual(result, state);
  assert.deepEqual(calls, [[8, state]]);
});

test('latest session helpers preserve local-first persistence and lookup ordering', async () => {
  const calls = [];
  await persistLatestVerificationSessionState({ userId: 7, state: { token: 'state' } }, {
    writeLocal: (...args) => calls.push(['writeLocal', ...args]),
    writeD1: async (...args) => calls.push(['writeD1', ...args]),
  });
  await clearLatestVerificationSessionState({ userId: 7 }, {
    clearLocal: (...args) => calls.push(['clearLocal', ...args]),
    clearD1: async (...args) => calls.push(['clearD1', ...args]),
  });
  assert.deepEqual(calls.map((call) => call[0]), ['writeLocal', 'writeD1', 'clearLocal', 'clearD1']);

  const local = { source: 'local' };
  assert.equal(await getLatestVerificationSession({ userId: 7, token: 'token' }, {
    readLocal: () => local,
    readD1: async () => { throw new Error('must not read D1'); },
  }), local);
});
