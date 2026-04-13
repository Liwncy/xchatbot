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

CREATE TABLE IF NOT EXISTS xiuxian_tower_progress (
  player_id INTEGER PRIMARY KEY,
  highest_floor INTEGER NOT NULL DEFAULT 0,
  last_result TEXT,
  last_reward_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_tower_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  floor INTEGER NOT NULL,
  result TEXT NOT NULL,
  rounds INTEGER NOT NULL,
  reward_json TEXT NOT NULL DEFAULT '{}',
  battle_log TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_tower_season_progress (
  season_key TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  highest_floor INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(season_key, player_id),
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_tower_season_claims (
  season_key TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  rank_value INTEGER NOT NULL,
  reward_json TEXT NOT NULL DEFAULT '{}',
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY(season_key, player_id),
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_pets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL UNIQUE,
  pet_name TEXT NOT NULL,
  pet_type TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  affection INTEGER NOT NULL DEFAULT 0,
  feed_count INTEGER NOT NULL DEFAULT 0,
  last_fed_day TEXT,
  in_battle INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_pet_milestone_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  pet_id INTEGER NOT NULL,
  milestone_level INTEGER NOT NULL,
  reward_json TEXT NOT NULL DEFAULT '{}',
  claimed_at INTEGER NOT NULL,
  UNIQUE(player_id, milestone_level),
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id),
  FOREIGN KEY(pet_id) REFERENCES xiuxian_pets(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_npc_encounters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  day_key TEXT NOT NULL,
  event_code TEXT NOT NULL,
  event_title TEXT NOT NULL,
  event_tier TEXT NOT NULL,
  reward_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  UNIQUE(player_id, day_key),
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_bonds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  intimacy INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  last_travel_day TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(requester_id, target_id),
  FOREIGN KEY(requester_id) REFERENCES xiuxian_players(id),
  FOREIGN KEY(target_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_bond_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bond_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  delta_intimacy INTEGER NOT NULL DEFAULT 0,
  reward_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(bond_id) REFERENCES xiuxian_bonds(id),
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_bond_milestone_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bond_id INTEGER NOT NULL,
  player_id INTEGER NOT NULL,
  intimacy_milestone INTEGER NOT NULL,
  reward_json TEXT NOT NULL DEFAULT '{}',
  claimed_at INTEGER NOT NULL,
  UNIQUE(bond_id, intimacy_milestone),
  FOREIGN KEY(bond_id) REFERENCES xiuxian_bonds(id),
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
CREATE INDEX IF NOT EXISTS idx_xiuxian_tower_rank ON xiuxian_tower_progress(highest_floor DESC, updated_at ASC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_tower_logs_player_time ON xiuxian_tower_logs(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_tower_season_rank ON xiuxian_tower_season_progress(season_key, highest_floor DESC, updated_at ASC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_tower_season_claims_player ON xiuxian_tower_season_claims(player_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_pets_level ON xiuxian_pets(level DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_pet_milestone_player ON xiuxian_pet_milestone_claims(player_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_npc_encounters_player_time ON xiuxian_npc_encounters(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_bonds_requester ON xiuxian_bonds(requester_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_bonds_target ON xiuxian_bonds(target_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_bond_logs_bond_time ON xiuxian_bond_logs(bond_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_bond_milestone_claims_bond ON xiuxian_bond_milestone_claims(bond_id, claimed_at DESC);

