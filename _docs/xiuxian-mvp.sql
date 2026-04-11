-- 修仙MVP（单用户维度：platform + user_id）
-- 适用于 Cloudflare D1

CREATE TABLE IF NOT EXISTS xiuxian_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '道友',
  level INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL DEFAULT 0,
  hp INTEGER NOT NULL DEFAULT 100,
  max_hp INTEGER NOT NULL DEFAULT 100,
  attack INTEGER NOT NULL DEFAULT 10,
  defense INTEGER NOT NULL DEFAULT 5,
  dodge REAL NOT NULL DEFAULT 0,
  crit REAL NOT NULL DEFAULT 0,
  spirit_stone INTEGER NOT NULL DEFAULT 0,
  cultivation INTEGER NOT NULL DEFAULT 0,
  backpack_cap INTEGER NOT NULL DEFAULT 50,
  weapon_item_id INTEGER,
  armor_item_id INTEGER,
  accessory_item_id INTEGER,
  sutra_item_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  UNIQUE(platform, user_id)
);

CREATE TABLE IF NOT EXISTS xiuxian_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_level INTEGER NOT NULL DEFAULT 1,
  quality TEXT NOT NULL DEFAULT 'common',
  attack INTEGER NOT NULL DEFAULT 0,
  defense INTEGER NOT NULL DEFAULT 0,
  hp INTEGER NOT NULL DEFAULT 0,
  dodge REAL NOT NULL DEFAULT 0,
  crit REAL NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  is_locked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_cooldowns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  next_at INTEGER NOT NULL DEFAULT 0,
  day_key TEXT NOT NULL DEFAULT '',
  day_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE(player_id, action),
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_battles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  enemy_name TEXT NOT NULL,
  enemy_level INTEGER NOT NULL,
  result TEXT NOT NULL,
  rounds INTEGER NOT NULL,
  reward_json TEXT NOT NULL DEFAULT '{}',
  battle_log TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE INDEX IF NOT EXISTS idx_xiuxian_inventory_player ON xiuxian_inventory(player_id);
CREATE INDEX IF NOT EXISTS idx_xiuxian_battles_player_time ON xiuxian_battles(player_id, created_at DESC);

