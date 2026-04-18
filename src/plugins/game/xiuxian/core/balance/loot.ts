import type {EquipmentSlot, XiuxianItem, XiuxianItemQuality} from '../types/index.js';
import type {LootItem} from './models.js';
import {findPrefixSetByPrefix} from './prefix-set.js';

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

const EQUIPMENT_BASE_STATS: Record<EquipmentSlot, {attack: number; defense: number; hp: number; dodge: number; crit: number}> = {
    weapon: {attack: 12, defense: 0, hp: 0, dodge: 0, crit: 0.012},
    armor: {attack: 0, defense: 10, hp: 120, dodge: 0, crit: 0},
    accessory: {attack: 9, defense: 8, hp: 90, dodge: 0.01, crit: 0.011},
    sutra: {attack: 11, defense: 9, hp: 100, dodge: 0.011, crit: 0.012},
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

const ITEM_ROLL_VARIANCE = 0.08;
const EXPLORE_NO_DROP_RATE = 0.25;

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

function buildItemMeta(type: EquipmentSlot, quality: XiuxianItemQuality): {itemName: string; setKey?: string; setName?: string} {
    const prefix = pickOne(QUALITY_PREFIX[quality]);
    const core = pickOne(ITEM_CORE_POOL[type]);
    const cfg = findPrefixSetByPrefix(prefix);
    return {
        itemName: `${prefix}${core}`,
        setKey: cfg?.setKey,
        setName: cfg?.setName,
    };
}

function scoreOf(attack: number, defense: number, hp: number, dodge: number, crit: number): number {
    return Math.floor(attack * 1.3 + defense * 1.1 + hp / 8 + dodge * 120 + crit * 130);
}

function centeredRollMultiplier(): number {
    const centered = (Math.random() + Math.random()) / 2;
    const span = ITEM_ROLL_VARIANCE * 2;
    return 1 - ITEM_ROLL_VARIANCE + centered * span;
}

function rollIntStat(baseValue: number): number {
    if (baseValue <= 0) return 0;
    return Math.max(1, Math.floor(baseValue * centeredRollMultiplier()));
}

function rollRateStat(baseValue: number): number {
    if (baseValue <= 0) return 0;
    return Number((baseValue * centeredRollMultiplier()).toFixed(4));
}

function rolledLootStats(itemType: EquipmentSlot, quality: XiuxianItemQuality): {attack: number; defense: number; hp: number; dodge: number; crit: number; score: number} {
    const factor = QUALITY_FACTOR[quality];
    const base = EQUIPMENT_BASE_STATS[itemType];
    const attack = rollIntStat(base.attack * factor);
    const defense = rollIntStat(base.defense * factor);
    const hp = rollIntStat(base.hp * factor);
    const dodge = rollRateStat(base.dodge * factor);
    const crit = rollRateStat(base.crit * factor);
    const score = scoreOf(attack, defense, hp, dodge, crit);
    return {attack, defense, hp, dodge, crit, score};
}

export function exploreDropHintText(): string {
    const total = QUALITY_ORDER.reduce((acc, key) => acc + QUALITY_WEIGHT[key], 0);
    const highTier = QUALITY_WEIGHT.epic + QUALITY_WEIGHT.legendary + QUALITY_WEIGHT.mythic;
    const highTierRate = ((highTier / total) * 100).toFixed(1);
    const dropRate = ((1 - EXPLORE_NO_DROP_RATE) * 100).toFixed(0);
    return `💡 掉装率约 ${dropRate}%，其中高品质（紫/金/红）约 ${highTierRate}%。`;
}

export function rollExploreLoot(_level: number): LootItem | null {
    if (Math.random() < EXPLORE_NO_DROP_RATE) return null;

    const types: EquipmentSlot[] = ['weapon', 'armor', 'accessory', 'sutra'];
    const itemType = pickOne(types);
    const itemLevel = 1;
    const quality = rollQuality();
    const {attack, defense, hp, dodge, crit, score} = rolledLootStats(itemType, quality);
    const itemMeta = buildItemMeta(itemType, quality);

    return {
        itemType,
        itemName: itemMeta.itemName,
        itemLevel,
        quality,
        attack,
        defense,
        hp,
        dodge,
        crit,
        score,
        setKey: itemMeta.setKey,
        setName: itemMeta.setName,
        isLocked: 0,
    };
}

export function generateShopItems(level: number, count: number): LootItem[] {
    void level;
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
        const itemLevel = 1;
        const quality = rollQuality(1);
        const {attack, defense, hp, dodge, crit, score} = rolledLootStats(itemType, quality);
        const itemMeta = buildItemMeta(itemType, quality);
        items.push({
            itemType,
            itemName: itemMeta.itemName,
            itemLevel,
            quality,
            attack,
            defense,
            hp,
            dodge,
            crit,
            score,
            setKey: itemMeta.setKey,
            setName: itemMeta.setName,
            isLocked: 0,
        });
    }
    return items;
}

export function calcShopPrice(item: LootItem): number {
    const qualityPremium = SHOP_PREMIUM[item.quality] ?? 0;
    return Math.max(25, Math.floor(item.score * 2.3 + qualityPremium));
}

export function calcSellPrice(item: XiuxianItem): number {
    const qualityPremium = SELL_PREMIUM[item.quality] ?? 0;
    return Math.max(8, Math.floor(item.score * 0.58 + qualityPremium));
}