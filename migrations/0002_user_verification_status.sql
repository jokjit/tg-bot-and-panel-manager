CREATE TABLE IF NOT EXISTS user_verification_status (
  user_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  passed_at TEXT,
  cleared_at TEXT,
  updated_at TEXT NOT NULL
);
