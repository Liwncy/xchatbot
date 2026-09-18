-- 把旧 emoji_stash（cdnurl / status=ok）迁到新结构。
-- 线上 xbotdata 已跑过：新表 1173 行，旧表留作 emoji_stash_legacy。
-- 核对无误后可：DROP TABLE emoji_stash_legacy;
-- 不要对已迁过的库再跑一遍。

DROP TABLE IF EXISTS emoji_stash_v2;

CREATE TABLE emoji_stash_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  md5 TEXT UNIQUE,
  cdn_url TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
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

INSERT INTO emoji_stash_v2 (
  id, name, description, md5, cdn_url, image_url, mime,
  category, tags_json, status, size, width, height, source,
  created_at, updated_at
)
SELECT
  id,
  name,
  '',
  md5,
  cdnurl,
  cdnurl,
  NULL,
  category,
  tags_json,
  CASE
    WHEN lower(IFNULL(status, '')) IN ('', 'ok', 'active') THEN 'active'
    WHEN lower(status) IN ('pending', 'disabled', 'broken') THEN lower(status)
    ELSE 'active'
  END,
  size,
  width,
  height,
  source,
  created_at,
  created_at
FROM emoji_stash;

DROP INDEX IF EXISTS idx_emoji_stash_category;
DROP INDEX IF EXISTS idx_emoji_stash_status;
DROP INDEX IF EXISTS idx_emoji_stash_created_at;
DROP INDEX IF EXISTS idx_emoji_stash_status_category;
DROP INDEX IF EXISTS idx_emoji_stash_updated_at;

ALTER TABLE emoji_stash RENAME TO emoji_stash_legacy;
ALTER TABLE emoji_stash_v2 RENAME TO emoji_stash;

CREATE INDEX IF NOT EXISTS idx_emoji_stash_status_category
  ON emoji_stash (status, category);

CREATE INDEX IF NOT EXISTS idx_emoji_stash_created_at
  ON emoji_stash (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_emoji_stash_updated_at
  ON emoji_stash (updated_at DESC);
