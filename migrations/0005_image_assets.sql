CREATE TABLE IF NOT EXISTS image_assets (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_image_assets_created
  ON image_assets(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_image_assets_sha256
  ON image_assets(sha256);
