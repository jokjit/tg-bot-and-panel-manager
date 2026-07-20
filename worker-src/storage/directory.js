export const DIRECTORY_SCHEMA_STATEMENTS = Object.freeze([
  `CREATE TABLE IF NOT EXISTS user_directory (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    display_name TEXT,
    first_seen_at TEXT,
    last_seen_at TEXT,
    profile_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_user_directory_last_seen ON user_directory(last_seen_at DESC)',
  `CREATE TABLE IF NOT EXISTS user_moderation_index (
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    entry_json TEXT NOT NULL,
    created_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, kind)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_user_moderation_kind_created ON user_moderation_index(kind, created_at DESC)',
]);

export const USER_DIRECTORY_UPSERT_SQL = `INSERT INTO user_directory (
  user_id, username, display_name, first_seen_at, last_seen_at, profile_json, updated_at
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
ON CONFLICT(user_id) DO UPDATE SET
  username = excluded.username,
  display_name = excluded.display_name,
  first_seen_at = excluded.first_seen_at,
  last_seen_at = excluded.last_seen_at,
  profile_json = excluded.profile_json,
  updated_at = excluded.updated_at`;

export const MODERATION_INDEX_UPSERT_SQL = `INSERT INTO user_moderation_index (
  user_id, kind, entry_json, created_at, updated_at
) VALUES (?1, ?2, ?3, ?4, ?5)
ON CONFLICT(user_id, kind) DO UPDATE SET
  entry_json = excluded.entry_json,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at`;

export function buildD1UserDirectoryRecord(profile, updatedAt = new Date().toISOString()) {
  const userId = Number(profile?.userId);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  return {
    userId,
    username: profile?.username ? String(profile.username) : null,
    displayName: profile?.displayName ? String(profile.displayName) : null,
    firstSeenAt: profile?.firstSeenAt ? String(profile.firstSeenAt) : null,
    lastSeenAt: profile?.lastSeenAt ? String(profile.lastSeenAt) : null,
    profileJson: JSON.stringify(profile),
    updatedAt: String(updatedAt),
  };
}

export function buildD1ModerationIndexRecord(kind, entry, updatedAt = new Date().toISOString()) {
  const userId = Number(entry?.userId);
  const normalizedKind = String(kind || '').trim().toLowerCase();
  if (!Number.isInteger(userId) || userId <= 0 || !normalizedKind) return null;
  return {
    userId,
    kind: normalizedKind,
    entryJson: JSON.stringify(entry),
    createdAt: entry?.createdAt ? String(entry.createdAt) : null,
    updatedAt: String(updatedAt),
  };
}

const DIRECTORY_D1_SCHEMA_RETRY_MS = 60 * 1000;
let directoryD1SchemaReady = false;
let directoryD1SchemaLastErrorAt = 0;

function formatDirectoryError(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function ensureDirectoryD1Schema(env) {
  if (!env?.DB) return false;
  if (directoryD1SchemaReady) return true;
  if (
    directoryD1SchemaLastErrorAt &&
    Date.now() - directoryD1SchemaLastErrorAt < DIRECTORY_D1_SCHEMA_RETRY_MS
  ) {
    return false;
  }

  try {
    for (const statement of DIRECTORY_SCHEMA_STATEMENTS) {
      await env.DB.prepare(statement).run();
    }
    directoryD1SchemaReady = true;
    directoryD1SchemaLastErrorAt = 0;
    return true;
  } catch (error) {
    directoryD1SchemaLastErrorAt = Date.now();
    console.warn('Failed to ensure D1 directory schema', formatDirectoryError(error));
    return false;
  }
}

export async function writeD1UserDirectory(env, profile) {
  const record = buildD1UserDirectoryRecord(profile);
  if (!record || !(await ensureDirectoryD1Schema(env))) return false;
  try {
    await env.DB.prepare(USER_DIRECTORY_UPSERT_SQL).bind(
      record.userId,
      record.username,
      record.displayName,
      record.firstSeenAt,
      record.lastSeenAt,
      record.profileJson,
      record.updatedAt,
    ).run();
    return true;
  } catch (error) {
    console.warn('Failed to write D1 user directory', formatDirectoryError(error));
    return false;
  }
}

export async function writeD1ModerationIndex(env, kind, entry) {
  const record = buildD1ModerationIndexRecord(kind, entry);
  if (!record || !(await ensureDirectoryD1Schema(env))) return false;
  try {
    await env.DB.prepare(MODERATION_INDEX_UPSERT_SQL).bind(
      record.userId,
      record.kind,
      record.entryJson,
      record.createdAt,
      record.updatedAt,
    ).run();
    return true;
  } catch (error) {
    console.warn('Failed to write D1 moderation index', formatDirectoryError(error));
    return false;
  }
}

export async function deleteD1DirectoryEntries(env, userId, kind = '') {
  if (!(await ensureDirectoryD1Schema(env))) return false;
  try {
    if (kind) {
      await env.DB.prepare('DELETE FROM user_moderation_index WHERE user_id = ?1 AND kind = ?2')
        .bind(Number(userId), String(kind))
        .run();
    } else {
      await env.DB.prepare('DELETE FROM user_moderation_index WHERE user_id = ?1')
        .bind(Number(userId))
        .run();
      await env.DB.prepare('DELETE FROM user_directory WHERE user_id = ?1')
        .bind(Number(userId))
        .run();
    }
    return true;
  } catch (error) {
    console.warn('Failed to delete D1 directory entries', formatDirectoryError(error));
    return false;
  }
}

function buildDirectoryBackfillStatement(env, phase, value) {
  if (phase.name === 'users') {
    const record = buildD1UserDirectoryRecord(value);
    if (!record) return null;
    return env.DB.prepare(USER_DIRECTORY_UPSERT_SQL).bind(
      record.userId,
      record.username,
      record.displayName,
      record.firstSeenAt,
      record.lastSeenAt,
      record.profileJson,
      record.updatedAt,
    );
  }

  const record = buildD1ModerationIndexRecord(phase.kind, value);
  if (!record) return null;
  return env.DB.prepare(MODERATION_INDEX_UPSERT_SQL).bind(
    record.userId,
    record.kind,
    record.entryJson,
    record.createdAt,
    record.updatedAt,
  );
}

export async function writeDirectoryBackfillBatch(env, phase, values) {
  if (!(await ensureDirectoryD1Schema(env))) {
    throw new Error('directory_d1_schema_unavailable');
  }
  const statements = values
    .map((value) => buildDirectoryBackfillStatement(env, phase, value))
    .filter(Boolean);
  if (statements.length === 0) return { written: 0, skipped: values.length };

  if (typeof env.DB.batch === 'function') {
    await env.DB.batch(statements);
  } else {
    for (const statement of statements) await statement.run();
  }
  return {
    written: statements.length,
    skipped: values.length - statements.length,
  };
}
