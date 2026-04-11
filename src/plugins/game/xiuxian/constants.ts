export const XIUXIAN_PAGE_SIZE = 10;

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
} as const;

