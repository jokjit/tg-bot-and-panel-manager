import assert from 'node:assert/strict';
import test from 'node:test';

import { createVerificationD1Repository } from '../worker-src/storage/verification.js';

function createFakeDb() {
  const calls = [];
  const rows = new Map();
  const db = {
    calls,
    rows,
    prepare(sql) {
      const statement = {
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          calls.push({ sql, values: statement.values || [] });
          if (sql.includes('user_verification_status') && sql.startsWith('INSERT')) {
            rows.set(`status:${statement.values[0]}`, {
              userId: statement.values[0],
              status: sql.includes("'verified'") ? 'verified' : 'pending',
              passedAt: statement.values[1] || null,
              clearedAt: sql.includes("'verified'") ? null : statement.values[1],
              updatedAt: statement.values[2] || statement.values[1],
            });
          }
          return { meta: { changes: 1 } };
        },
        async first() {
          calls.push({ sql, values: statement.values || [] });
          if (sql.includes('user_verification_status')) return rows.get(`status:${statement.values[0]}`) || null;
          return rows.get(`session:${statement.values[0]}`) || null;
        },
      };
      if (sql.includes('user_verification_sessions') && sql.startsWith('INSERT')) {
        const originalRun = statement.run;
        statement.run = async () => {
          rows.set(`session:${statement.values[0]}`, {
            sessionToken: statement.values[1],
            stateJson: statement.values[2],
            expiresAt: statement.values[3],
          });
          return originalRun();
        };
      }
      if (sql.startsWith('DELETE')) {
        const originalRun = statement.run;
        statement.run = async () => {
          rows.delete(`${sql.includes('status') ? 'status' : 'session'}:${statement.values[0]}`);
          return originalRun();
        };
      }
      return statement;
    },
  };
  return db;
}

test('verification D1 repository creates schemas and persists status/session rows', async () => {
  const db = createFakeDb();
  const repository = createVerificationD1Repository({ onError: () => {} });
  assert.equal(await repository.writeStatusPassed(db, {
    userId: 7,
    passedAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:01:00.000Z',
  }), true);
  assert.deepEqual(await repository.readStatus(db, 7), {
    userId: 7,
    status: 'verified',
    passedAt: '2026-07-20T00:00:00.000Z',
    clearedAt: null,
    updatedAt: '2026-07-20T00:01:00.000Z',
  });
  assert.equal(await repository.writeSession(db, {
    userId: 7,
    sessionToken: 'token',
    stateJson: JSON.stringify({ sessionToken: 'token' }),
    expiresAt: '2026-07-20T00:10:00.000Z',
    updatedAt: '2026-07-20T00:02:00.000Z',
  }), true);
  assert.equal((await repository.readSession(db, 7)).sessionToken, 'token');
  assert.equal(db.calls.some((call) => call.sql.startsWith('CREATE TABLE IF NOT EXISTS')), true);
});

test('verification D1 repository reports deletion counts and schema failures', async () => {
  const db = createFakeDb();
  const repository = createVerificationD1Repository({ onError: () => {} });
  await repository.writeStatusCleared(db, {
    userId: 8,
    clearedAt: '2026-07-20T00:00:00.000Z',
  });
  assert.deepEqual(await repository.deleteStatus(db, 8), { ok: true, changes: 1 });

  const broken = {
    prepare() {
      throw new Error('D1 unavailable');
    },
  };
  const failed = createVerificationD1Repository({ now: () => 1000, retryMs: 60000, onError: () => {} });
  assert.equal(await failed.ensureStatusSchema(broken), false);
  assert.equal(await failed.ensureStatusSchema(broken), false);
  assert.equal(await failed.readStatus(broken, 8), undefined);
});
