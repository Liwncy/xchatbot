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
  set_key TEXT,
  set_name TEXT,
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
  player_id INTEGER NOT NULL,
  pet_name TEXT NOT NULL,
  pet_type TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL DEFAULT 0,
  affection INTEGER NOT NULL DEFAULT 0,
  feed_count INTEGER NOT NULL DEFAULT 0,
  last_fed_day TEXT,
  in_battle INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_pet_bag (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  item_key TEXT NOT NULL,
  item_name TEXT NOT NULL,
  feed_level INTEGER NOT NULL DEFAULT 0,
  feed_affection INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(player_id, item_key),
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

CREATE TABLE IF NOT EXISTS xiuxian_pet_banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  banner_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  draw_cost INTEGER NOT NULL DEFAULT 120,
  hard_pity_ur INTEGER NOT NULL DEFAULT 90,
  hard_pity_up INTEGER NOT NULL DEFAULT 180,
  up_pet_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS xiuxian_pet_banner_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  banner_id INTEGER NOT NULL,
  pet_name TEXT NOT NULL,
  pet_type TEXT NOT NULL,
  rarity TEXT NOT NULL DEFAULT 'r',
  weight INTEGER NOT NULL DEFAULT 1,
  is_up INTEGER NOT NULL DEFAULT 0,
  UNIQUE(banner_id, pet_name),
  FOREIGN KEY(banner_id) REFERENCES xiuxian_pet_banners(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_pet_draw_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  banner_key TEXT NOT NULL,
  draw_index INTEGER NOT NULL,
  pet_name TEXT NOT NULL,
  pet_type TEXT NOT NULL,
  rarity TEXT NOT NULL,
  is_up INTEGER NOT NULL DEFAULT 0,
  cost_spirit_stone INTEGER NOT NULL DEFAULT 0,
  is_duplicate INTEGER NOT NULL DEFAULT 0,
  compensation_stone INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_pet_pity_states (
  player_id INTEGER NOT NULL,
  banner_key TEXT NOT NULL,
  total_draws INTEGER NOT NULL DEFAULT 0,
  since_ur INTEGER NOT NULL DEFAULT 0,
  since_up INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(player_id, banner_key),
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_pet_exclusive_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_name TEXT NOT NULL UNIQUE,
  exclusive_trait TEXT NOT NULL DEFAULT '',
  skill_name TEXT NOT NULL DEFAULT '',
  skill_desc TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO xiuxian_pet_exclusive_profiles (
  pet_name, exclusive_trait, skill_name, skill_desc, updated_at
) VALUES
  ('九霄青鸾', '天风庇佑：最终伤害小幅提升', '九霄风域', '每 5 次修炼额外获得 1 次灵石结算', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('玄冥白泽', '玄冥守意：防御与气血成长更高', '白泽灵护', '出战时额外提升防御与气血加成', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('赤焰灵狐', '炎脉活化：暴击成长增强', '赤炎追击', '亲密度达到 90 时提升额外暴击收益', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('沧浪灵龟', '潮息共鸣：修炼收益稳定提升', '沧浪稳息', '修炼时灵石加成更平滑，波动更小', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('风语月兔', '风语轻盈：闪避判定略有提升', '月影步', '高亲密时更容易触发闪避收益', CAST(strftime('%s','now') AS INTEGER) * 1000);

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

CREATE TABLE IF NOT EXISTS xiuxian_pvp_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  mode TEXT NOT NULL DEFAULT 'spar',
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(requester_id) REFERENCES xiuxian_players(id),
  FOREIGN KEY(target_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_refine_materials (
  player_id INTEGER NOT NULL,
  material_key TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(player_id, material_key),
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_item_refines (
  item_id INTEGER PRIMARY KEY,
  refine_level INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(item_id) REFERENCES xiuxian_inventory(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_auctions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL,
  item_payload_json TEXT NOT NULL,
  start_price INTEGER NOT NULL,
  current_price INTEGER NOT NULL,
  current_bidder_id INTEGER,
  min_increment INTEGER NOT NULL DEFAULT 1,
  fee_rate_bp INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  end_at INTEGER NOT NULL,
  settled_at INTEGER,
  version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(seller_id) REFERENCES xiuxian_players(id),
  FOREIGN KEY(current_bidder_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_auction_bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id INTEGER NOT NULL,
  bidder_id INTEGER NOT NULL,
  bid_price INTEGER NOT NULL,
  idempotency_key TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(auction_id) REFERENCES xiuxian_auctions(id),
  FOREIGN KEY(bidder_id) REFERENCES xiuxian_players(id)
);

CREATE TABLE IF NOT EXISTS xiuxian_auction_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auction_id INTEGER NOT NULL,
  seller_id INTEGER NOT NULL,
  winner_id INTEGER,
  final_price INTEGER NOT NULL DEFAULT 0,
  fee_amount INTEGER NOT NULL DEFAULT 0,
  seller_receive INTEGER NOT NULL DEFAULT 0,
  result TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  settled_at INTEGER NOT NULL,
  FOREIGN KEY(auction_id) REFERENCES xiuxian_auctions(id),
  FOREIGN KEY(seller_id) REFERENCES xiuxian_players(id),
  FOREIGN KEY(winner_id) REFERENCES xiuxian_players(id)
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
CREATE INDEX IF NOT EXISTS idx_xiuxian_pets_player ON xiuxian_pets(player_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_xiuxian_pets_active_unique ON xiuxian_pets(player_id) WHERE in_battle = 1;
CREATE INDEX IF NOT EXISTS idx_xiuxian_pet_bag_player ON xiuxian_pet_bag(player_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_pet_milestone_player ON xiuxian_pet_milestone_claims(player_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_pet_banners_active ON xiuxian_pet_banners(status, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_xiuxian_pet_banner_entries_banner ON xiuxian_pet_banner_entries(banner_id, rarity, weight DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_pet_draw_logs_player_time ON xiuxian_pet_draw_logs(player_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_xiuxian_pet_draw_logs_idem ON xiuxian_pet_draw_logs(player_id, idempotency_key, draw_index);
CREATE INDEX IF NOT EXISTS idx_xiuxian_pet_exclusive_name ON xiuxian_pet_exclusive_profiles(pet_name);
CREATE INDEX IF NOT EXISTS idx_xiuxian_npc_encounters_player_time ON xiuxian_npc_encounters(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_bonds_requester ON xiuxian_bonds(requester_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_bonds_target ON xiuxian_bonds(target_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_bond_logs_bond_time ON xiuxian_bond_logs(bond_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_bond_milestone_claims_bond ON xiuxian_bond_milestone_claims(bond_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_pvp_requests_outgoing ON xiuxian_pvp_requests(requester_id, target_id, mode, status, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_pvp_requests_incoming ON xiuxian_pvp_requests(target_id, mode, status, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_refine_materials_player ON xiuxian_refine_materials(player_id, material_key);
CREATE INDEX IF NOT EXISTS idx_xiuxian_item_refines_level ON xiuxian_item_refines(refine_level DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_auctions_active ON xiuxian_auctions(status, end_at, id DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_auctions_seller ON xiuxian_auctions(seller_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_xiuxian_auction_bids_auction_time ON xiuxian_auction_bids(auction_id, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_xiuxian_auction_bids_idem ON xiuxian_auction_bids(auction_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_xiuxian_auction_settle_unique ON xiuxian_auction_settlements(auction_id);



-- 修仙占卜（每日运势）
CREATE TABLE IF NOT EXISTS xiuxian_fortunes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  day_key TEXT NOT NULL,              -- 北京时间 YYYY-MM-DD
  level TEXT NOT NULL,                -- great_bad/bad/minor_bad/neutral/minor_good/good/great_good
  buff_json TEXT NOT NULL DEFAULT '{}',
  sign_text TEXT NOT NULL DEFAULT '',
  reroll_count INTEGER NOT NULL DEFAULT 0,
  reroll_spent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(player_id, day_key),
  FOREIGN KEY(player_id) REFERENCES xiuxian_players(id)
);
CREATE INDEX IF NOT EXISTS idx_xiuxian_fortunes_day ON xiuxian_fortunes(day_key);
