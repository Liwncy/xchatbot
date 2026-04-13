import type {CombatPower, EquipmentSlot, XiuxianItem, XiuxianItemQuality, XiuxianPlayer} from './types.js';
import {realmName} from './realm.js';

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
    quality: XiuxianItemQuality;
    attack: number;
    defense: number;
    hp: number;
    dodge: number;
    crit: number;
    score: number;
    isLocked: number;
}

const QUALITY_ORDER: XiuxianItemQuality[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

const QUALITY_WEIGHT: Record<XiuxianItemQuality, number> = {
    common: 50,
    uncommon: 23,
    rare: 14,
    epic: 8,
    legendary: 4,
    mythic: 1,
};

const QUALITY_FACTOR: Record<XiuxianItemQuality, number> = {
    common: 1,
    uncommon: 1.18,
    rare: 1.38,
    epic: 1.7,
    legendary: 2.15,
    mythic: 2.75,
};

const QUALITY_PREFIX: Record<XiuxianItemQuality, string[]> = {
    common: ['白玉', '青木', '朴石', '素纹'],
    uncommon: ['翠玉', '流云', '灵藤', '霜杉'],
    rare: ['碧海', '寒霜', '苍穹', '蓝晶'],
    epic: ['紫霄', '星河', '幽冥', '玄月'],
    legendary: ['金辉', '曜日', '皇极', '天曜'],
    mythic: ['赤霄', '焚天', '红莲', '神凰'],
};

const ITEM_CORE_POOL: Record<EquipmentSlot, string[]> = {
    weapon: ['长剑', '神枪', '灵弓', '战戟', '飞刃', '玄扇', '重锤', '游龙鞭'],
    armor: ['战甲', '法袍', '云裳', '宝衣', '鳞铠', '护腕', '玄盔', '护胫'],
    accessory: ['玉佩', '灵戒', '项链', '手镯', '耳坠', '护符', '星坠', '命牌'],
    sutra: ['灵珠', '宝镜', '古卷', '阵图', '法印', '灵壶', '天灯', '道碑'],
};

const SHOP_PREMIUM: Record<XiuxianItemQuality, number> = {
    common: 0,
    uncommon: 20,
    rare: 45,
    epic: 90,
    legendary: 160,
    mythic: 280,
};

const SELL_PREMIUM: Record<XiuxianItemQuality, number> = {
    common: 0,
    uncommon: 6,
    rare: 15,
    epic: 35,
    legendary: 70,
    mythic: 130,
};

export function exploreDropHintText(): string {
    const total = QUALITY_ORDER.reduce((acc, key) => acc + QUALITY_WEIGHT[key], 0);
    const highTier = QUALITY_WEIGHT.epic + QUALITY_WEIGHT.legendary + QUALITY_WEIGHT.mythic;
    const highTierRate = ((highTier / total) * 100).toFixed(1);
    return `💡 掉装率约 65%，其中高品质（紫/金/红）约 ${highTierRate}%；当前版本暂未开放保底。`;
}

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

function pickOne<T>(list: T[]): T {
    return list[Math.floor(Math.random() * list.length)];
}

function rollQuality(boost = 0): XiuxianItemQuality {
    const total = QUALITY_ORDER.reduce((acc, key) => acc + QUALITY_WEIGHT[key], 0);
    let seed = Math.random() * total;
    for (let i = 0; i < boost; i += 1) {
        if (Math.random() < 0.35) seed += total * 0.12;
    }
    let acc = 0;
    for (const key of QUALITY_ORDER) {
        acc += QUALITY_WEIGHT[key];
        if (seed <= acc) return key;
    }
    return 'common';
}

function buildItemName(type: EquipmentSlot, quality: XiuxianItemQuality): string {
    return `${pickOne(QUALITY_PREFIX[quality])}${pickOne(ITEM_CORE_POOL[type])}`;
}

function scoreOf(attack: number, defense: number, hp: number, dodge: number, crit: number): number {
    return Math.floor(attack * 1.3 + defense * 1.1 + hp / 8 + dodge * 120 + crit * 130);
}

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
    const itemType = pickOne(types);
    const itemLevel = Math.max(1, level + randomInt(-1, 2));
    const quality = rollQuality();
    const factor = QUALITY_FACTOR[quality];
    const baseAtk = randomInt(6, 14) + itemLevel * 2;
    const baseDef = randomInt(5, 12) + Math.floor(itemLevel * 1.7);
    const baseHp = randomInt(40, 110) + itemLevel * 18;
    const attack = itemType === 'weapon' || itemType === 'accessory' || itemType === 'sutra' ? Math.floor(baseAtk * factor) : 0;
    const defense = itemType === 'armor' || itemType === 'accessory' || itemType === 'sutra' ? Math.floor(baseDef * factor) : 0;
    const hp = itemType === 'armor' || itemType === 'accessory' || itemType === 'sutra' ? Math.floor(baseHp * factor) : 0;
    const dodge = itemType === 'accessory' || itemType === 'sutra' ? Number((randomFloat(0.004, 0.02) * factor).toFixed(4)) : 0;
    const crit = itemType === 'weapon' || itemType === 'accessory' || itemType === 'sutra' ? Number((randomFloat(0.005, 0.023) * factor).toFixed(4)) : 0;
    const score = scoreOf(attack, defense, hp, dodge, crit);

    return {
        itemType,
        itemName: buildItemName(itemType, quality),
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
        const loot = rollExploreLoot(level + 2);
        if (loot) items.push(loot);
    }
    while (items.length < count) {
        const types: EquipmentSlot[] = ['weapon', 'armor', 'accessory', 'sutra'];
        const itemType = pickOne(types);
        const itemLevel = Math.max(1, level + randomInt(0, 2));
        const quality = rollQuality(1);
        const factor = QUALITY_FACTOR[quality];
        const baseAtk = randomInt(8, 18) + itemLevel * 3;
        const baseDef = randomInt(7, 16) + Math.floor(itemLevel * 2.2);
        const baseHp = randomInt(80, 180) + itemLevel * 26;
        const attack = itemType === 'weapon' || itemType === 'accessory' || itemType === 'sutra' ? Math.floor(baseAtk * factor) : 0;
        const defense = itemType === 'armor' || itemType === 'accessory' || itemType === 'sutra' ? Math.floor(baseDef * factor) : 0;
        const hp = itemType === 'armor' || itemType === 'accessory' || itemType === 'sutra' ? Math.floor(baseHp * factor) : 0;
        const dodge = itemType === 'accessory' || itemType === 'sutra' ? Number((randomFloat(0.006, 0.025) * factor).toFixed(4)) : 0;
        const crit = itemType === 'weapon' || itemType === 'accessory' || itemType === 'sutra' ? Number((randomFloat(0.007, 0.03) * factor).toFixed(4)) : 0;
        const score = scoreOf(attack, defense, hp, dodge, crit);
        items.push({itemType, itemName: buildItemName(itemType, quality), itemLevel, quality, attack, defense, hp, dodge, crit, score, isLocked: 0});
    }
    return items;
}

export function calcShopPrice(item: LootItem): number {
    const qualityPremium = SHOP_PREMIUM[item.quality] ?? 0;
    return Math.max(25, Math.floor(item.score * 2.3 + item.itemLevel * 10 + qualityPremium));
}

export function calcSellPrice(item: XiuxianItem): number {
    const qualityPremium = SELL_PREMIUM[item.quality] ?? 0;
    return Math.max(8, Math.floor(item.score * 0.58 + item.itemLevel * 3 + qualityPremium));
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
        name: `山野妖兽·${realmName(level)}`,
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
        name: `镇域魔主·${realmName(level + 2)}`,
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

