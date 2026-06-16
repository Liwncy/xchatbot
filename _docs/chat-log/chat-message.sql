-- 会话消息记录（单表 MVP）
-- 适用于 Cloudflare D1

CREATE TABLE IF NOT EXISTS chat_message (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id            TEXT NOT NULL,
  platform              TEXT NOT NULL DEFAULT 'wechat',
  session_id            TEXT NOT NULL,
  session_type          TEXT NOT NULL,
  direction             TEXT NOT NULL,
  actor_type            TEXT NOT NULL,
  sender_id             TEXT NOT NULL,
  sender_name           TEXT NOT NULL DEFAULT '',
  msg_type              TEXT NOT NULL,
  content_text          TEXT NOT NULL DEFAULT '',
  payload_json          TEXT NOT NULL DEFAULT '{}',
  char_count            INTEGER NOT NULL DEFAULT 0,
  refer_message_id      TEXT,
  caused_by_message_id  TEXT,
  reply_index           INTEGER NOT NULL DEFAULT 0,
  plugin_name           TEXT,
  reply_status          TEXT,
  created_at            INTEGER NOT NULL,
  ingested_at           INTEGER NOT NULL,
  UNIQUE(platform, message_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_session_id
  ON chat_message(session_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_chat_message_session_time
  ON chat_message(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_message_session_actor_time
  ON chat_message(session_id, actor_type, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_message_caused_by
  ON chat_message(caused_by_message_id);
