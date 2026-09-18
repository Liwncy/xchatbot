-- 通道表情库，落在 XBOT_DB（xbotdata）
-- 空库建这张表。线上旧表用 emoji-stash-migrate.sql 迁，不要 DROP 原表。
CREATE TABLE IF NOT EXISTS emoji_stash (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  md5 TEXT UNIQUE,
  img_url TEXT NOT NULL DEFAULT '',
  mime TEXT,
  category TEXT NOT NULL DEFAULT 'misc',
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  size INTEGER,
  width INTEGER,
  height INTEGER,
  source TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emoji_stash_status_category
  ON emoji_stash (status, category);

CREATE INDEX IF NOT EXISTS idx_emoji_stash_created_at
  ON emoji_stash (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_emoji_stash_updated_at
  ON emoji_stash (updated_at DESC);
