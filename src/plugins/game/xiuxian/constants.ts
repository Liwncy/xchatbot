export const XIUXIAN_PAGE_SIZE = 10;
export const XIUXIAN_LEDGER_DEFAULT_LIMIT = 10;
export const XIUXIAN_LEDGER_MAX_LIMIT = 50;
export const XIUXIAN_SHOP_OFFER_COUNT = 6;
export const XIUXIAN_SHOP_REFRESH_MS = 4 * 60 * 60 * 1000;

export const XIUXIAN_COOLDOWN_MS = {
    cultivate: 30_000,
    explore: 60_000,
    challenge: 45_000,
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
    shop: 'shop',
    buy: 'buy',
    sell: 'sell',
} as const;

