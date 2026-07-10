-- 应用运行日志（logger warn/error 落库）
-- 适用于 Cloudflare D1

CREATE TABLE IF NOT EXISTS app_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  level        TEXT NOT NULL,
  message      TEXT NOT NULL DEFAULT '',
  detail_json  TEXT NOT NULL DEFAULT '[]',
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_log_created_at
  ON app_log(created_at);

CREATE INDEX IF NOT EXISTS idx_app_log_level_created_at
  ON app_log(level, created_at);
