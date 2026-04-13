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

CREATE TABLE IF NOT EXISTS xiuxian_shop_offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  offer_key TEXT NOT NULL,
  item_payload_json TEXT NOT NULL,
  price_spirit_stone INTEGER NOT NULL,
  stock INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  refreshed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_economy_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  biz_type TEXT NOT NULL,
  delta_spirit_stone INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  ref_type TEXT NOT NULL,
  ref_id INTEGER,
  idempotency_key TEXT,
  extra_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  day_key TEXT NOT NULL,
  reward_spirit_stone INTEGER NOT NULL DEFAULT 0,
  reward_exp INTEGER NOT NULL DEFAULT 0,
  reward_cultivation INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(player_id, day_key),
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'daily',
  target_value INTEGER NOT NULL DEFAULT 1,
  requirement_json TEXT NOT NULL DEFAULT '{}',
  reward_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS xiuxian_player_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  day_key TEXT NOT NULL,
  progress_value INTEGER NOT NULL DEFAULT 0,
  target_value INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'in_progress',
  claimed_at INTEGER,
  updated_at INTEGER NOT NULL,
  UNIQUE(player_id, task_id, day_key),
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id),
  FOREIGN KEY(task_id) REFERENCES xiuxian_tasks(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target_value INTEGER NOT NULL DEFAULT 1,
  requirement_json TEXT NOT NULL DEFAULT '{}',
  reward_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS xiuxian_player_achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  achievement_id INTEGER NOT NULL,
  progress_value INTEGER NOT NULL DEFAULT 0,
  target_value INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'in_progress',
  unlocked_at INTEGER,
  claimed_at INTEGER,
  updated_at INTEGER NOT NULL,
  UNIQUE(player_id, achievement_id),
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id),
  FOREIGN KEY(achievement_id) REFERENCES xiuxian_achievements(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_boss_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL UNIQUE,
  boss_name TEXT NOT NULL,
  boss_level INTEGER NOT NULL,
  max_hp INTEGER NOT NULL,
  current_hp INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'alive',
  rounds INTEGER NOT NULL DEFAULT 0,
  last_result TEXT NOT NULL DEFAULT 'lose',
  reward_json TEXT NOT NULL DEFAULT '{}',
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_boss_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  boss_name TEXT NOT NULL,
  boss_level INTEGER NOT NULL,
  result TEXT NOT NULL,
  rounds INTEGER NOT NULL,
  reward_json TEXT NOT NULL DEFAULT '{}',
  battle_log TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_world_boss_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_key TEXT NOT NULL UNIQUE,
  cycle_no INTEGER NOT NULL DEFAULT 1,
  boss_name TEXT NOT NULL,
  boss_level INTEGER NOT NULL,
  max_hp INTEGER NOT NULL,
  current_hp INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'alive',
  version INTEGER NOT NULL DEFAULT 0,
  last_hit_user_id TEXT,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  defeated_at INTEGER
);

CREATE TABLE IF NOT EXISTS xiuxian_world_boss_contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_key TEXT NOT NULL,
  cycle_no INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  total_damage INTEGER NOT NULL DEFAULT 0,
  attacks INTEGER NOT NULL DEFAULT 0,
  kill_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE(scope_key, cycle_no, player_id),
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE INDEX IF NOT EXISTS idx_xiuxian_inventory_player ON xiuxian_inventory(player_id);
CREATE INDEX IF NOT EXISTS idx_xiuxian_battles_player_time ON xiuxian_battles(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_shop_player_status ON xiuxian_shop_offers(player_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_xiuxian_economy_player_time ON xiuxian_economy_logs(player_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_xiuxian_economy_idem ON xiuxian_economy_logs(player_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_xiuxian_checkins_player_day ON xiuxian_checkins(player_id, day_key);
CREATE INDEX IF NOT EXISTS idx_xiuxian_player_tasks_player_day ON xiuxian_player_tasks(player_id, day_key);
CREATE INDEX IF NOT EXISTS idx_xiuxian_player_achievements_player ON xiuxian_player_achievements(player_id);
CREATE INDEX IF NOT EXISTS idx_xiuxian_boss_logs_player_time ON xiuxian_boss_logs(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_world_boss_scope ON xiuxian_world_boss_states(scope_key);
CREATE INDEX IF NOT EXISTS idx_xiuxian_world_boss_rank ON xiuxian_world_boss_contributions(scope_key, cycle_no, total_damage DESC);

