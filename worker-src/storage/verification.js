import { normalizeD1VerificationStatusRecord } from './d1.js';

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function createVerificationD1Repository(options = {}) {
  const retryMs = Math.max(0, Number(options.retryMs) || 60_000);
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const onError = typeof options.onError === 'function'
    ? options.onError
    : (operation, error) => console.warn(`Verification D1 ${operation} failed`, errorMessage(error));
  const schemaState = {
    status: { ready: false, lastErrorAt: 0 },
    session: { ready: false, lastErrorAt: 0 },
  };

  async function ensureSchema(db, kind) {
    if (!db) return false;
    const state = schemaState[kind];
    if (state.ready) return true;
    if (state.lastErrorAt && now() - state.lastErrorAt < retryMs) return false;
    const sql = kind === 'status'
      ? `CREATE TABLE IF NOT EXISTS user_verification_status (
          user_id INTEGER PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'pending',
          passed_at TEXT,
          cleared_at TEXT,
          updated_at TEXT NOT NULL
        )`
      : `CREATE TABLE IF NOT EXISTS user_verification_sessions (
          user_id INTEGER PRIMARY KEY,
          session_token TEXT NOT NULL,
          state_json TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`;
    try {
      await db.prepare(sql).run();
      state.ready = true;
      state.lastErrorAt = 0;
      return true;
    } catch (error) {
      state.lastErrorAt = now();
      onError(`ensure_${kind}_schema`, error);
      return false;
    }
  }

  return {
    ensureStatusSchema: (db) => ensureSchema(db, 'status'),
    ensureSessionSchema: (db) => ensureSchema(db, 'session'),

    async writeStatusPassed(db, record) {
      if (!(await ensureSchema(db, 'status'))) return false;
      try {
        await db.prepare(
          `INSERT INTO user_verification_status (user_id, status, passed_at, cleared_at, updated_at)
           VALUES (?1, 'verified', ?2, NULL, ?3)
           ON CONFLICT(user_id) DO UPDATE SET
             status = 'verified', passed_at = excluded.passed_at,
             cleared_at = NULL, updated_at = excluded.updated_at`,
        ).bind(Number(record.userId), record.passedAt, record.updatedAt).run();
        return true;
      } catch (error) {
        onError('write_status_passed', error);
        return false;
      }
    },

    async writeStatusCleared(db, record) {
      if (!(await ensureSchema(db, 'status'))) return false;
      try {
        await db.prepare(
          `INSERT INTO user_verification_status (user_id, status, passed_at, cleared_at, updated_at)
           VALUES (?1, 'pending', NULL, ?2, ?2)
           ON CONFLICT(user_id) DO UPDATE SET
             status = 'pending', passed_at = NULL,
             cleared_at = excluded.cleared_at, updated_at = excluded.updated_at`,
        ).bind(Number(record.userId), record.clearedAt).run();
        return true;
      } catch (error) {
        onError('write_status_cleared', error);
        return false;
      }
    },

    async readStatus(db, userId) {
      if (!(await ensureSchema(db, 'status'))) return undefined;
      try {
        const record = await db.prepare(
          `SELECT user_id AS userId, status, passed_at AS passedAt,
                  cleared_at AS clearedAt, updated_at AS updatedAt
           FROM user_verification_status WHERE user_id = ?1 LIMIT 1`,
        ).bind(Number(userId)).first();
        return normalizeD1VerificationStatusRecord(record);
      } catch (error) {
        onError('read_status', error);
        return undefined;
      }
    },

    async writeSession(db, record) {
      if (!(await ensureSchema(db, 'session'))) return false;
      try {
        await db.prepare(
          `INSERT INTO user_verification_sessions (user_id, session_token, state_json, expires_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(user_id) DO UPDATE SET
             session_token = excluded.session_token, state_json = excluded.state_json,
             expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
        ).bind(
          Number(record.userId),
          String(record.sessionToken),
          String(record.stateJson),
          String(record.expiresAt),
          String(record.updatedAt),
        ).run();
        return true;
      } catch (error) {
        onError('write_session', error);
        return false;
      }
    },

    async readSession(db, userId) {
      if (!(await ensureSchema(db, 'session'))) return null;
      try {
        return await db.prepare(
          `SELECT session_token AS sessionToken, state_json AS stateJson, expires_at AS expiresAt
           FROM user_verification_sessions WHERE user_id = ?1 LIMIT 1`,
        ).bind(Number(userId)).first();
      } catch (error) {
        onError('read_session', error);
        return null;
      }
    },

    async deleteStatus(db, userId) {
      if (!(await ensureSchema(db, 'status'))) return { ok: false, changes: 0 };
      try {
        const result = await db.prepare('DELETE FROM user_verification_status WHERE user_id = ?1')
          .bind(Number(userId)).run();
        return { ok: true, changes: Number(result?.meta?.changes || 0) };
      } catch (error) {
        onError('delete_status', error);
        return { ok: false, changes: 0 };
      }
    },

    async deleteSession(db, userId) {
      if (!(await ensureSchema(db, 'session'))) return { ok: false, changes: 0 };
      try {
        const result = await db.prepare('DELETE FROM user_verification_sessions WHERE user_id = ?1')
          .bind(Number(userId)).run();
        return { ok: true, changes: Number(result?.meta?.changes || 0) };
      } catch (error) {
        onError('delete_session', error);
        return { ok: false, changes: 0 };
      }
    },
  };
}
