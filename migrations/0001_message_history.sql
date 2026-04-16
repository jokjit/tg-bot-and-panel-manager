CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  chat_type TEXT,
  topic_id INTEGER,
  last_message_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  telegram_message_id INTEGER,
  direction TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  message_type TEXT NOT NULL,
  text_content TEXT,
  media_file_id TEXT,
  raw_payload TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user_created_at ON messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_direction_created_at ON messages(direction, created_at DESC);
