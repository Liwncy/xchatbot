// 修仙占卜 / 每日运势
// 7 档卦象，按权重掷出；买卖/拍卖/商店不受影响，只作用于修炼/探索/战斗/BOSS/爬塔

export type XiuxianFortuneLevel =
    | 'great_bad'
    | 'bad'
    | 'minor_bad'
    | 'neutral'
    | 'minor_good'
    | 'good'
    | 'great_good';

export interface XiuxianFortuneBuff {
    // 修炼结算：经验/灵石/修为 统一倍率（delta，0 表示无变化，0.15 表示 +15%）
    cultivateRate: number;
    // 探索灵石结算倍率（delta）
    exploreRate: number;
    // 战斗时加到玩家攻击的倍率（delta）
    battleAttack: number;
    // 战斗时加到玩家暴击率的绝对值（如 0.05 表示 +5%）
    battleCrit: number;
    // 挑战 / 讨伐 / 爬塔 奖励倍率（delta）；也作用于 PvP 胜负后的 exp/cultivation
    battleReward: number;
}

export interface XiuxianFortuneConfig {
    level: XiuxianFortuneLevel;
    weight: number;
    title: string;
    emoji: string;
    buff: XiuxianFortuneBuff;
    signs: string[];
    note?: string;
}

const ZERO_BUFF: XiuxianFortuneBuff = {
    cultivateRate: 0,
    exploreRate: 0,
    battleAttack: 0,
    battleCrit: 0,
    battleReward: 0,
};

export const XIUXIAN_FORTUNE_CONFIGS: readonly XiuxianFortuneConfig[] = [
    {
        level: 'great_bad',
        weight: 5,
        title: '大凶',
        emoji: '☠️',
        buff: {cultivateRate: -0.15, exploreRate: -0.15, battleAttack: -0.1, battleCrit: 0, battleReward: -0.1},
        signs: [
            '劫数临头，闭关为上',
            '乌云蔽月，道心浮躁，慎言慎行',
            '天狗食月，今日忌远行',
            '煞气缠身，修行事倍功半',
        ],
        note: '今日诸事不顺，修炼与战斗皆受挫折',
    },
    {
        level: 'bad',
        weight: 10,
        title: '凶',
        emoji: '🌫️',
        buff: {cultivateRate: -0.08, exploreRate: -0.08, battleAttack: -0.05, battleCrit: 0, battleReward: -0.05},
        signs: [
            '风雨欲来，谨慎前行',
            '灵气紊乱，修为难进',
            '孤鹤独飞，心神不宁',
        ],
    },
    {
        level: 'minor_bad',
        weight: 15,
        title: '小凶',
        emoji: '🌧️',
        buff: {cultivateRate: -0.03, exploreRate: -0.03, battleAttack: 0, battleCrit: 0, battleReward: 0},
        signs: [
            '道途稍阻，暂且缓行',
            '微澜起涟漪，静心自安',
            '薄雾遮眼，宜守本心',
        ],
    },
    {
        level: 'neutral',
        weight: 40,
        title: '平',
        emoji: '⚖️',
        buff: {...ZERO_BUFF},
        signs: [
            '静水流深，道心自安',
            '晨钟暮鼓，修行有常',
            '云淡风轻，一切如常',
            '不骄不馁，稳步前行',
        ],
    },
    {
        level: 'minor_good',
        weight: 20,
        title: '小吉',
        emoji: '🍀',
        buff: {cultivateRate: 0.05, exploreRate: 0.05, battleAttack: 0.03, battleCrit: 0.02, battleReward: 0.03},
        signs: [
            '微风送福，小试锋芒',
            '灵光乍现，小有所获',
            '喜鹊登梢，近有佳音',
        ],
    },
    {
        level: 'good',
        weight: 8,
        title: '吉',
        emoji: '🌟',
        buff: {cultivateRate: 0.12, exploreRate: 0.12, battleAttack: 0.06, battleCrit: 0.04, battleReward: 0.08},
        signs: [
            '风调雨顺日，修行得玄机',
            '贵人在侧，机缘将至',
            '紫气临门，诸事顺遂',
        ],
    },
    {
        level: 'great_good',
        weight: 2,
        title: '大吉',
        emoji: '🎇',
        buff: {cultivateRate: 0.25, exploreRate: 0.25, battleAttack: 0.1, battleCrit: 0.08, battleReward: 0.15},
        signs: [
            '紫气东来三万里，今朝踏破九重天',
            '金光散灵府，福至自天来',
            '鹤翥青云霄，道心映朝阳',
            '天降祥瑞，破境有望',
        ],
        note: '诸神庇佑，今日修行战斗皆获厚福',
    },
];

const CONFIG_BY_LEVEL: Record<XiuxianFortuneLevel, XiuxianFortuneConfig> = Object.fromEntries(
    XIUXIAN_FORTUNE_CONFIGS.map((cfg) => [cfg.level, cfg]),
) as Record<XiuxianFortuneLevel, XiuxianFortuneConfig>;

export function getFortuneConfig(level: XiuxianFortuneLevel): XiuxianFortuneConfig {
    return CONFIG_BY_LEVEL[level] ?? CONFIG_BY_LEVEL.neutral;
}

/** 根据权重随机一次卦象。 */
export function rollFortuneLevel(rand: () => number = Math.random): XiuxianFortuneLevel {
    const totalWeight = XIUXIAN_FORTUNE_CONFIGS.reduce((s, c) => s + c.weight, 0);
    let r = rand() * totalWeight;
    for (const cfg of XIUXIAN_FORTUNE_CONFIGS) {
        r -= cfg.weight;
        if (r <= 0) return cfg.level;
    }
    return 'neutral';
}

export function pickFortuneSign(level: XiuxianFortuneLevel, rand: () => number = Math.random): string {
    const cfg = getFortuneConfig(level);
    if (!cfg.signs.length) return '';
    const idx = Math.floor(rand() * cfg.signs.length);
    return cfg.signs[Math.min(idx, cfg.signs.length - 1)];
}

/** 产出一次完整的占卜结果（已包含签文）。 */
export function rollFortune(rand: () => number = Math.random): {
    level: XiuxianFortuneLevel;
    buff: XiuxianFortuneBuff;
    sign: string;
} {
    const level = rollFortuneLevel(rand);
    const cfg = getFortuneConfig(level);
    return {level, buff: {...cfg.buff}, sign: pickFortuneSign(level, rand)};
}

/** 改运灵石成本表：已改运次数 -> 本次消耗；返回 null 表示已达上限 */
export const XIUXIAN_FORTUNE_REROLL_COSTS: readonly number[] = [200, 500, 1200, 2500];

export function nextRerollCost(alreadyRerolled: number): number | null {
    if (alreadyRerolled < 0) return XIUXIAN_FORTUNE_REROLL_COSTS[0];
    if (alreadyRerolled >= XIUXIAN_FORTUNE_REROLL_COSTS.length) return null;
    return XIUXIAN_FORTUNE_REROLL_COSTS[alreadyRerolled];
}

export function emptyFortuneBuff(): XiuxianFortuneBuff {
    return {...ZERO_BUFF};
}

/** 将北京时间（UTC+8）下的日期戳化为 YYYY-MM-DD。 */
export function fortuneDayKey(nowMs: number): string {
    // 复用简单算法：在 UTC 时间上加 8 小时，再取 YYYY-MM-DD
    const shifted = new Date(nowMs + 8 * 3600 * 1000);
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const d = String(shifted.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** 将 buff 应用到组合战力：放大攻击、增加暴击。 */
export function applyFortuneToPower<T extends {attack: number; crit: number}>(power: T, buff: XiuxianFortuneBuff): T {
    const atkMul = 1 + (buff.battleAttack || 0);
    const nextAttack = Math.max(1, Math.round(power.attack * atkMul));
    const nextCrit = Math.min(0.7, Math.max(0, power.crit + (buff.battleCrit || 0)));
    return {...power, attack: nextAttack, crit: nextCrit};
}

/** 将 buff 应用到"经验+修为+灵石"类奖励（常用于修炼）。 */
export function applyCultivateRate(gained: number, buff: XiuxianFortuneBuff): number {
    const mul = 1 + (buff.cultivateRate || 0);
    return Math.max(0, Math.round(gained * mul));
}

/** 将 buff 应用到探索灵石。 */
export function applyExploreRate(gained: number, buff: XiuxianFortuneBuff): number {
    const mul = 1 + (buff.exploreRate || 0);
    return Math.max(0, Math.round(gained * mul));
}

/** 将 buff 应用到战斗奖励（挑战/讨伐/爬塔/PvP）。 */
export function applyBattleRewardRate(gained: number, buff: XiuxianFortuneBuff): number {
    const mul = 1 + (buff.battleReward || 0);
    return Math.max(0, Math.round(gained * mul));
}
