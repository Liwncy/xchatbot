export const XIUXIAN_PAGE_SIZE = 10;
export const XIUXIAN_LEDGER_DEFAULT_LIMIT = 10;
export const XIUXIAN_LEDGER_MAX_LIMIT = 50;
export const XIUXIAN_SHOP_OFFER_COUNT = 6;
export const XIUXIAN_SHOP_REFRESH_MS = 4 * 60 * 60 * 1000;
export const XIUXIAN_TASK_DEFAULT_LIMIT = 10;

export const XIUXIAN_CHECKIN_REWARD = {
    spiritStone: 30,
    exp: 20,
    cultivation: 25,
} as const;

export const XIUXIAN_WORLD_BOSS = {
    maxRetry: 4,
    rankSize: 5,
    rankMax: 20,
    respawnMs: 5 * 60 * 1000,
} as const;

export const XIUXIAN_TOWER = {
    rankSize: 10,
    rankMax: 30,
} as const;

export const XIUXIAN_TOWER_SEASON_REWARDS = [
    {maxRank: 1, spiritStone: 500, exp: 300, cultivation: 220},
    {maxRank: 3, spiritStone: 300, exp: 200, cultivation: 150},
    {maxRank: 10, spiritStone: 120, exp: 90, cultivation: 70},
] as const;

export const XIUXIAN_COOLDOWN_MS = {
    cultivate: 30_000,
    explore: 60_000,
    challenge: 45_000,
    bossRaid: 90_000,
    towerClimb: 45_000,
} as const;

export const XIUXIAN_DEFAULTS = {
    name: '道友',
    level: 1,
    exp: 0,
    hp: 100,
    maxHp: 100,
    attack: 10,
    defense: 5,
    dodge: 0,
    crit: 0,
    spiritStone: 0,
    cultivation: 0,
    backpackCap: 50,
} as const;

export const XIUXIAN_ACTIONS = {
    cultivate: 'cultivate',
    explore: 'explore',
    challenge: 'challenge',
    bossRaid: 'boss_raid',
    towerClimb: 'tower_climb',
    shop: 'shop',
    buy: 'buy',
    sell: 'sell',
} as const;

