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
    setKey?: string;
    setName?: string;
    isLocked: number;
}

export interface SetBonusSummary {
    attack: number;
    defense: number;
    maxHp: number;
    dodge: number;
    crit: number;
    attackPct: number;
    defensePct: number;
    maxHpPct: number;
    dodgePct: number;
    critPct: number;
    lines: string[];
}

export interface SetStatMod {
    attack?: number;
    defense?: number;
    maxHp?: number;
    dodge?: number;
    crit?: number;
    attackPct?: number;
    defensePct?: number;
    maxHpPct?: number;
    dodgePct?: number;
    critPct?: number;
}

export interface PrefixSetConfig {
    prefix: string;
    setKey: string;
    setName: string;
    single?: SetStatMod;
    bonus2?: SetStatMod;
    bonus4?: SetStatMod;
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

// Prefix-driven set config entry point: tune flat/percent by prefix here.
const DEFAULT_PREFIX_SET_CONFIG: PrefixSetConfig[] = [
    {
        prefix: '焚天',
        setKey: 'fentian',
        setName: '焚天套',
        single: {attack: 14, crit: 0.006},
        bonus2: {attack: 24, crit: 0.01},
        bonus4: {attack: 36, attackPct: 0.08, crit: 0.012},
    },
    {
        prefix: '赤霄',
        setKey: 'chixiao',
        setName: '赤霄套',
        single: {attack: 8, defense: 8},
        bonus2: {attack: 14, defense: 14, maxHp: 120},
        bonus4: {attack: 22, defense: 22, maxHp: 220, defensePct: 0.06},
    },
    {
        prefix: '红莲',
        setKey: 'honglian',
        setName: '红莲套',
        single: {maxHp: 90, crit: 0.004},
        bonus2: {maxHp: 180, defense: 10},
        bonus4: {maxHp: 320, maxHpPct: 0.08, crit: 0.012},
    },
    {
        prefix: '神凰',
        setKey: 'shenhuang',
        setName: '神凰套',
        single: {dodge: 0.004, crit: 0.004},
        bonus2: {dodge: 0.008, crit: 0.008, attack: 10},
        bonus4: {dodge: 0.012, crit: 0.012, attack: 18, critPct: 0.06},
    },
];

let activePrefixSetConfig: PrefixSetConfig[] = DEFAULT_PREFIX_SET_CONFIG;
let PREFIX_SET_CONFIG_BY_PREFIX = new Map(activePrefixSetConfig.map((cfg) => [cfg.prefix, cfg]));
let PREFIX_SET_CONFIG_BY_KEY = new Map(activePrefixSetConfig.map((cfg) => [cfg.setKey, cfg]));

function rebuildPrefixSetIndexes(configs: PrefixSetConfig[]): void {
    PREFIX_SET_CONFIG_BY_PREFIX = new Map(configs.map((cfg) => [cfg.prefix, cfg]));
    PREFIX_SET_CONFIG_BY_KEY = new Map(configs.map((cfg) => [cfg.setKey, cfg]));
}

function normalizePrefixSetConfig(raw: PrefixSetConfig[]): PrefixSetConfig[] {
    return raw
        .map((cfg) => ({
            prefix: String(cfg.prefix ?? '').trim(),
            setKey: String(cfg.setKey ?? '').trim(),
            setName: String(cfg.setName ?? '').trim(),
            single: cfg.single,
            bonus2: cfg.bonus2,
            bonus4: cfg.bonus4,
        }))
        .filter((cfg) => cfg.prefix && cfg.setKey && cfg.setName);
}

export function getDefaultPrefixSetConfig(): PrefixSetConfig[] {
    return DEFAULT_PREFIX_SET_CONFIG.map((cfg) => ({...cfg}));
}

export function setPrefixSetConfig(configs: PrefixSetConfig[] | null | undefined): void {
    const normalized = normalizePrefixSetConfig(configs ?? []);
    if (!normalized.length) {
        activePrefixSetConfig = DEFAULT_PREFIX_SET_CONFIG;
        rebuildPrefixSetIndexes(activePrefixSetConfig);
        return;
    }
    activePrefixSetConfig = normalized;
    rebuildPrefixSetIndexes(activePrefixSetConfig);
}

// Small affix roll range around the center value (same slot+quality now has slight variance).
const ITEM_ROLL_VARIANCE = 0.08;

export function exploreDropHintText(): string {
    const total = QUALITY_ORDER.reduce((acc, key) => acc + QUALITY_WEIGHT[key], 0);
    const highTier = QUALITY_WEIGHT.epic + QUALITY_WEIGHT.legendary + QUALITY_WEIGHT.mythic;
    const highTierRate = ((highTier / total) * 100).toFixed(1);
    return `💡 掉装率约 65%，其中高品质（紫/金/红）约 ${highTierRate}%。`;
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

function buildItemMeta(type: EquipmentSlot, quality: XiuxianItemQuality): {itemName: string; setKey?: string; setName?: string} {
    const prefix = pickOne(QUALITY_PREFIX[quality]);
    const core = pickOne(ITEM_CORE_POOL[type]);
    const cfg = PREFIX_SET_CONFIG_BY_PREFIX.get(prefix);
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
    // Triangular-like distribution: most rolls stay near center, edge rolls are rarer.
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

function rolledLootStats(itemType: EquipmentSlot, quality: XiuxianItemQuality): {
    attack: number;
    defense: number;
    hp: number;
    dodge: number;
    crit: number;
    score: number;
} {
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

export function rollExploreLoot(_level: number): LootItem | null {
    if (Math.random() < 0.35) return null;

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

function addScaledMod(summary: SetBonusSummary, mod: SetStatMod | undefined, scale = 1): void {
    if (!mod) return;
    summary.attack += (mod.attack ?? 0) * scale;
    summary.defense += (mod.defense ?? 0) * scale;
    summary.maxHp += (mod.maxHp ?? 0) * scale;
    summary.dodge += (mod.dodge ?? 0) * scale;
    summary.crit += (mod.crit ?? 0) * scale;
    summary.attackPct += (mod.attackPct ?? 0) * scale;
    summary.defensePct += (mod.defensePct ?? 0) * scale;
    summary.maxHpPct += (mod.maxHpPct ?? 0) * scale;
    summary.dodgePct += (mod.dodgePct ?? 0) * scale;
    summary.critPct += (mod.critPct ?? 0) * scale;
}

function formatModLine(mod: SetStatMod | undefined): string {
    if (!mod) return '无';
    const fields: string[] = [];
    if (mod.attack) fields.push(`攻+${mod.attack}`);
    if (mod.defense) fields.push(`防+${mod.defense}`);
    if (mod.maxHp) fields.push(`血+${mod.maxHp}`);
    if (mod.dodge) fields.push(`闪+${(mod.dodge * 100).toFixed(2)}%`);
    if (mod.crit) fields.push(`暴+${(mod.crit * 100).toFixed(2)}%`);
    if (mod.attackPct) fields.push(`攻+${(mod.attackPct * 100).toFixed(1)}%`);
    if (mod.defensePct) fields.push(`防+${(mod.defensePct * 100).toFixed(1)}%`);
    if (mod.maxHpPct) fields.push(`血+${(mod.maxHpPct * 100).toFixed(1)}%`);
    if (mod.dodgePct) fields.push(`闪+${(mod.dodgePct * 100).toFixed(1)}%`);
    if (mod.critPct) fields.push(`暴+${(mod.critPct * 100).toFixed(1)}%`);
    return fields.join(' ');
}

export function calcSetBonusSummary(equipped: XiuxianItem[]): SetBonusSummary {
    const grouped = new Map<string, {name: string; pieces: number; cfg?: PrefixSetConfig}>();
    for (const item of equipped) {
        if (!item.setKey || !item.setName) continue;
        const prev = grouped.get(item.setKey);
        if (prev) {
            prev.pieces += 1;
            continue;
        }
        grouped.set(item.setKey, {name: item.setName, pieces: 1, cfg: PREFIX_SET_CONFIG_BY_KEY.get(item.setKey)});
    }

    const summary: SetBonusSummary = {
        attack: 0,
        defense: 0,
        maxHp: 0,
        dodge: 0,
        crit: 0,
        attackPct: 0,
        defensePct: 0,
        maxHpPct: 0,
        dodgePct: 0,
        critPct: 0,
        lines: [],
    };
    for (const stat of grouped.values()) {
        addScaledMod(summary, stat.cfg?.single, stat.pieces);
        if (stat.cfg?.single) {
            summary.lines.push(`🔹 ${stat.name} 词缀x${stat.pieces}：${formatModLine(stat.cfg.single)}`);
        }
        if (stat.pieces >= 2) {
            addScaledMod(summary, stat.cfg?.bonus2);
            if (stat.cfg?.bonus2) summary.lines.push(`✨ ${stat.name} 2件：${formatModLine(stat.cfg.bonus2)}`);
        }
        if (stat.pieces >= 4) {
            addScaledMod(summary, stat.cfg?.bonus4);
            if (stat.cfg?.bonus4) summary.lines.push(`🌟 ${stat.name} 4件：${formatModLine(stat.cfg.bonus4)}`);
        }
    }
    return summary;
}

export function calcShopPrice(item: LootItem): number {
    const qualityPremium = SHOP_PREMIUM[item.quality] ?? 0;
    return Math.max(25, Math.floor(item.score * 2.3 + qualityPremium));
}

export function calcSellPrice(item: XiuxianItem): number {
    const qualityPremium = SELL_PREMIUM[item.quality] ?? 0;
    return Math.max(8, Math.floor(item.score * 0.58 + qualityPremium));
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

    const setBonus = calcSetBonusSummary(equipped);
    const attackBase = player.attack + sum.attack + setBonus.attack;
    const defenseBase = player.defense + sum.defense + setBonus.defense;
    const maxHpBase = player.maxHp + sum.maxHp + setBonus.maxHp;
    const dodgeBase = player.dodge + sum.dodge + setBonus.dodge;
    const critBase = player.crit + sum.crit + setBonus.crit;
    return {
        attack: Math.floor(attackBase * (1 + setBonus.attackPct)),
        defense: Math.floor(defenseBase * (1 + setBonus.defensePct)),
        maxHp: Math.floor(maxHpBase * (1 + setBonus.maxHpPct)),
        dodge: Math.min(0.6, Number((dodgeBase * (1 + setBonus.dodgePct)).toFixed(4))),
        crit: Math.min(0.7, Number((critBase * (1 + setBonus.critPct)).toFixed(4))),
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

