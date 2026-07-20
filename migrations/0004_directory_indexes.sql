CREATE TABLE IF NOT EXISTS user_directory (
  user_id INTEGER PRIMARY KEY,
  username TEXT,
  display_name TEXT,
  first_seen_at TEXT,
  last_seen_at TEXT,
  profile_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_directory_last_seen ON user_directory(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS user_moderation_index (
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  entry_json TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_user_moderation_kind_created
  ON user_moderation_index(kind, created_at DESC);
