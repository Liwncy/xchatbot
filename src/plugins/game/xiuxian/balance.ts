import type {CombatPower, EquipmentSlot, XiuxianItem, XiuxianPlayer} from './types.js';

export interface ProgressResult {
    level: number;
    exp: number;
    maxHp: number;
    attack: number;
    defense: number;
}

export interface LootItem {
    itemType: EquipmentSlot;
    itemName: string;
    itemLevel: number;
    quality: string;
    attack: number;
    defense: number;
    hp: number;
    dodge: number;
    crit: number;
    score: number;
    isLocked: number;
}

function qualityFactor(quality: string): number {
    if (quality === 'epic') return 1.5;
    if (quality === 'rare') return 1.2;
    return 1;
}

const ITEM_POOL: Record<EquipmentSlot, string[]> = {
    weapon: ['玄铁剑', '青锋剑', '流云刀', '赤炎枪'],
    armor: ['布衣甲', '玄鳞甲', '青铜甲', '云纹甲'],
    accessory: ['灵玉佩', '青木戒', '玄光坠', '流云镯'],
    sutra: ['凝神诀', '玄元经', '太清录', '九转心经'],
};

function expNeed(level: number): number {
    return 100 + (level - 1) * 60;
}

export function applyExpProgress(player: XiuxianPlayer, gainedExp: number): ProgressResult {
    let level = player.level;
    let exp = player.exp + gainedExp;
    let maxHp = player.maxHp;
    let attack = player.attack;
    let defense = player.defense;

    while (exp >= expNeed(level)) {
        exp -= expNeed(level);
        level += 1;
        maxHp += 20;
        attack += 3;
        defense += 2;
    }

    return {level, exp, maxHp, attack, defense};
}

export function cultivateReward(level: number, times: number): {gainedCultivation: number; gainedExp: number; gainedStone: number} {
    const gainedCultivation = times * (8 + level * 2);
    const gainedExp = times * (12 + level);
    const gainedStone = times * (3 + Math.floor(level / 2));
    return {gainedCultivation, gainedExp, gainedStone};
}

export function exploreStoneReward(level: number): number {
    return 6 + Math.floor(level * 1.5) + Math.floor(Math.random() * 8);
}

export function rollExploreLoot(level: number): LootItem | null {
    if (Math.random() < 0.35) return null;

    const types: EquipmentSlot[] = ['weapon', 'armor', 'accessory', 'sutra'];
    const itemType = types[Math.floor(Math.random() * types.length)];
    const names = ITEM_POOL[itemType];
    const itemName = names[Math.floor(Math.random() * names.length)];
    const itemLevel = Math.max(1, level + Math.floor(Math.random() * 3) - 1);

    const qualitySeed = Math.random();
    const quality = qualitySeed > 0.95 ? 'epic' : qualitySeed > 0.75 ? 'rare' : 'common';
    const factor = qualityFactor(quality);

    const base = 4 + itemLevel * 2;
    const attack = itemType === 'weapon' || itemType === 'accessory' || itemType === 'sutra' ? Math.floor(base * factor) : 0;
    const defense = itemType === 'armor' || itemType === 'accessory' || itemType === 'sutra' ? Math.floor(base * 0.8 * factor) : 0;
    const hp = itemType === 'armor' || itemType === 'accessory' || itemType === 'sutra' ? Math.floor(base * 6 * factor) : 0;
    const dodge = itemType === 'accessory' || itemType === 'sutra' ? Number((Math.random() * 0.04).toFixed(4)) : 0;
    const crit = itemType === 'weapon' || itemType === 'accessory' || itemType === 'sutra' ? Number((Math.random() * 0.05).toFixed(4)) : 0;
    const score = Math.floor(attack * 1.2 + defense + hp / 8 + dodge * 100 + crit * 120);

    return {
        itemType,
        itemName,
        itemLevel,
        quality,
        attack,
        defense,
        hp,
        dodge,
        crit,
        score,
        isLocked: 0,
    };
}

export function generateShopItems(level: number, count: number): LootItem[] {
    const items: LootItem[] = [];
    let guard = 0;
    while (items.length < count && guard < count * 10) {
        guard += 1;
        const loot = rollExploreLoot(level + 1);
        if (loot) items.push(loot);
    }
    while (items.length < count) {
        const types: EquipmentSlot[] = ['weapon', 'armor', 'accessory', 'sutra'];
        const itemType = types[Math.floor(Math.random() * types.length)];
        const names = ITEM_POOL[itemType];
        const itemName = names[Math.floor(Math.random() * names.length)];
        const itemLevel = Math.max(1, level);
        const base = 4 + itemLevel * 2;
        const attack = itemType === 'weapon' || itemType === 'accessory' || itemType === 'sutra' ? base : 0;
        const defense = itemType === 'armor' || itemType === 'accessory' || itemType === 'sutra' ? Math.floor(base * 0.8) : 0;
        const hp = itemType === 'armor' || itemType === 'accessory' || itemType === 'sutra' ? base * 6 : 0;
        const dodge = itemType === 'accessory' || itemType === 'sutra' ? 0.01 : 0;
        const crit = itemType === 'weapon' || itemType === 'accessory' || itemType === 'sutra' ? 0.01 : 0;
        const score = Math.floor(attack * 1.2 + defense + hp / 8 + dodge * 100 + crit * 120);
        items.push({itemType, itemName, itemLevel, quality: 'common', attack, defense, hp, dodge, crit, score, isLocked: 0});
    }
    return items;
}

export function calcShopPrice(item: LootItem): number {
    const qualityPremium = item.quality === 'epic' ? 80 : item.quality === 'rare' ? 30 : 0;
    return Math.max(25, Math.floor(item.score * 2.1 + item.itemLevel * 8 + qualityPremium));
}

export function calcSellPrice(item: XiuxianItem): number {
    const qualityPremium = item.quality === 'epic' ? 25 : item.quality === 'rare' ? 10 : 0;
    return Math.max(8, Math.floor(item.score * 0.55 + item.itemLevel * 3 + qualityPremium));
}

export function calcCombatPower(player: XiuxianPlayer, equipped: XiuxianItem[]): CombatPower {
    const sum = equipped.reduce(
        (acc, item) => {
            acc.attack += item.attack;
            acc.defense += item.defense;
            acc.maxHp += item.hp;
            acc.dodge += item.dodge;
            acc.crit += item.crit;
            return acc;
        },
        {attack: 0, defense: 0, maxHp: 0, dodge: 0, crit: 0},
    );

    return {
        attack: player.attack + sum.attack,
        defense: player.defense + sum.defense,
        maxHp: player.maxHp + sum.maxHp,
        dodge: Math.min(0.6, player.dodge + sum.dodge),
        crit: Math.min(0.7, player.crit + sum.crit),
    };
}

export function challengeEnemy(level: number): CombatPower & {name: string; level: number} {
    return {
        name: `山野妖兽 Lv.${level}`,
        level,
        attack: 8 + level * 3,
        defense: 5 + level * 2,
        maxHp: 80 + level * 30,
        dodge: Math.min(0.35, 0.03 + level * 0.002),
        crit: Math.min(0.35, 0.05 + level * 0.002),
    };
}

export function runSimpleBattle(player: CombatPower, enemy: CombatPower): {win: boolean; rounds: number; logs: string[]} {
    let playerHp = player.maxHp;
    let enemyHp = enemy.maxHp;
    const logs: string[] = [];
    let rounds = 0;

    while (playerHp > 0 && enemyHp > 0 && rounds < 20) {
        rounds += 1;
        const pHit = Math.random() >= enemy.dodge;
        if (pHit) {
            const pCrit = Math.random() < player.crit;
            const pDmgBase = Math.max(1, player.attack - enemy.defense);
            const pDmg = pCrit ? Math.floor(pDmgBase * 1.6) : pDmgBase;
            enemyHp -= pDmg;
            logs.push(`第${rounds}回合：你造成${pDmg}伤害${pCrit ? '（暴击）' : ''}`);
        } else {
            logs.push(`第${rounds}回合：你的攻击被闪避`);
        }
        if (enemyHp <= 0) break;

        const eHit = Math.random() >= player.dodge;
        if (eHit) {
            const eCrit = Math.random() < enemy.crit;
            const eDmgBase = Math.max(1, enemy.attack - player.defense);
            const eDmg = eCrit ? Math.floor(eDmgBase * 1.5) : eDmgBase;
            playerHp -= eDmg;
            logs.push(`第${rounds}回合：敌人造成${eDmg}伤害${eCrit ? '（暴击）' : ''}`);
        } else {
            logs.push(`第${rounds}回合：你闪避了敌人的攻击`);
        }
    }

    return {win: enemyHp <= 0 && playerHp > 0, rounds, logs};
}

export function bossEnemy(level: number): CombatPower & {name: string; level: number} {
    return {
        name: `镇域魔主 Lv.${level + 2}`,
        level: level + 2,
        attack: 16 + level * 4,
        defense: 10 + level * 3,
        maxHp: 220 + level * 55,
        dodge: Math.min(0.28, 0.05 + level * 0.002),
        crit: Math.min(0.32, 0.08 + level * 0.002),
    };
}

export function bossRewards(level: number, win: boolean): {gainedExp: number; gainedStone: number; gainedCultivation: number} {
    if (!win) {
        return {
            gainedExp: 8 + level * 2,
            gainedStone: 6 + level,
            gainedCultivation: 10 + level * 2,
        };
    }
    return {
        gainedExp: 40 + level * 8,
        gainedStone: 30 + level * 5,
        gainedCultivation: 45 + level * 7,
    };
}

export function runBossBattle(player: CombatPower, enemy: CombatPower): {win: boolean; rounds: number; logs: string[]; enemyHpLeft: number} {
    let playerHp = player.maxHp;
    let enemyHp = enemy.maxHp;
    const logs: string[] = [];
    let rounds = 0;

    while (playerHp > 0 && enemyHp > 0 && rounds < 25) {
        rounds += 1;
        const pHit = Math.random() >= enemy.dodge;
        if (pHit) {
            const pCrit = Math.random() < player.crit;
            const pDmgBase = Math.max(1, player.attack - enemy.defense);
            const pDmg = pCrit ? Math.floor(pDmgBase * 1.75) : pDmgBase;
            enemyHp -= pDmg;
            logs.push(`第${rounds}回合：你对BOSS造成${pDmg}伤害${pCrit ? '（暴击）' : ''}`);
        } else {
            logs.push(`第${rounds}回合：你的攻击被BOSS闪避`);
        }
        if (enemyHp <= 0) break;

        const eHit = Math.random() >= player.dodge;
        if (eHit) {
            const eCrit = Math.random() < enemy.crit;
            const eDmgBase = Math.max(1, enemy.attack - player.defense);
            const eDmg = eCrit ? Math.floor(eDmgBase * 1.6) : eDmgBase;
            playerHp -= eDmg;
            logs.push(`第${rounds}回合：BOSS造成${eDmg}伤害${eCrit ? '（暴击）' : ''}`);
        } else {
            logs.push(`第${rounds}回合：你闪避了BOSS攻击`);
        }
    }

    return {win: enemyHp <= 0 && playerHp > 0, rounds, logs, enemyHpLeft: Math.max(0, enemyHp)};
}

