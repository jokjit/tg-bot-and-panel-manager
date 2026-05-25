CREATE TABLE IF NOT EXISTS user_verification_sessions (
  user_id INTEGER PRIMARY KEY,
  session_token TEXT NOT NULL,
  state_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
