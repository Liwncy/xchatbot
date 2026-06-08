export const XIUXIAN_PAGE_SIZE = 10;
export const XIUXIAN_LEDGER_DEFAULT_LIMIT = 10;
export const XIUXIAN_LEDGER_MAX_LIMIT = 50;
export const XIUXIAN_SHOP_OFFER_COUNT = 6;
export const XIUXIAN_SHOP_REFRESH_MS = 4 * 60 * 60 * 1000;
export const XIUXIAN_TASK_DEFAULT_LIMIT = 10;

export const XIUXIAN_AUCTION = {
    minStartPrice: 10,
    minIncrement: 5,
    feeRateBp: 500,
    minDurationMinutes: 10,
    maxDurationMinutes: 24 * 60,
    defaultDurationMinutes: 120,
    listSize: 10,
    listMax: 50,
    settleBatchSize: 20,
} as const;

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
    quickClimbMax: 20,
    enemy: {
        baseAttack: 10,
        baseDefense: 6,
        baseHp: 100,
        levelAttack: 2,
        levelDefense: 1,
        levelHp: 20,
        floorAttack: 2.2,
        floorDefense: 1.1,
        floorHp: 38,
        floorSpikeStart: 20,
        floorSpikeEvery: 10,
        spikeAttackPct: 0.06,
        spikeDefensePct: 0.04,
        spikeHpPct: 0.09,
        dodgeBase: 0.03,
        critBase: 0.04,
        dodgePerFloor: 0.002,
        critPerFloor: 0.002,
        dodgeCap: 0.26,
        critCap: 0.31,
    },
} as const;

export const XIUXIAN_TOWER_SEASON_REWARDS = [
    {maxRank: 1, spiritStone: 500, exp: 300, cultivation: 220},
    {maxRank: 3, spiritStone: 300, exp: 200, cultivation: 150},
    {maxRank: 10, spiritStone: 120, exp: 90, cultivation: 70},
] as const;

export const XIUXIAN_PET_MILESTONE_REWARDS = [
    {level: 10, spiritStone: 60, exp: 40, cultivation: 35},
    {level: 20, spiritStone: 120, exp: 85, cultivation: 70},
    {level: 30, spiritStone: 220, exp: 150, cultivation: 120},
] as const;

export const XIUXIAN_PET_GACHA = {
    drawCost: 160,
    hardPityUr: 90,
    hardPityUp: 180,
    baseUrRate: 0.02,
    softPityStart: 70,
    softPityStep: 0.02,
    upUrRate: 0.5,
    duplicateFeedCompensation: {
        r: {itemKey: 'pet-snack-basic', itemName: '灵宠饲丸', feedLevel: 1, feedAffection: 8, quantity: 1},
        sr: {itemKey: 'pet-snack-advanced', itemName: '灵宠珍饲丸', feedLevel: 2, feedAffection: 12, quantity: 1},
        ur: {itemKey: 'pet-snack-legendary', itemName: '灵宠天饲丸', feedLevel: 3, feedAffection: 18, quantity: 1},
    },
} as const;

export const XIUXIAN_PET_GROWTH = {
    feedExpUnit: 12,
    dailyFeedExp: 14,
    expNeedBase: 34,
    expNeedLinear: 16,
    expNeedQuadratic: 2.1,
} as const;

export const XIUXIAN_NPC_ENCOUNTER_POOL = [
    {code: 'warm_tea', title: '山路茶摊', tier: 'common', weight: 40, spiritStone: 18, exp: 12, cultivation: 10},
    {code: 'traveler_tip', title: '旅者点拨', tier: 'rare', weight: 30, spiritStone: 28, exp: 20, cultivation: 16},
    {code: 'cave_cache', title: '洞窟秘藏', tier: 'epic', weight: 20, spiritStone: 42, exp: 30, cultivation: 24},
    {code: 'elder_bless', title: '前辈赐福', tier: 'legend', weight: 10, spiritStone: 60, exp: 45, cultivation: 36},
] as const;

export const XIUXIAN_BOND_MILESTONE_REWARDS = [
    {intimacy: 100, spiritStone: 50, exp: 35, cultivation: 30},
    {intimacy: 300, spiritStone: 120, exp: 85, cultivation: 70},
    {intimacy: 600, spiritStone: 260, exp: 180, cultivation: 140},
] as const;

export const XIUXIAN_COOLDOWN_MS = {
    cultivate: 30_000,
    explore: 60_000,
    challenge: 45_000,
    bossRaid: 90_000,
    towerClimb: 45_000,
} as const;

export const XIUXIAN_PVP = {
    sparRequestExpireMs: 5 * 60 * 1000,
    maxLevelGap: 8,
    forceFightCooldownMs: 30 * 1000,
    forceFightShieldMs: 30 * 1000,
    lootRate: 0.08,
    lootCap: 120,
    lootRatePerLevelDelta: 0.005,
    minLootRate: 0.04,
    maxLootRate: 0.12,
    lootCapPerLevelDelta: 8,
    minLootCap: 56,
    maxLootCap: 184,
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
    spar: 'spar',
    forceFight: 'force_fight',
    forceFightShield: 'force_fight_shield',
    bossRaid: 'boss_raid',
    towerClimb: 'tower_climb',
    shop: 'shop',
    buy: 'buy',
    sell: 'sell',
} as const;

export const XIUXIAN_TERMS = {
    realm: {
        label: '境界',
        currentLabel: '当前境界',
        mortalName: '凡人',
        maxName: '九天玄仙九阶',
        stageUnit: '阶',
        numericPrefix: '第',
        numericSuffix: '级',
    },
    pet: {
        levelLabel: '灵宠等级',
        currentLevelLabel: '当前灵宠等级',
    },
    item: {
        levelLabel: '装备等级',
    },
} as const;
