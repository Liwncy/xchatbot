CREATE TABLE IF NOT EXISTS rule_definition (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 0,
    match_type TEXT NOT NULL,
    trigger_text TEXT,
    pattern TEXT,
    args_json TEXT,
    source_type TEXT NOT NULL,
    request_method TEXT,
    request_url TEXT,
    response_mode TEXT,
    response_path TEXT,
    request_config_json TEXT,
    reply_type TEXT NOT NULL,
    reply_payload_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rule_definition_enabled_priority ON rule_definition(enabled, priority DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_definition_match_type ON rule_definition(match_type, enabled);
CREATE INDEX IF NOT EXISTS idx_rule_definition_reply_type ON rule_definition(reply_type, enabled);
CREATE INDEX IF NOT EXISTS idx_rule_definition_name ON rule_definition(name);
