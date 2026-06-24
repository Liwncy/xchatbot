CREATE TABLE IF NOT EXISTS emoji_stash (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    md5 TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    cdnurl TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'misc',
    tags_json TEXT NOT NULL DEFAULT '[]',
    size INTEGER,
    width INTEGER,
    height INTEGER,
    created_at INTEGER NOT NULL,
    source TEXT,
    status TEXT
);

CREATE INDEX IF NOT EXISTS idx_emoji_stash_category
ON emoji_stash(category, name);

CREATE INDEX IF NOT EXISTS idx_emoji_stash_status
ON emoji_stash(status);

CREATE INDEX IF NOT EXISTS idx_emoji_stash_created_at
ON emoji_stash(created_at DESC);
