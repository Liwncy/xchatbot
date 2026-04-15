import type {IncomingMessage, HandlerResponse} from '../../../types/message.js';
import {logger} from '../../../utils/logger.js';
import {
    XIUXIAN_ACTIONS,
    XIUXIAN_CHECKIN_REWARD,
    XIUXIAN_COOLDOWN_MS,
    XIUXIAN_DEFAULTS,
    XIUXIAN_LEDGER_DEFAULT_LIMIT,
    XIUXIAN_LEDGER_MAX_LIMIT,
    XIUXIAN_PAGE_SIZE,
    XIUXIAN_SHOP_OFFER_COUNT,
    XIUXIAN_SHOP_REFRESH_MS,
    XIUXIAN_TASK_DEFAULT_LIMIT,
    XIUXIAN_PET_MILESTONE_REWARDS,
    XIUXIAN_PET_GROWTH,
    XIUXIAN_BOND_MILESTONE_REWARDS,
    XIUXIAN_PET_GACHA,
    XIUXIAN_NPC_ENCOUNTER_POOL,
    XIUXIAN_TOWER,
    XIUXIAN_TOWER_SEASON_REWARDS,
    XIUXIAN_TERMS,
    XIUXIAN_WORLD_BOSS,
} from './constants.js';
import type {
    XiuxianAchievementDef,
    XiuxianBagQuery,
    XiuxianCommand,
    XiuxianIdentity,
    XiuxianItem,
    XiuxianPlayer,
    XiuxianShopOffer,
    XiuxianTaskDef,
    XiuxianWorldBossState,
    XiuxianItemQuality,
    XiuxianPetBannerEntry,
} from './types.js';
import {XiuxianRepository} from './repository.js';
import {formatRealm, realmName} from './realm.js';
import {formatBeijingTime} from './time.js';
import {
    applyExpProgress,
    calcSetBonusSummary,
    bossEnemy,
    bossRewards,
    calcSellPrice,
    calcCombatPower,
    calcShopPrice,
    challengeEnemy,
    cultivateReward,
    exploreStoneReward,
    exploreDropHintText,
    generateShopItems,
    getDefaultPrefixSetConfig,
    rollExploreLoot,
    runBossBattle,
    runSimpleBattle,
    setPrefixSetConfig,
} from './balance.js';

const XIUXIAN_SET_CONFIG_KV_KEY = 'xiuxian:equipment:set-config';
const XIUXIAN_SET_CONFIG_CACHE_MS = 60_000;
let xiuxianSetConfigCacheAt = 0;

async function tryLoadSetConfigFromKv(kv: KVNamespace | undefined, now: number): Promise<void> {
    if (!kv) return;
    if (now - xiuxianSetConfigCacheAt < XIUXIAN_SET_CONFIG_CACHE_MS) return;
    xiuxianSetConfigCacheAt = now;
    try {
        const raw = await kv.get(XIUXIAN_SET_CONFIG_KV_KEY);
        if (!raw) {
            setPrefixSetConfig(getDefaultPrefixSetConfig());
            return;
        }
        const parsed = JSON.parse(raw) as {prefixSets?: unknown} | unknown;
        const configs = Array.isArray(parsed)
            ? parsed
            : Array.isArray((parsed as {prefixSets?: unknown})?.prefixSets)
                ? (parsed as {prefixSets: unknown[]}).prefixSets
                : [];
        if (!configs.length) {
            setPrefixSetConfig(getDefaultPrefixSetConfig());
            logger.warn('[xiuxian] set config in KV is empty, fallback to default');
            return;
        }
        setPrefixSetConfig(configs as never[]);
    } catch (error) {
        setPrefixSetConfig(getDefaultPrefixSetConfig());
        logger.warn('[xiuxian] failed to parse set config from KV, fallback to default', {error});
    }
}
import {
    bagText,
    battleDetailText,
    battleLogText,
    bondActivatedText,
    bondBreakText,
    bondLogText,
    bondRequestText,
    bondStatusText,
    bondTravelText,
    bossDetailText,
    bossLogText,
    bossRaidText,
    buyResultText,
    checkinText,
    claimTaskBatchText,
    claimTaskText,
    cooldownText,
    createdText,
    dismantleResultText,
    economyLogText,
    equipText,
    helpText,
    achievementText,
    npcEncounterLogText,
    npcEncounterText,
    petAdoptText,
    petBagText,
    petBattleStateText,
    petFeedText,
    refineMaterialText,
    refineDetailText,
    refineResultText,
    sellBatchResultText,
    petStatusText,
    sellResultText,
    shopText,
    statusText,
    taskText,
    towerClimbText,
    towerFastClimbText,
    towerDetailText,
    towerLogText,
    towerRankText,
    towerSeasonKeyText,
    towerSeasonRewardText,
    towerSeasonClaimText,
    towerSeasonAutoClaimNoticeText,
    towerSeasonRankText,
    towerSeasonStatusText,
    towerSeasonSelfRankText,
    towerSelfRankText,
    towerStatusText,
    unequipText,
    worldBossRankText,
    worldBossSelfRankText,
    worldBossStatusText,
} from './reply.js';

const XIUXIAN_PET_STARTER_ITEM = {
    itemKey: 'pet-snack-basic',
    itemName: '灵宠饲丸',
    feedLevel: 1,
    feedAffection: 8,
    quantity: 3,
};

const XIUXIAN_LIMITED_PET_POOL = [
    {
        petName: '九霄青鸾',
        petType: '限定',
        rarity: 'ur',
        weight: 50,
        isUp: 1,
        exclusiveTrait: '天风庇佑：最终伤害小幅提升',
        skillName: '九霄风域',
        skillDesc: '每 5 次修炼额外获得 1 次灵石结算',
    },
    {
        petName: '玄冥白泽',
        petType: '限定',
        rarity: 'ur',
        weight: 50,
        isUp: 0,
        exclusiveTrait: '玄冥守意：防御与气血成长更高',
        skillName: '白泽灵护',
        skillDesc: '出战时额外提升防御与气血加成',
    },
    {
        petName: '赤焰灵狐',
        petType: '珍稀',
        rarity: 'sr',
        weight: 280,
        isUp: 0,
        exclusiveTrait: '炎脉活化：暴击成长增强',
        skillName: '赤炎追击',
        skillDesc: '亲密度达到 90 时提升额外暴击收益',
    },
    {
        petName: '沧浪灵龟',
        petType: '珍稀',
        rarity: 'sr',
        weight: 280,
        isUp: 0,
        exclusiveTrait: '潮息共鸣：修炼收益稳定提升',
        skillName: '沧浪稳息',
        skillDesc: '修炼时灵石加成更平滑，波动更小',
    },
    {
        petName: '风语月兔',
        petType: '灵兽',
        rarity: 'r',
        weight: 620,
        isUp: 0,
        exclusiveTrait: '风语轻盈：闪避判定略有提升',
        skillName: '月影步',
        skillDesc: '高亲密时更容易触发闪避收益',
    },
] as const;

async function limitedPetProfileOf(
    repo: XiuxianRepository,
    petName: string,
): Promise<{trait: string; skillName: string; skillDesc: string} | null> {
    const fromDb = await repo.findPetExclusiveProfileByName(petName);
    if (fromDb) {
        return {
            trait: fromDb.exclusiveTrait,
            skillName: fromDb.skillName,
            skillDesc: fromDb.skillDesc,
        };
    }

    const item = XIUXIAN_LIMITED_PET_POOL.find((it) => it.petName === petName);
    if (!item) return null;
    return {
        trait: item.exclusiveTrait,
        skillName: item.skillName,
        skillDesc: item.skillDesc,
    };
}

function rarityLabel(rarity: string): string {
    if (rarity === 'ur') return 'UR';
    if (rarity === 'sr') return 'SR';
    return 'R';
}

function identityFromMessage(message: IncomingMessage): XiuxianIdentity {
    return {platform: 'wechat', userId: message.from};
}

function asText(content: string): HandlerResponse {
    return {type: 'text', content};
}

async function mustPlayer(repo: XiuxianRepository, identity: XiuxianIdentity): Promise<XiuxianPlayer | null> {
    return repo.findPlayer(identity);
}

async function checkCooldown(repo: XiuxianRepository, playerId: number, action: string, now: number): Promise<number> {
    const cd = await repo.getCooldown(playerId, action);
    if (!cd) return 0;
    return Math.max(0, cd.nextAt - now);
}

function resolveBagFilter(raw: string | undefined): {query?: XiuxianBagQuery; label?: string; error?: string} {
    if (!raw) return {};
    const parts = raw
        .trim()
        .split(/\s+/)
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
    if (!parts.length) return {};

    const query: XiuxianBagQuery = {};
    const labels: string[] = [];

    for (const key of parts) {
        if (key === '武器' || key === '神兵' || key === 'weapon') {
            query.itemType = 'weapon';
            labels.push('神兵');
            continue;
        }
        if (key === '护甲' || key === 'armor') {
            query.itemType = 'armor';
            labels.push('护甲');
            continue;
        }
        if (key === '灵宝' || key === 'accessory') {
            query.itemType = 'accessory';
            labels.push('灵宝');
            continue;
        }
        if (key === '法器' || key === 'sutra') {
            query.itemType = 'sutra';
            labels.push('法器');
            continue;
        }

        if (key === '普通' || key === '白' || key === 'common') {
            query.quality = 'common';
            labels.push('普通(白)');
            continue;
        }
        if (key === '优秀' || key === '精良' || key === '绿' || key === 'uncommon') {
            query.quality = 'uncommon';
            labels.push('优秀(绿)');
            continue;
        }
        if (key === '稀有' || key === '蓝' || key === 'rare') {
            query.quality = 'rare';
            labels.push('稀有(蓝)');
            continue;
        }
        if (key === '史诗' || key === '紫' || key === 'epic') {
            query.quality = 'epic';
            labels.push('史诗(紫)');
            continue;
        }
        if (key === '传说' || key === '金' || key === 'legendary') {
            query.quality = 'legendary';
            labels.push('传说(金)');
            continue;
        }
        if (key === '神话' || key === '红' || key === 'mythic') {
            query.quality = 'mythic';
            labels.push('神话(红)');
            continue;
        }

        if (key === '评分降序' || key === '评分高' || key === 'scoredesc') {
            query.sort = 'score_desc';
            labels.push('评分降序');
            continue;
        }
        if (key === '评分升序' || key === '评分低' || key === 'scoreasc') {
            query.sort = 'score_asc';
            labels.push('评分升序');
            continue;
        }
        if (key === '最新' || key === '时间' || key === 'timedesc') {
            query.sort = 'id_desc';
            labels.push('时间倒序');
            continue;
        }

        return {error: '⚠️ 背包参数仅支持：神兵/护甲/灵宝/法器/普通(白)/优秀(绿)/稀有(蓝)/史诗(紫)/传说(金)/神话(红)/评分降序/评分升序/最新'};
    }

    return {query, label: labels.join(' + ')};
}

function parseOfferItem(offer: XiuxianShopOffer): Omit<XiuxianItem, 'id' | 'playerId' | 'createdAt'> | null {
    try {
        const data = JSON.parse(offer.itemPayloadJson) as Record<string, unknown>;
        return {
            itemType: String(data.itemType) as XiuxianItem['itemType'],
            itemName: String(data.itemName),
            itemLevel: Math.max(1, Number(data.itemLevel) || 1),
            quality: String(data.quality) as XiuxianItemQuality,
            attack: Number(data.attack),
            defense: Number(data.defense),
            hp: Number(data.hp),
            dodge: Number(data.dodge),
            crit: Number(data.crit),
            score: Number(data.score),
            setKey: data.setKey == null ? undefined : String(data.setKey),
            setName: data.setName == null ? undefined : String(data.setName),
            isLocked: Number(data.isLocked ?? 0),
        };
    } catch {
        return null;
    }
}

function qualityLabel(quality: XiuxianItemQuality): string {
    if (quality === 'mythic') return '神话(红)';
    if (quality === 'legendary') return '传说(金)';
    if (quality === 'epic') return '史诗(紫)';
    if (quality === 'rare') return '稀有(蓝)';
    if (quality === 'uncommon') return '优秀(绿)';
    return '普通(白)';
}

const QUALITY_RANK: Record<XiuxianItemQuality, number> = {
    common: 1,
    uncommon: 2,
    rare: 3,
    epic: 4,
    legendary: 5,
    mythic: 6,
};

const XIUXIAN_REFINE_MATERIAL_KEY = 'refine_essence';
const XIUXIAN_REFINE_MATERIAL_LABEL = '玄铁精华';
const XIUXIAN_REFINE_SAFETY_CAP = 500;

function refineMaterialGain(item: XiuxianItem, refineLevel: number): number {
    const qualityBase = QUALITY_RANK[item.quality] * 2;
    const scoreBase = Math.max(1, Math.floor(item.score / 22));
    const refineBack = Math.max(0, Math.floor(refineLevel * 0.6));
    return qualityBase + scoreBase + refineBack;
}

function refineCostForLevel(level: number): {essence: number; stone: number} {
    return {
        essence: 10 + Math.floor(level * 1.6),
        stone: 5 + Math.floor(level * 1.1),
    };
}

function refineBonusByLevel(item: XiuxianItem, level: number): {attack: number; defense: number; hp: number; dodge: number; crit: number} {
    if (level <= 0) return {attack: 0, defense: 0, hp: 0, dodge: 0, crit: 0};
    const attack = item.itemType === 'weapon' ? level * 2 : item.itemType === 'accessory' || item.itemType === 'sutra' ? level : 0;
    const defense = item.itemType === 'armor' ? level * 2 : item.itemType === 'accessory' || item.itemType === 'sutra' ? level : 0;
    const hp = item.itemType === 'armor' ? level * 18 : item.itemType === 'accessory' || item.itemType === 'sutra' ? level * 10 : 0;
    const dodge = item.itemType === 'accessory' || item.itemType === 'sutra' ? Number((level * 0.0008).toFixed(4)) : 0;
    const crit = item.itemType === 'weapon' || item.itemType === 'accessory' || item.itemType === 'sutra' ? Number((level * 0.001).toFixed(4)) : 0;
    return {attack, defense, hp, dodge, crit};
}

async function enhanceItemsWithRefine(repo: XiuxianRepository, playerId: number, items: XiuxianItem[]): Promise<XiuxianItem[]> {
    if (!items.length) return items;
    const refineMap = await repo.listItemRefineLevels(
        playerId,
        items.map((v) => v.id),
    );
    return items.map((item) => {
        const refineLevel = refineMap.get(item.id) ?? 0;
        if (refineLevel <= 0) return {...item, refineLevel: 0};
        const bonus = refineBonusByLevel(item, refineLevel);
        return {
            ...item,
            itemName: `${item.itemName}·炼+${refineLevel}`,
            attack: item.attack + bonus.attack,
            defense: item.defense + bonus.defense,
            hp: item.hp + bonus.hp,
            dodge: Number((item.dodge + bonus.dodge).toFixed(4)),
            crit: Number((item.crit + bonus.crit).toFixed(4)),
            score: item.score + Math.floor(bonus.attack * 1.3 + bonus.defense * 1.1 + bonus.hp / 8 + bonus.dodge * 120 + bonus.crit * 130),
            refineLevel,
        };
    });
}

async function ensureShopOffers(repo: XiuxianRepository, player: XiuxianPlayer, now: number): Promise<XiuxianShopOffer[]> {
    const active = await repo.listShopOffers(player.id, now);
    if (active.length > 0) return active;

    const refreshedAt = now;
    const expiresAt = now + XIUXIAN_SHOP_REFRESH_MS;
    const generated = generateShopItems(player.level, XIUXIAN_SHOP_OFFER_COUNT);
    await repo.clearShopOffers(player.id);
    for (let i = 0; i < generated.length; i += 1) {
        const item = generated[i];
        await repo.createShopOffer(
            player.id,
            {
                offerKey: `offer-${player.id}-${refreshedAt}-${i + 1}`,
                itemPayloadJson: JSON.stringify(item),
                priceSpiritStone: calcShopPrice(item),
                stock: 1,
                refreshedAt,
                expiresAt,
            },
            now,
        );
    }
    return repo.listShopOffers(player.id, now);
}

function bossScopeKeyOfMessage(message: IncomingMessage): string {
    void message;
    return 'world:global';
}

function worldBossHp(level: number): number {
    return 500 + level * 120;
}

function towerEnemy(level: number, floor: number): {name: string; attack: number; defense: number; maxHp: number; dodge: number; crit: number} {
    const cfg = XIUXIAN_TOWER.enemy;
    const spikeSteps = floor > cfg.floorSpikeStart
        ? Math.floor((floor - cfg.floorSpikeStart - 1) / cfg.floorSpikeEvery) + 1
        : 0;
    const attackMul = 1 + spikeSteps * cfg.spikeAttackPct;
    const defenseMul = 1 + spikeSteps * cfg.spikeDefensePct;
    const hpMul = 1 + spikeSteps * cfg.spikeHpPct;

    const attackRaw = cfg.baseAttack + level * cfg.levelAttack + floor * cfg.floorAttack;
    const defenseRaw = cfg.baseDefense + level * cfg.levelDefense + floor * cfg.floorDefense;
    const hpRaw = cfg.baseHp + level * cfg.levelHp + floor * cfg.floorHp;

    return {
        name: `镇塔守卫·${realmName(level)}（第${floor}层）`,
        attack: Math.floor(attackRaw * attackMul),
        defense: Math.floor(defenseRaw * defenseMul),
        maxHp: Math.floor(hpRaw * hpMul),
        dodge: Math.min(cfg.dodgeCap, cfg.dodgeBase + floor * cfg.dodgePerFloor),
        crit: Math.min(cfg.critCap, cfg.critBase + floor * cfg.critPerFloor),
    };
}

function towerRewards(level: number, floor: number, win: boolean): {spiritStone: number; exp: number; cultivation: number} {
    if (!win) {
        return {
            spiritStone: 2 + Math.floor(floor / 3),
            exp: 5 + level + floor,
            cultivation: 6 + level + floor,
        };
    }
    return {
        spiritStone: 10 + floor * 3,
        exp: 20 + level * 2 + floor * 6,
        cultivation: 25 + level * 2 + floor * 5,
    };
}

function towerSeasonKey(now: number): string {
    const dt = new Date(now + 8 * 60 * 60 * 1000);
    const day = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - day);
    const year = dt.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

function previousTowerSeasonKey(now: number): string {
    return towerSeasonKey(now - 7 * 24 * 60 * 60 * 1000);
}

function towerSeasonWindow(now: number): {seasonKey: string; settleAt: number} {
    const dayMs = 24 * 60 * 60 * 1000;
    const bjNowMs = now + 8 * 60 * 60 * 1000;
    const bj = new Date(bjNowMs);
    const weekDay = bj.getUTCDay() === 0 ? 7 : bj.getUTCDay();
    const midnight = new Date(bj);
    midnight.setUTCHours(0, 0, 0, 0);
    const weekStartBj = midnight.getTime() - (weekDay - 1) * dayMs;
    const nextWeekStartUtc = weekStartBj + 7 * dayMs - 8 * 60 * 60 * 1000;
    return {
        seasonKey: towerSeasonKey(now),
        settleAt: nextWeekStartUtc,
    };
}

function formatCountdown(ms: number): string {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (d > 0) return `${d}天${h}时${m}分${s}秒`;
    return `${h}时${m}分${s}秒`;
}

function weekStartOf(now: number): number {
    const dayMs = 24 * 60 * 60 * 1000;
    const bjNowMs = now + 8 * 60 * 60 * 1000;
    const bj = new Date(bjNowMs);
    const weekDay = bj.getUTCDay() === 0 ? 7 : bj.getUTCDay();
    const midnight = new Date(bj);
    midnight.setUTCHours(0, 0, 0, 0);
    const weekStartBj = midnight.getTime() - (weekDay - 1) * dayMs;
    return weekStartBj - 8 * 60 * 60 * 1000;
}

function seasonRewardByRank(rank: number): {spiritStone: number; exp: number; cultivation: number} | null {
    for (const tier of XIUXIAN_TOWER_SEASON_REWARDS) {
        if (rank <= tier.maxRank) {
            return {
                spiritStone: tier.spiritStone,
                exp: tier.exp,
                cultivation: tier.cultivation,
            };
        }
    }
    return null;
}

function pickNpcEncounter(): {
    code: string;
    title: string;
    tier: string;
    spiritStone: number;
    exp: number;
    cultivation: number;
} {
    const total = XIUXIAN_NPC_ENCOUNTER_POOL.reduce((sum, it) => sum + it.weight, 0);
    let point = Math.random() * total;
    for (const it of XIUXIAN_NPC_ENCOUNTER_POOL) {
        point -= it.weight;
        if (point <= 0) {
            return {
                code: it.code,
                title: it.title,
                tier: it.tier,
                spiritStone: it.spiritStone,
                exp: it.exp,
                cultivation: it.cultivation,
            };
        }
    }
    const tail = XIUXIAN_NPC_ENCOUNTER_POOL[XIUXIAN_NPC_ENCOUNTER_POOL.length - 1];
    return {
        code: tail.code,
        title: tail.title,
        tier: tail.tier,
        spiritStone: tail.spiritStone,
        exp: tail.exp,
        cultivation: tail.cultivation,
    };
}

async function tryAutoClaimPreviousSeasonReward(
    repo: XiuxianRepository,
    player: XiuxianPlayer,
    now: number,
): Promise<{seasonKey: string; rank: number; reward: {spiritStone: number; exp: number; cultivation: number}} | null> {
    const lastSeason = previousTowerSeasonKey(now);
    const claimed = await repo.findTowerSeasonClaim(player.id, lastSeason);
    if (claimed) return null;

    const rankRow = await repo.findTowerSeasonRank(lastSeason, player.id);
    if (!rankRow?.rank) return null;

    const reward = seasonRewardByRank(rankRow.rank);
    if (!reward) return null;

    const progress = applyExpProgress(player, reward.exp);
    player.level = progress.level;
    player.exp = progress.exp;
    player.maxHp = progress.maxHp;
    player.attack = progress.attack;
    player.defense = progress.defense;
    player.hp = progress.maxHp;
    player.spiritStone += reward.spiritStone;
    player.cultivation += reward.cultivation;
    await repo.updatePlayer(player, now);

    const rewardJson = JSON.stringify({
        seasonKey: lastSeason,
        rank: rankRow.rank,
        spiritStone: reward.spiritStone,
        exp: reward.exp,
        cultivation: reward.cultivation,
        source: 'auto_on_participation',
    });
    await repo.addTowerSeasonClaim(player.id, lastSeason, rankRow.rank, rewardJson, now);
    await repo.createEconomyLog({
        playerId: player.id,
        bizType: 'reward',
        deltaSpiritStone: reward.spiritStone,
        balanceAfter: player.spiritStone,
        refType: 'tower_season',
        refId: rankRow.rank,
        idempotencyKey: `${player.id}:tower-season-auto:${lastSeason}`,
        extraJson: rewardJson,
        now,
    });

    return {
        seasonKey: lastSeason,
        rank: rankRow.rank,
        reward,
    };
}

async function ensureWorldBossState(
    repo: XiuxianRepository,
    scopeKey: string,
    level: number,
    now: number,
): Promise<XiuxianWorldBossState> {
    const existed = await repo.findWorldBossState(scopeKey);
    if (existed && existed.status === 'alive') return existed;
    if (existed && existed.status === 'defeated') {
        const baseTime = existed.defeatedAt ?? existed.updatedAt;
        if (now - baseTime < XIUXIAN_WORLD_BOSS.respawnMs) return existed;
    }

    const nextCycle = (existed?.cycleNo ?? 0) + 1;
    const boss = bossEnemy(level);
    const maxHp = worldBossHp(Math.max(level, boss.level));
    await repo.createWorldBossState({
        scopeKey,
        cycleNo: nextCycle,
        bossName: boss.name,
        bossLevel: boss.level,
        maxHp,
        startedAt: now,
        now,
    });
    const created = await repo.findWorldBossState(scopeKey);
    if (!created) throw new Error('创建世界BOSS状态失败');
    return created;
}

function petPowerRate(petType: string): {combat: number; cultivateStone: number} {
    if (petType.includes('限定')) return {combat: 1.35, cultivateStone: 1.5};
    if (petType.includes('珍稀')) return {combat: 1.15, cultivateStone: 1.2};
    return {combat: 1, cultivateStone: 1};
}

function petCultivateStoneBonus(pet: {level: number; affection: number; petType: string} | null, times: number): number {
    if (!pet) return 0;
    const per = Math.floor(pet.level / 5) + (pet.affection >= 50 ? 1 : 0);
    if (per <= 0) return 0;
    const rate = petPowerRate(pet.petType).cultivateStone;
    return Math.floor(per * times * rate);
}

function petCombatBonus(pet: {level: number; affection: number; petType?: string; inBattle?: number} | null): {
    attack: number;
    defense: number;
    maxHp: number;
    dodge: number;
    crit: number;
} {
    if (!pet || pet.inBattle === 0) return {attack: 0, defense: 0, maxHp: 0, dodge: 0, crit: 0};
    const rate = petPowerRate(pet.petType ?? '灵兽').combat;
    const attack = Math.floor((Math.floor(pet.level / 4) + (pet.affection >= 60 ? 2 : 0)) * rate);
    const defense = Math.floor((Math.floor(pet.level / 5) + (pet.affection >= 80 ? 2 : 0)) * rate);
    const maxHp = Math.floor((pet.level * 6 + pet.affection) * rate);
    const dodge = pet.affection >= 70 ? 0.01 : 0;
    const crit = pet.affection >= 90 ? 0.01 : 0;
    return {attack, defense, maxHp, dodge, crit};
}

async function ensureWeeklyPetBanner(repo: XiuxianRepository, now: number) {
    const dayMs = 24 * 60 * 60 * 1000;
    const season = towerSeasonKey(now);
    const bannerKey = `pet-weekly-${season}`;
    const startAt = weekStartOf(now);
    const endAt = startAt + 7 * dayMs;
    const upPet = XIUXIAN_LIMITED_PET_POOL.find((it) => it.rarity === 'ur' && it.isUp === 1)?.petName ?? null;

    await repo.upsertPetBanner(
        {
            bannerKey,
            title: `${season} 限定灵宠卡池`,
            status: 'active',
            startAt,
            endAt,
            drawCost: XIUXIAN_PET_GACHA.drawCost,
            hardPityUr: XIUXIAN_PET_GACHA.hardPityUr,
            hardPityUp: XIUXIAN_PET_GACHA.hardPityUp,
            upPetName: upPet,
        },
        now,
    );
    const banner = await repo.findPetBannerByKey(bannerKey);
    if (!banner) throw new Error('限定卡池初始化失败');
    const entries = await repo.listPetBannerEntries(banner.id);
    if (!entries.length) {
        await repo.replacePetBannerEntries(banner.id, [...XIUXIAN_LIMITED_PET_POOL]);
    }

    const active = await repo.findActivePetBanner(now);
    if (active) {
        const activeEntries = await repo.listPetBannerEntries(active.id);
        return {banner: active, entries: activeEntries};
    }
    return {banner, entries: await repo.listPetBannerEntries(banner.id)};
}

function pickByWeight(entries: XiuxianPetBannerEntry[]): XiuxianPetBannerEntry {
    const safe = entries.filter((it) => it.weight > 0);
    if (!safe.length) throw new Error('卡池权重配置为空');
    const total = safe.reduce((sum, it) => sum + it.weight, 0);
    let point = Math.random() * total;
    for (const it of safe) {
        point -= it.weight;
        if (point <= 0) return it;
    }
    return safe[safe.length - 1];
}

function urRateByPity(sinceUr: number): number {
    if (sinceUr < XIUXIAN_PET_GACHA.softPityStart) return XIUXIAN_PET_GACHA.baseUrRate;
    const extra = (sinceUr - XIUXIAN_PET_GACHA.softPityStart + 1) * XIUXIAN_PET_GACHA.softPityStep;
    return Math.min(1, XIUXIAN_PET_GACHA.baseUrRate + extra);
}

function rollPetDrawEntry(
    entries: XiuxianPetBannerEntry[],
    pity: {totalDraws: number; sinceUr: number; sinceUp: number},
    hardPityUr: number,
    hardPityUp: number,
): {entry: XiuxianPetBannerEntry; isUr: boolean; isUp: boolean} {
    const urEntries = entries.filter((it) => it.rarity === 'ur');
    const upUrEntries = urEntries.filter((it) => it.isUp === 1);
    const fallbackEntries = entries.filter((it) => it.rarity !== 'ur');

    const mustUr = pity.sinceUr + 1 >= hardPityUr;
    const hitUr = mustUr || Math.random() < urRateByPity(pity.sinceUr);

    if (hitUr) {
        const mustUp = pity.sinceUp + 1 >= hardPityUp;
        const wantUp = mustUp || Math.random() < XIUXIAN_PET_GACHA.upUrRate;
        const entry = wantUp && upUrEntries.length > 0
            ? pickByWeight(upUrEntries)
            : (urEntries.length > 0 ? pickByWeight(urEntries) : pickByWeight(entries));
        const isUp = entry.isUp === 1;
        pity.totalDraws += 1;
        pity.sinceUr = 0;
        pity.sinceUp = isUp ? 0 : pity.sinceUp + 1;
        return {entry, isUr: true, isUp};
    }

    const entry = fallbackEntries.length > 0 ? pickByWeight(fallbackEntries) : pickByWeight(entries);
    pity.totalDraws += 1;
    pity.sinceUr += 1;
    pity.sinceUp += 1;
    return {entry, isUr: false, isUp: false};
}

function mergeCombatPower(
    base: {attack: number; defense: number; maxHp: number; dodge: number; crit: number},
    bonus: {attack: number; defense: number; maxHp: number; dodge: number; crit: number},
): {attack: number; defense: number; maxHp: number; dodge: number; crit: number} {
    return {
        attack: base.attack + bonus.attack,
        defense: base.defense + bonus.defense,
        maxHp: base.maxHp + bonus.maxHp,
        dodge: Math.min(0.6, base.dodge + bonus.dodge),
        crit: Math.min(0.7, base.crit + bonus.crit),
    };
}

function dayKeyOf(now: number): string {
    return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function parseJsonRecord(raw: string): Record<string, unknown> {
    try {
        const value = JSON.parse(raw) as unknown;
        if (!value || typeof value !== 'object') return {};
        return value as Record<string, unknown>;
    } catch {
        return {};
    }
}

function extractGroupMentionedUserIds(message: IncomingMessage): string[] {
    if (message.source !== 'group') return [];
    const raw = message.raw as {new_messages?: Array<{msg_id?: number; new_msg_id?: number; msg_source?: string}>} | null;
    const items = Array.isArray(raw?.new_messages) ? raw.new_messages : [];
    if (!items.length) return [];

    const target = items.find(
        (it) => String(it?.msg_id ?? '') === message.messageId || String(it?.new_msg_id ?? '') === message.messageId,
    ) ?? items[0];
    const source = String(target?.msg_source ?? '');
    if (!source) return [];

    const match = source.match(/<atuserlist>([\s\S]*?)<\/atuserlist>/i);
    if (!match?.[1]) return [];
    return match[1]
        .split(',')
        .map((v) => v.trim())
        .filter((v) => Boolean(v) && v !== 'notify@all');
}

function resolveBondTarget(message: IncomingMessage, rawInput?: string): {targetUserId?: string; error?: string} {
    const input = (rawInput ?? '').trim();
    const mentioned = extractGroupMentionedUserIds(message);

    if (mentioned.length > 1) {
        return {error: '⚠️ 结缘一次仅支持 @1 位道友，请重新发送。'};
    }
    if (mentioned.length === 1) {
        return {targetUserId: mentioned[0]};
    }

    if (!input) {
        return {error: '💡 用法：修仙结缘 @对方（群聊） 或 修仙结缘 对方wxid'};
    }
    if (input.startsWith('@')) {
        return {error: '⚠️ 未解析到被 @ 的道友，请在群里使用 @ 选择成员后重试。'};
    }
    return {targetUserId: input};
}

async function findIncomingPendingBond(repo: XiuxianRepository, playerId: number) {
    const bond = await repo.findLatestBondByPlayer(playerId);
    if (!bond || bond.status !== 'pending') return null;
    if (bond.targetId !== playerId) return null;
    return bond;
}

async function applyPetBagFeed(
    repo: XiuxianRepository,
    player: XiuxianPlayer,
    pet: {id: number; petName: string; level: number; exp: number; affection: number},
    itemId: number,
    count: number,
    now: number,
): Promise<HandlerResponse> {
    const bagItem = await repo.findPetBagItem(player.id, itemId);
    if (!bagItem || bagItem.quantity <= 0) return asText('🔎 未找到该宠物道具，请先发送「修仙宠包」查看。');

    const feedCount = Math.max(1, Math.floor(count));
    const consumeCount = Math.min(feedCount, bagItem.quantity);

    const consumed = await repo.consumePetBagItem(player.id, bagItem.id, consumeCount, now);
    if (!consumed) return asText('⚠️ 该宠物道具已被使用，请刷新宠包后重试。');

    const gainedExp = Math.max(0, bagItem.feedLevel) * XIUXIAN_PET_GROWTH.feedExpUnit * consumeCount;
    const growth = applyPetExpProgress(pet, gainedExp);
    const affectionAfter = Math.min(100, pet.affection + Math.max(0, bagItem.feedAffection) * consumeCount);
    await repo.updatePetBagFeed(
        pet.id,
        {
            level: growth.level,
            exp: growth.exp,
            affection: affectionAfter,
            feedCountInc: consumeCount,
        },
        now,
    );
    const latest = await repo.findPet(player.id);
    if (!latest) return asText('⚠️ 喂宠后读取失败，请稍后再试。');

    const expNeed = petExpNeed(latest.level);

    return asText(
        [
            `🧪 使用道具喂宠：${bagItem.itemName} x${consumeCount}`,
            '━━━━━━━━━━━━',
            `🌟 宠物经验 +${gainedExp}`,
            `📶 ${XIUXIAN_TERMS.pet.currentLevelLabel}：${latest.level}`,
            `📈 升级进度：${latest.exp}/${expNeed}`,
            `💖 当前亲密：${latest.affection}/100`,
            `📦 道具剩余：${Math.max(0, bagItem.quantity - consumeCount)}`,
        ].join('\n'),
    );
}

function petExpNeed(level: number): number {
    return Math.floor(
        XIUXIAN_PET_GROWTH.expNeedBase
            + level * XIUXIAN_PET_GROWTH.expNeedLinear
            + level * level * XIUXIAN_PET_GROWTH.expNeedQuadratic,
    );
}

function applyPetExpProgress(pet: {level: number; exp: number}, gainedExp: number): {level: number; exp: number; gainedLevel: number} {
    let level = Math.max(1, Math.floor(pet.level));
    let exp = Math.max(0, Math.floor(pet.exp)) + Math.max(0, Math.floor(gainedExp));
    let gainedLevel = 0;
    while (exp >= petExpNeed(level)) {
        exp -= petExpNeed(level);
        level += 1;
        gainedLevel += 1;
    }
    return {level, exp, gainedLevel};
}

async function ensureTaskDefs(repo: XiuxianRepository, now: number): Promise<void> {
    await repo.upsertTaskDef({
        code: 'daily_checkin_1',
        title: '晨修签到',
        description: '完成一次修仙签到。',
        taskType: 'daily',
        targetValue: 1,
        requirementJson: JSON.stringify({type: 'checkin_count_daily'}),
        rewardJson: JSON.stringify({spiritStone: 20, exp: 10, cultivation: 10}),
        sortOrder: 10,
        now,
    });
    await repo.upsertTaskDef({
        code: 'daily_cultivate_3',
        title: '勤修不辍',
        description: '当日累计修炼 3 次。',
        taskType: 'daily',
        targetValue: 3,
        requirementJson: JSON.stringify({type: 'cooldown_day_count', action: XIUXIAN_ACTIONS.cultivate}),
        rewardJson: JSON.stringify({spiritStone: 35, exp: 30, cultivation: 25}),
        sortOrder: 20,
        now,
    });
    await repo.upsertTaskDef({
        code: 'daily_explore_2',
        title: '洞天寻宝',
        description: '当日累计探索 2 次。',
        taskType: 'daily',
        targetValue: 2,
        requirementJson: JSON.stringify({type: 'cooldown_day_count', action: XIUXIAN_ACTIONS.explore}),
        rewardJson: JSON.stringify({spiritStone: 30, exp: 20, cultivation: 15}),
        sortOrder: 30,
        now,
    });
}

async function ensureAchievementDefs(repo: XiuxianRepository, now: number): Promise<void> {
    await repo.upsertAchievementDef({
        code: 'ach_checkin_3',
        title: '初入仙门',
        description: '累计签到 3 天。',
        targetValue: 3,
        requirementJson: JSON.stringify({type: 'checkin_total'}),
        rewardJson: JSON.stringify({spiritStone: 120, exp: 80, cultivation: 60}),
        sortOrder: 10,
        now,
    });
    await repo.upsertAchievementDef({
        code: 'ach_battle_win_5',
        title: '锋芒初现',
        description: '累计挑战胜利 5 次。',
        targetValue: 5,
        requirementJson: JSON.stringify({type: 'battle_win_total'}),
        rewardJson: JSON.stringify({spiritStone: 150, exp: 100, cultivation: 80}),
        sortOrder: 20,
        now,
    });
}

async function resolveTaskProgress(repo: XiuxianRepository, player: XiuxianPlayer, task: XiuxianTaskDef, todayKey: string): Promise<number> {
    const rule = parseJsonRecord(task.requirementJson);
    const type = String(rule.type ?? '');
    if (type === 'checkin_count_daily') {
        const checkin = await repo.findCheckin(player.id, todayKey);
        return checkin ? 1 : 0;
    }
    if (type === 'cooldown_day_count') {
        const action = String(rule.action ?? '');
        const cooldown = await repo.getCooldown(player.id, action);
        if (!cooldown || cooldown.dayKey !== todayKey) return 0;
        return cooldown.dayCount;
    }
    return 0;
}

async function syncDailyTasks(repo: XiuxianRepository, player: XiuxianPlayer, now: number): Promise<void> {
    await ensureTaskDefs(repo, now);
    const todayKey = dayKeyOf(now);
    const defs = await repo.listTaskDefs();
    for (const def of defs) {
        const progress = await resolveTaskProgress(repo, player, def, todayKey);
        const capped = Math.min(progress, def.targetValue);
        const status = capped >= def.targetValue ? 'claimable' : 'in_progress';
        await repo.upsertPlayerTaskProgress(player.id, def.id, todayKey, capped, def.targetValue, status, now);
    }
}

async function computeAchievementProgress(repo: XiuxianRepository, player: XiuxianPlayer, def: XiuxianAchievementDef): Promise<number> {
    const rule = parseJsonRecord(def.requirementJson);
    const type = String(rule.type ?? '');
    if (type === 'checkin_total') {
        return repo.countCheckins(player.id);
    }
    if (type === 'battle_win_total') {
        return repo.countBattleWins(player.id);
    }
    return 0;
}

async function syncAchievements(repo: XiuxianRepository, player: XiuxianPlayer, now: number): Promise<void> {
    await ensureAchievementDefs(repo, now);
    const defs = await repo.listAchievementDefs();
    for (const def of defs) {
        const progress = await computeAchievementProgress(repo, player, def);
        const capped = Math.min(progress, def.targetValue);
        const status = capped >= def.targetValue ? 'claimable' : 'in_progress';
        await repo.upsertPlayerAchievementProgress(player.id, def.id, capped, def.targetValue, status, status === 'claimable' ? now : null, now);
    }
}

export async function handleXiuxianCommand(
    db: D1Database,
    kv: KVNamespace | undefined,
    message: IncomingMessage,
    cmd: XiuxianCommand,
): Promise<HandlerResponse> {
    const repo = new XiuxianRepository(db);
    const now = Date.now();
    const identity = identityFromMessage(message);
    await tryLoadSetConfigFromKv(kv, now);

    try {
        if (cmd.type === 'help') return asText(helpText(cmd.topic));

        if (cmd.type === 'create') {
            const existed = await repo.findPlayer(identity);
            if (existed) return asText(`🧾 你已经创建过角色：${existed.userName}`);
            const name = cmd.name?.trim() || message.senderName?.trim() || XIUXIAN_DEFAULTS.name;
            const player = await repo.createPlayer(identity, name, now);
            return asText(createdText(player));
        }

        const player = await mustPlayer(repo, identity);
        if (!player) return asText('🌱 你还没有角色，先发送：修仙创建 [名字]');

        if (cmd.type === 'bond') {
            const resolved = resolveBondTarget(message, cmd.targetUserId);
            if (resolved.error) return asText(resolved.error);
            const targetUserId = resolved.targetUserId;
            if (!targetUserId) return asText('💡 用法：修仙结缘 @对方（群聊） 或 修仙结缘 对方wxid');
            if (targetUserId === player.userId) return asText('😅 不能和自己结缘哦。');

            const target = await repo.findPlayerByPlatformUserId('wechat', targetUserId);
            if (!target) return asText('🔎 未找到该道友，请确认对方已创建角色且wxid正确。');

            const existed = await repo.findBondBetween(player.id, target.id);
            if (!existed) {
                const selfBond = await repo.findLatestBondByPlayer(player.id);
                if (selfBond) {
                    const selfPartnerId = selfBond.requesterId === player.id ? selfBond.targetId : selfBond.requesterId;
                    const selfPartner = await repo.findPlayerById(selfPartnerId);
                    return asText(
                        `💗 你当前已存在${selfBond.status === 'active' ? '已激活' : '待确认'}情缘：${selfPartner?.userName ?? `道友#${selfPartnerId}`}，暂不可发起新的结缘。`,
                    );
                }

                const targetBond = await repo.findLatestBondByPlayer(target.id);
                if (targetBond) {
                    const targetPartnerId = targetBond.requesterId === target.id ? targetBond.targetId : targetBond.requesterId;
                    const targetPartner = await repo.findPlayerById(targetPartnerId);
                    return asText(
                        `💌 对方当前已存在${targetBond.status === 'active' ? '已激活' : '待确认'}情缘：${targetPartner?.userName ?? `道友#${targetPartnerId}`}，暂不可结缘。`,
                    );
                }

                await repo.createBondRequest(player.id, target.id, now);
                return asText(bondRequestText(targetUserId));
            }

            if (existed.status === 'ended') {
                await repo.reopenBondRequest(existed.id, player.id, target.id, now);
                return asText(bondRequestText(targetUserId));
            }

            if (existed.status === 'active') {
                return asText(`💞 你与 ${target.userName} 已是情缘关系。`);
            }

            if (existed.requesterId === target.id && existed.targetId === player.id) {
                await repo.activateBond(existed.id, now);
                await repo.addBondLog(existed.id, player.id, '结缘成功', 0, '{}', now);
                return asText(bondActivatedText(target.userName));
            }

            return asText(`💌 你已向 ${target.userName} 发起结缘请求，等待对方确认。`);
        }

        if (cmd.type === 'bondAccept') {
            const pending = await findIncomingPendingBond(repo, player.id);
            if (!pending) return asText('📭 当前没有待你确认的结缘请求。');
            const requester = await repo.findPlayerById(pending.requesterId);
            await repo.activateBond(pending.id, now);
            await repo.addBondLog(pending.id, player.id, '结缘成功', 0, '{}', now);
            return asText(bondActivatedText(requester?.userName ?? `道友#${pending.requesterId}`));
        }

        if (cmd.type === 'bondReject') {
            const pending = await findIncomingPendingBond(repo, player.id);
            if (!pending) return asText('📭 当前没有待你处理的结缘请求。');
            const requester = await repo.findPlayerById(pending.requesterId);
            await repo.endBond(pending.id, now);
            await repo.addBondLog(pending.id, player.id, '拒绝结缘', 0, '{}', now);
            return asText(`🛑 已拒绝来自 ${requester?.userName ?? `道友#${pending.requesterId}`} 的结缘请求。`);
        }

        if (cmd.type === 'bondBreak') {
            const bond = await repo.findLatestBondByPlayer(player.id);
            if (!bond) return asText('💗 你当前暂无可解除的情缘关系。');
            const partnerId = bond.requesterId === player.id ? bond.targetId : bond.requesterId;
            const partner = await repo.findPlayerById(partnerId);
            await repo.endBond(bond.id, now);
            await repo.addBondLog(bond.id, player.id, '解缘', 0, '{}', now);
            return asText(bondBreakText(partner?.userName ?? `道友#${partnerId}`));
        }

        if (cmd.type === 'bondStatus') {
            const bond = await repo.findLatestBondByPlayer(player.id);
            if (!bond) {
                return asText('💗 你当前暂无情缘，发送「修仙结缘 @对方」发起关系。');
            }
            const partnerId = bond.requesterId === player.id ? bond.targetId : bond.requesterId;
            const partner = await repo.findPlayerById(partnerId);
            const canTravel = bond.status === 'active' && bond.lastTravelDay !== dayKeyOf(now);
            return asText(
                bondStatusText({
                    partnerName: partner?.userName ?? `道友#${partnerId}`,
                    status: bond.status,
                    intimacy: bond.intimacy,
                    level: bond.level,
                    canTravel,
                }),
            );
        }

        if (cmd.type === 'bondTravel') {
            const bond = await repo.findLatestBondByPlayer(player.id);
            if (!bond || bond.status !== 'active') return asText('💗 你当前暂无已确认情缘，先完成「修仙结缘」。');

            const dayKey = dayKeyOf(now);
            if (bond.lastTravelDay === dayKey) {
                return asText('🌸 今日已同游，明日再来吧。');
            }

            const reward = {spiritStone: 22, exp: 16, cultivation: 14};
            const progress = applyExpProgress(player, reward.exp);
            player.level = progress.level;
            player.exp = progress.exp;
            player.maxHp = progress.maxHp;
            player.attack = progress.attack;
            player.defense = progress.defense;
            player.hp = progress.maxHp;
            player.spiritStone += reward.spiritStone;
            player.cultivation += reward.cultivation;
            await repo.updatePlayer(player, now);

            await repo.createEconomyLog({
                playerId: player.id,
                bizType: 'reward',
                deltaSpiritStone: reward.spiritStone,
                balanceAfter: player.spiritStone,
                refType: 'bond_travel',
                refId: bond.id,
                idempotencyKey: `${player.id}:bond-travel:${dayKey}`,
                extraJson: JSON.stringify({exp: reward.exp, cultivation: reward.cultivation}),
                now,
            });
            const newIntimacy = bond.intimacy + 20;
            const newLevel = Math.max(1, Math.floor(newIntimacy / 100) + 1);
            await repo.updateBondTravel(bond.id, newIntimacy, newLevel, dayKey, now);
            await repo.addBondLog(bond.id, player.id, '同游', 20, JSON.stringify(reward), now);

            let milestoneStone = 0;
            let milestoneExp = 0;
            let milestoneCultivation = 0;
            const milestoneReached: number[] = [];
            for (const tier of XIUXIAN_BOND_MILESTONE_REWARDS) {
                if (bond.intimacy >= tier.intimacy || newIntimacy < tier.intimacy) continue;
                const claimed = await repo.findBondMilestoneClaim(bond.id, tier.intimacy);
                if (claimed) continue;

                milestoneStone += tier.spiritStone;
                milestoneExp += tier.exp;
                milestoneCultivation += tier.cultivation;
                milestoneReached.push(tier.intimacy);
                await repo.addBondMilestoneClaim(
                    bond.id,
                    player.id,
                    tier.intimacy,
                    JSON.stringify({
                        intimacy: tier.intimacy,
                        spiritStone: tier.spiritStone,
                        exp: tier.exp,
                        cultivation: tier.cultivation,
                    }),
                    now,
                );
            }

            const milestoneLines: string[] = [];
            if (milestoneStone > 0 || milestoneExp > 0 || milestoneCultivation > 0) {
                const bonus = applyExpProgress(player, milestoneExp);
                player.level = bonus.level;
                player.exp = bonus.exp;
                player.maxHp = bonus.maxHp;
                player.attack = bonus.attack;
                player.defense = bonus.defense;
                player.hp = bonus.maxHp;
                player.spiritStone += milestoneStone;
                player.cultivation += milestoneCultivation;
                await repo.updatePlayer(player, now);
                await repo.createEconomyLog({
                    playerId: player.id,
                    bizType: 'reward',
                    deltaSpiritStone: milestoneStone,
                    balanceAfter: player.spiritStone,
                    refType: 'bond_milestone',
                    refId: bond.id,
                    idempotencyKey: `${player.id}:bond-milestone:${bond.id}:${milestoneReached.join('-')}`,
                    extraJson: JSON.stringify({milestones: milestoneReached, exp: milestoneExp, cultivation: milestoneCultivation}),
                    now,
                });
                milestoneLines.push(
                    ...milestoneReached.map((m) => {
                        const tier = XIUXIAN_BOND_MILESTONE_REWARDS.find((v) => v.intimacy === m)!;
                        return `🎉 达成情缘里程碑 ${m}：💎+${tier.spiritStone} 📈+${tier.exp} ✨+${tier.cultivation}`;
                    }),
                );
            }

            const partnerId = bond.requesterId === player.id ? bond.targetId : bond.requesterId;
            const partner = await repo.findPlayerById(partnerId);
            const travel = bondTravelText({
                partnerName: partner?.userName ?? `道友#${partnerId}`,
                gainedIntimacy: 20,
                level: newLevel,
                reward,
            });
            if (!milestoneLines.length) return asText(travel);
            return asText([travel, '━━━━━━━━━━━━', ...milestoneLines].join('\n'));
        }

        if (cmd.type === 'bondLog') {
            const page = Math.max(1, cmd.page ?? 1);
            const logs = await repo.listBondLogs(player.id, page, XIUXIAN_PAGE_SIZE);
            return asText(bondLogText(logs, page, XIUXIAN_PAGE_SIZE));
        }

        if (cmd.type === 'status') {
            const equippedRaw = await repo.getEquippedItems(player);
            const equipped = await enhanceItemsWithRefine(repo, player.id, equippedRaw);
            const setBonus = calcSetBonusSummary(equipped);
            const pet = await repo.findPet(player.id);
            const petBonus = petCombatBonus(pet);
            const power = mergeCombatPower(calcCombatPower(player, equipped), petBonus);
            const inventoryCount = await repo.countInventory(player.id);
            const panel = statusText(player, power, equipped, inventoryCount, setBonus.lines);
            if (!pet) return asText(panel);
            return asText(`${panel}\n━━━━━━━━━━━━\n🐶 灵宠：${pet.petName}（${XIUXIAN_TERMS.pet.levelLabel}${pet.level}，亲密 ${pet.affection}/100）\n⚔️ 灵宠战斗加成：攻+${petBonus.attack} 防+${petBonus.defense} 血+${petBonus.maxHp}`);
        }

        if (cmd.type === 'cultivate') {
            const left = await checkCooldown(repo, player.id, XIUXIAN_ACTIONS.cultivate, now);
            if (left > 0) return asText(cooldownText('修炼', left));

            const times = Math.min(Math.max(cmd.times ?? 1, 1), 20);
            const reward = cultivateReward(player.level, times);
            const pet = await repo.findPet(player.id);
            const petBonus = petCultivateStoneBonus(pet, times);
            const progress = applyExpProgress(player, reward.gainedExp);

            player.level = progress.level;
            player.exp = progress.exp;
            player.maxHp = progress.maxHp;
            player.attack = progress.attack;
            player.defense = progress.defense;
            player.hp = progress.maxHp;
            player.cultivation += reward.gainedCultivation;
            player.spiritStone += reward.gainedStone + petBonus;

            await repo.updatePlayer(player, now);
            await repo.setCooldown(player.id, XIUXIAN_ACTIONS.cultivate, now + XIUXIAN_COOLDOWN_MS.cultivate, now);

            return asText(
                [
                    `🧘 修炼完成 x${times}`,
                    '━━━━━━━━━━━━',
                    `✨ 修为 +${reward.gainedCultivation}`,
                    `📈 经验 +${reward.gainedExp}`,
                    `💎 灵石 +${reward.gainedStone}${petBonus > 0 ? `（灵宠加成 +${petBonus}）` : ''}`,
                    `🪪 ${XIUXIAN_TERMS.realm.currentLabel}：${formatRealm(player.level)}`,
                ].join('\n'),
            );
        }

        if (cmd.type === 'petPool') {
            const {banner, entries} = await ensureWeeklyPetBanner(repo, now);
            const lines = entries
                .slice()
                .sort((a, b) => b.weight - a.weight)
                .map((it) => `${it.isUp === 1 ? '🌟UP ' : ''}${rarityLabel(it.rarity)} ${it.petName}（${it.petType}） 权重:${it.weight}`);
            return asText(
                [
                    `🎴 当前卡池：${banner.title}`,
                    '━━━━━━━━━━━━',
                    `🕰️ 开放：${formatBeijingTime(banner.startAt)} ~ ${formatBeijingTime(banner.endAt)}`,
                    `⌛ 剩余：${formatCountdown(banner.endAt - now)}`,
                    `💎 单抽消耗：${banner.drawCost}`,
                    `🧿 保底：${banner.hardPityUr} 抽必出 UR，${banner.hardPityUp} 抽必出 UP`,
                    '━━━━━━━━━━━━',
                    ...lines,
                    '💡 抽宠：修仙抽宠 [1|10|十连]',
                ].join('\n'),
            );
        }

        if (cmd.type === 'petDraw') {
            const drawTimes = Math.min(Math.max(cmd.times ?? 1, 1), 10);
            const {banner, entries} = await ensureWeeklyPetBanner(repo, now);
            if (!entries.length) return asText('⚠️ 卡池配置为空，请稍后再试。');
            if (now < banner.startAt || now >= banner.endAt) return asText('⌛ 当前限定卡池未开放，请稍后再来。');

            const idemKey = `${player.id}:pet-draw:${message.messageId}`;
            const exists = await repo.findEconomyLogByIdempotency(player.id, idemKey);
            if (exists) return asText('🧾 该抽宠请求已处理，请勿重复提交。');

            const totalCost = drawTimes * banner.drawCost;
            if (player.spiritStone < totalCost) {
                return asText(`💸 灵石不足，${drawTimes} 抽需要 ${totalCost} 灵石。`);
            }

            const paid = await repo.spendSpiritStone(player.id, totalCost, now);
            if (!paid) return asText(`💸 灵石不足，${drawTimes} 抽需要 ${totalCost} 灵石。`);

            const pityState = await repo.findPetPityState(player.id, banner.bannerKey);
            const pity = {
                totalDraws: pityState?.totalDraws ?? 0,
                sinceUr: pityState?.sinceUr ?? 0,
                sinceUp: pityState?.sinceUp ?? 0,
            };

            const lines: string[] = [];
            const duplicateFeeds: Array<{itemName: string; quantity: number}> = [];
            for (let i = 0; i < drawTimes; i += 1) {
                const result = rollPetDrawEntry(entries, pity, banner.hardPityUr, banner.hardPityUp);
                const rarity = result.entry.rarity;
                const existedPet = await repo.findPetByName(player.id, result.entry.petName);

                let isDuplicate = 0;
                let compensationStone = 0;
                if (existedPet) {
                    isDuplicate = 1;
                    const feedReward = XIUXIAN_PET_GACHA.duplicateFeedCompensation[rarity];
                    compensationStone = feedReward.quantity;
                    await repo.addPetBagItem(player.id, feedReward, now);
                    duplicateFeeds.push({itemName: feedReward.itemName, quantity: feedReward.quantity});
                } else {
                    await repo.createPet(player.id, result.entry.petName, result.entry.petType, now);
                }

                await repo.addPetDrawLog({
                    playerId: player.id,
                    bannerKey: banner.bannerKey,
                    drawIndex: i + 1,
                    petName: result.entry.petName,
                    petType: result.entry.petType,
                    rarity,
                    isUp: result.isUp ? 1 : 0,
                    costSpiritStone: banner.drawCost,
                    isDuplicate,
                    compensationStone,
                    idempotencyKey: idemKey,
                    now,
                });

                lines.push(
                    `${i + 1}. ${result.isUp ? '🌟' : ''}${rarityLabel(rarity)} ${result.entry.petName}（${result.entry.petType}）${isDuplicate ? ` → 重复转化🧪x${compensationStone}` : ''}`,
                );
            }

            await repo.upsertPetPityState(player.id, banner.bannerKey, pity, now);

            const latest = await repo.findPlayerById(player.id);
            const balanceAfter = latest?.spiritStone ?? Math.max(0, player.spiritStone - totalCost);
            await repo.createEconomyLog({
                playerId: player.id,
                bizType: 'cost',
                deltaSpiritStone: -totalCost,
                balanceAfter,
                refType: 'pet_draw',
                refId: null,
                idempotencyKey: idemKey,
                extraJson: JSON.stringify({bannerKey: banner.bannerKey, draws: drawTimes, duplicateFeeds}),
                now,
            });

            const feedSummaryMap = new Map<string, number>();
            for (const feed of duplicateFeeds) {
                feedSummaryMap.set(feed.itemName, (feedSummaryMap.get(feed.itemName) ?? 0) + feed.quantity);
            }
            const feedSummaryLines = [...feedSummaryMap.entries()].map(([itemName, qty]) => `🧪 重复补偿：${itemName} x${qty}`);

            return asText(
                [
                    `🎲 抽宠完成 x${drawTimes}`,
                    '━━━━━━━━━━━━',
                    ...lines,
                    ...(feedSummaryLines.length ? ['━━━━━━━━━━━━', ...feedSummaryLines] : []),
                    '━━━━━━━━━━━━',
                    `🧿 当前保底进度：UR ${pity.sinceUr}/${banner.hardPityUr}，UP ${pity.sinceUp}/${banner.hardPityUp}`,
                    `💎 当前灵石：${balanceAfter}`,
                ].join('\n'),
            );
        }

        if (cmd.type === 'petPity') {
            const {banner} = await ensureWeeklyPetBanner(repo, now);
            const pity = await repo.findPetPityState(player.id, banner.bannerKey);
            const sinceUr = pity?.sinceUr ?? 0;
            const sinceUp = pity?.sinceUp ?? 0;
            return asText(
                [
                    `🧿 保底进度（${banner.title}）`,
                    '━━━━━━━━━━━━',
                    `UR 保底：${sinceUr}/${banner.hardPityUr}`,
                    `UP 保底：${sinceUp}/${banner.hardPityUp}`,
                    `💡 距离 UR 还差：${Math.max(0, banner.hardPityUr - sinceUr)} 抽`,
                    `💡 距离 UP 还差：${Math.max(0, banner.hardPityUp - sinceUp)} 抽`,
                ].join('\n'),
            );
        }

        if (cmd.type === 'petAdopt') {
            const existedPet = await repo.findPet(player.id);
            if (existedPet) {
                return asText('🐾 每位道友仅可「领宠」一次，后续请通过活动或任务获取新的灵宠。');
            }
            const pool = [
                {name: '灵狐', type: '灵兽'},
                {name: '玄龟', type: '守护'},
                {name: '青鸾', type: '飞羽'},
                {name: '月兔', type: '瑞兽'},
            ];
            const roll = pool[Math.floor(Math.random() * pool.length)];
            const pet = await repo.createPet(player.id, roll.name, roll.type, now);
            await repo.addPetBagItem(player.id, XIUXIAN_PET_STARTER_ITEM, now);
            return asText(petAdoptText(pet));
        }

        if (cmd.type === 'petStatus') {
            const pet = cmd.petId ? await repo.findPetById(player.id, cmd.petId) : await repo.findPet(player.id);
            if (!pet) return asText('🐾 你还没有灵宠，可通过活动或任务获取。');
            const bonus = petCombatBonus(pet);
            const allPets = await repo.listPets(player.id);
            const exclusive = await limitedPetProfileOf(repo, pet.petName);
            const summary = allPets
                .slice(0, 5)
                .map((p) => `#${p.id} ${p.petName}${p.inBattle === 1 ? '（出战）' : ''}`)
                .join('，');
            const panel = petStatusText(
                pet,
                {expNeed: petExpNeed(pet.level)},
                {attack: bonus.attack, defense: bonus.defense, hp: bonus.maxHp},
                exclusive ?? undefined,
            );
            return asText(`${panel}\n━━━━━━━━━━━━\n📚 灵宠列表：${summary || '暂无'}\n💡 查看指定宠物：修仙宠物 [编号]`);
        }

        if (cmd.type === 'petBag') {
            const page = Math.max(1, cmd.page ?? 1);
            const total = await repo.countPetBag(player.id);
            const items = await repo.listPetBag(player.id, page, XIUXIAN_PAGE_SIZE);
            return asText(petBagText(items, page, total, XIUXIAN_PAGE_SIZE));
        }

        if (cmd.type === 'petDeploy') {
            const pet = cmd.petId ? await repo.findPetById(player.id, cmd.petId) : await repo.findPet(player.id);
            if (!pet) return asText('🐾 你还没有灵宠，可通过活动或任务获取。');
            if (pet.inBattle === 1) return asText(`⚔️ ${pet.petName} 当前已经是出战状态。`);
            await repo.deployPetById(player.id, pet.id, now);
            return asText(petBattleStateText(pet.petName, true));
        }

        if (cmd.type === 'petRest') {
            const pet = await repo.findPet(player.id);
            if (!pet) return asText('🐾 你还没有灵宠，可通过活动或任务获取。');
            if (pet.inBattle === 0) return asText(`🛌 ${pet.petName} 当前已经是休战状态。`);
            await repo.updatePetBattleState(pet.id, 0, now);
            return asText(petBattleStateText(pet.petName, false));
        }

        if (cmd.type === 'petFeed') {
            const pet = await repo.findPet(player.id);
            if (!pet) return asText('🐾 你还没有灵宠，可通过活动或任务获取。');
            if (cmd.itemId) return applyPetBagFeed(repo, player, pet, cmd.itemId, cmd.count ?? 1, now);
            const dayKey = dayKeyOf(now);
            if (pet.lastFedDay === dayKey) return asText('🍼 今日已喂宠，明日再来吧。');

            const cost = 20 + Math.floor(pet.level / 3) * 5;
            if (player.spiritStone < cost) return asText(`💸 灵石不足，喂宠需要 ${cost} 灵石。`);

            player.spiritStone -= cost;
            await repo.updatePlayer(player, now);
            await repo.createEconomyLog({
                playerId: player.id,
                bizType: 'cost',
                deltaSpiritStone: -cost,
                balanceAfter: player.spiritStone,
                refType: 'pet_feed',
                refId: pet.id,
                idempotencyKey: `${player.id}:pet-feed:${dayKey}`,
                extraJson: JSON.stringify({petId: pet.id, petName: pet.petName, dayKey, cost}),
                now,
            });
            const gainedPetExp = XIUXIAN_PET_GROWTH.dailyFeedExp;
            const growth = applyPetExpProgress(pet, gainedPetExp);
            const affectionAfter = Math.min(100, pet.affection + 6);
            await repo.updatePetFeed(
                pet.id,
                {
                    level: growth.level,
                    exp: growth.exp,
                    affection: affectionAfter,
                    feedCountInc: 1,
                },
                dayKey,
                now,
            );
            const latest = await repo.findPet(player.id);
            if (!latest) return asText('⚠️ 喂宠后读取失败，请稍后再试。');

            let milestoneStone = 0;
            let milestoneExp = 0;
            let milestoneCultivation = 0;
            const milestoneLines: string[] = [];
            for (const tier of XIUXIAN_PET_MILESTONE_REWARDS) {
                if (pet.level >= tier.level || latest.level < tier.level) continue;
                const claimed = await repo.findPetMilestoneClaim(player.id, tier.level);
                if (claimed) continue;

                milestoneStone += tier.spiritStone;
                milestoneExp += tier.exp;
                milestoneCultivation += tier.cultivation;
                milestoneLines.push(`🎉 达成里程碑 Lv${tier.level}：💎+${tier.spiritStone} 📈+${tier.exp} ✨+${tier.cultivation}`);

                const rewardJson = JSON.stringify({
                    petId: latest.id,
                    petName: latest.petName,
                    milestoneLevel: tier.level,
                    spiritStone: tier.spiritStone,
                    exp: tier.exp,
                    cultivation: tier.cultivation,
                });
                await repo.addPetMilestoneClaim(player.id, latest.id, tier.level, rewardJson, now);
            }

            if (milestoneStone > 0 || milestoneExp > 0 || milestoneCultivation > 0) {
                const step = applyExpProgress(player, milestoneExp);
                player.level = step.level;
                player.exp = step.exp;
                player.maxHp = step.maxHp;
                player.attack = step.attack;
                player.defense = step.defense;
                player.hp = step.maxHp;
                player.spiritStone += milestoneStone;
                player.cultivation += milestoneCultivation;
                await repo.updatePlayer(player, now);
                await repo.createEconomyLog({
                    playerId: player.id,
                    bizType: 'reward',
                    deltaSpiritStone: milestoneStone,
                    balanceAfter: player.spiritStone,
                    refType: 'pet_milestone',
                    refId: latest.id,
                    idempotencyKey: `${player.id}:pet-milestone:${dayKey}:${latest.level}`,
                    extraJson: JSON.stringify({petId: latest.id, petName: latest.petName, exp: milestoneExp, cultivation: milestoneCultivation}),
                    now,
                });
            }

            return asText(petFeedText(latest, cost, player.spiritStone, gainedPetExp, petExpNeed(latest.level), milestoneLines));
        }

        if (cmd.type === 'npcEncounter') {
            const dayKey = dayKeyOf(now);
            const existed = await repo.findNpcEncounterByDay(player.id, dayKey);
            if (existed) return asText(`🎲 今日奇遇已触发：${existed.eventTitle}，明日再来。`);

            const event = pickNpcEncounter();
            const progress = applyExpProgress(player, event.exp);
            player.level = progress.level;
            player.exp = progress.exp;
            player.maxHp = progress.maxHp;
            player.attack = progress.attack;
            player.defense = progress.defense;
            player.hp = progress.maxHp;
            player.spiritStone += event.spiritStone;
            player.cultivation += event.cultivation;
            await repo.updatePlayer(player, now);

            const rewardJson = JSON.stringify({
                spiritStone: event.spiritStone,
                exp: event.exp,
                cultivation: event.cultivation,
                code: event.code,
                title: event.title,
                tier: event.tier,
            });
            await repo.addNpcEncounter(player.id, dayKey, event.code, event.title, event.tier, rewardJson, now);
            await repo.createEconomyLog({
                playerId: player.id,
                bizType: 'reward',
                deltaSpiritStone: event.spiritStone,
                balanceAfter: player.spiritStone,
                refType: 'npc_encounter',
                refId: null,
                idempotencyKey: `${player.id}:npc-encounter:${dayKey}`,
                extraJson: rewardJson,
                now,
            });

            return asText(
                npcEncounterText({
                    title: event.title,
                    tier: event.tier,
                    reward: {
                        spiritStone: event.spiritStone,
                        exp: event.exp,
                        cultivation: event.cultivation,
                    },
                }),
            );
        }

        if (cmd.type === 'npcEncounterLog') {
            const page = Math.max(1, cmd.page ?? 1);
            const logs = await repo.listNpcEncounters(player.id, page, XIUXIAN_PAGE_SIZE);
            return asText(npcEncounterLogText(logs, page, XIUXIAN_PAGE_SIZE));
        }

        if (cmd.type === 'explore') {
            const dropHint = exploreDropHintText();
            const left = await checkCooldown(repo, player.id, XIUXIAN_ACTIONS.explore, now);
            if (left > 0) return asText(cooldownText('探索', left));

            const total = await repo.countInventory(player.id);
            if (total >= player.backpackCap) {
                const stone = exploreStoneReward(player.level);
                player.spiritStone += stone;
                await repo.updatePlayer(player, now);
                await repo.setCooldown(player.id, XIUXIAN_ACTIONS.explore, now + XIUXIAN_COOLDOWN_MS.explore, now);
                return asText(`🎒 背包已满，本次探索改为获得灵石 ${stone}。\n${dropHint}`);
            }

            const loot = rollExploreLoot(player.level);
            await repo.setCooldown(player.id, XIUXIAN_ACTIONS.explore, now + XIUXIAN_COOLDOWN_MS.explore, now);

            if (!loot) {
                const stone = exploreStoneReward(player.level);
                player.spiritStone += stone;
                await repo.updatePlayer(player, now);
                return asText(`🧭 本次探索没有发现装备，获得灵石 ${stone}。\n${dropHint}`);
            }

            await repo.addItem(player.id, loot, now);
            return asText(
                [
                    `🎁 探索成功：获得 ${loot.itemName}（${qualityLabel(loot.quality)}）`,
                    '━━━━━━━━━━━━',
                    `🧩 类型：${loot.itemType}`,
                    `🗡️ 攻击 +${loot.attack}  🛡️ 防御 +${loot.defense}  ❤️ 气血 +${loot.hp}`,
                    `🏷️ 品质：${qualityLabel(loot.quality)}`,
                    dropHint,
                ].join('\n'),
            );
        }

        if (cmd.type === 'bag') {
            const page = Math.max(1, cmd.page ?? 1);
            const filter = resolveBagFilter(cmd.filter);
            if (filter.error) return asText(filter.error);
            const total = await repo.countInventory(player.id, filter.query);
            const itemsRaw = await repo.listInventory(player.id, page, XIUXIAN_PAGE_SIZE, filter.query);
            const items = await enhanceItemsWithRefine(repo, player.id, itemsRaw);
            return asText(bagText(items, page, total, XIUXIAN_PAGE_SIZE, filter.label));
        }

        if (cmd.type === 'equip') {
            const item = await repo.findItem(player.id, cmd.itemId);
            if (!item) return asText('🔎 未找到该装备编号，请先用「修仙背包」查看。');

            if (item.itemType === 'weapon') player.weaponItemId = item.id;
            if (item.itemType === 'armor') player.armorItemId = item.id;
            if (item.itemType === 'accessory') player.accessoryItemId = item.id;
            if (item.itemType === 'sutra') player.sutraItemId = item.id;
            await repo.updatePlayer(player, now);
            return asText(equipText(item));
        }

        if (cmd.type === 'unequip') {
            if (cmd.slot === 'weapon') player.weaponItemId = null;
            if (cmd.slot === 'armor') player.armorItemId = null;
            if (cmd.slot === 'accessory') player.accessoryItemId = null;
            if (cmd.slot === 'sutra') player.sutraItemId = null;
            await repo.updatePlayer(player, now);
            return asText(unequipText(cmd.slot));
        }

        if (cmd.type === 'lock' || cmd.type === 'unlock') {
            const targetIds = cmd.itemIds?.length ? cmd.itemIds : cmd.itemId ? [cmd.itemId] : [];
            if (!targetIds.length) {
                return asText(cmd.type === 'lock' ? '💡 用法：修仙上锁 [装备ID...]' : '💡 用法：修仙解锁 [装备ID...]');
            }

            const lockValue = cmd.type === 'lock' ? 1 : 0;
            let success = 0;
            let skippedMissing = 0;
            let skippedAlready = 0;

            for (const itemId of targetIds) {
                const item = await repo.findItem(player.id, itemId);
                if (!item) {
                    skippedMissing += 1;
                    continue;
                }
                if ((item.isLocked > 0 ? 1 : 0) === lockValue) {
                    skippedAlready += 1;
                    continue;
                }
                const changed = await repo.setItemLock(player.id, item.id, lockValue);
                if (changed) {
                    success += 1;
                } else {
                    skippedAlready += 1;
                }
            }

            if (success <= 0) {
                if (skippedMissing > 0 && skippedAlready <= 0) {
                    return asText('🔎 未找到可操作的装备编号，请先用「修仙背包」查看。');
                }
                return asText(cmd.type === 'lock' ? '🔒 目标装备均已锁定。' : '🔓 目标装备均已解锁。');
            }

            const actionText = cmd.type === 'lock' ? '上锁' : '解锁';
            const skipped = skippedMissing + skippedAlready;
            return asText(
                [
                    `✅ 批量${actionText}完成（成功 ${success} 件）`,
                    ...(skipped > 0 ? [`⏭️ 跳过：${skipped} 件（状态未变化 ${skippedAlready}，不存在 ${skippedMissing}）`] : []),
                ].join('\n'),
            );
        }

        if (cmd.type === 'challenge') {
            const left = await checkCooldown(repo, player.id, XIUXIAN_ACTIONS.challenge, now);
            if (left > 0) return asText(cooldownText('挑战', left));

            const equippedRaw = await repo.getEquippedItems(player);
            const equipped = await enhanceItemsWithRefine(repo, player.id, equippedRaw);
            const pet = await repo.findPet(player.id);
            const power = mergeCombatPower(calcCombatPower(player, equipped), petCombatBonus(pet));
            const enemy = challengeEnemy(player.level);
            const result = runSimpleBattle(power, enemy);

            let rewardExp = 0;
            let rewardStone = 0;
            if (result.win) {
                rewardExp = 20 + player.level * 6;
                rewardStone = 10 + player.level * 3;
                const progress = applyExpProgress(player, rewardExp);
                player.level = progress.level;
                player.exp = progress.exp;
                player.maxHp = progress.maxHp;
                player.attack = progress.attack;
                player.defense = progress.defense;
                player.hp = progress.maxHp;
                player.spiritStone += rewardStone;
                await repo.updatePlayer(player, now);
            }

            await repo.addBattleLog(
                player.id,
                enemy.name,
                enemy.level,
                result.win ? 'win' : 'lose',
                result.rounds,
                JSON.stringify({exp: rewardExp, spiritStone: rewardStone}),
                result.logs.join('\n'),
                now,
            );
            await repo.setCooldown(player.id, XIUXIAN_ACTIONS.challenge, now + XIUXIAN_COOLDOWN_MS.challenge, now);

            return asText(
                [
                    `${result.win ? '🏆 挑战胜利' : '💥 挑战失败'}：${enemy.name}`,
                    '━━━━━━━━━━━━',
                    `🕒 回合数：${result.rounds}`,
                    ...(result.win ? [`📈 奖励经验：${rewardExp}`, `💎 奖励灵石：${rewardStone}`] : []),
                    ...result.logs.slice(0, 4),
                ].join('\n'),
            );
        }

        if (cmd.type === 'shop') {
            const offers = await ensureShopOffers(repo, player, now);
            return asText(shopText(offers));
        }

        if (cmd.type === 'buy') {
            const idemKey = `${player.id}:buy:${message.messageId}`;
            const exists = await repo.findEconomyLogByIdempotency(player.id, idemKey);
            if (exists) {
                return asText('🧾 该购买请求已处理，请勿重复提交。');
            }

            const offer = await repo.findShopOffer(player.id, cmd.offerId);
            if (!offer || offer.status !== 'active' || offer.stock <= 0 || offer.expiresAt <= now) {
                return asText('🛒 该商品已失效，请先发送「修仙商店」查看最新货架。');
            }

            const itemPayload = parseOfferItem(offer);
            if (!itemPayload) return asText('⚠️ 商品数据异常，请稍后重试。');

            const inventoryCount = await repo.countInventory(player.id);
            if (inventoryCount >= player.backpackCap) {
                return asText('🎒 背包已满，无法购买。先整理背包后再来吧。');
            }

            const sold = await repo.markOfferSold(player.id, offer.id, now);
            if (!sold) return asText('🛒 商品已被刷新或售罄，请重新查看「修仙商店」。');

            const paid = await repo.spendSpiritStone(player.id, offer.priceSpiritStone, now);
            if (!paid) {
                await repo.restoreOfferStock(player.id, offer.id, now);
                return asText(`💸 灵石不足，本商品需要 ${offer.priceSpiritStone} 灵石。`);
            }

            await repo.addItem(player.id, itemPayload, now);
            const latest = await repo.findPlayerById(player.id);
            const balanceAfter = latest?.spiritStone ?? Math.max(0, player.spiritStone - offer.priceSpiritStone);
            await repo.createEconomyLog({
                playerId: player.id,
                bizType: 'buy',
                deltaSpiritStone: -offer.priceSpiritStone,
                balanceAfter,
                refType: 'shop_offer',
                refId: offer.id,
                idempotencyKey: idemKey,
                extraJson: JSON.stringify({itemName: itemPayload.itemName, score: itemPayload.score}),
                now,
            });
            return asText(buyResultText(offer, itemPayload.itemName, balanceAfter));
        }

        if (cmd.type === 'sell') {
            const idemKey = `${player.id}:sell:${message.messageId}`;
            const exists = await repo.findEconomyLogByIdempotency(player.id, idemKey);
            if (exists) {
                return asText('🧾 该出售请求已处理，请勿重复提交。');
            }

            let targetIds: number[] = [];
            if (cmd.sellAll) {
                const total = await repo.countInventory(player.id);
                if (total <= 0) return asText('🎒 背包暂无可出售装备。');
                const all = await repo.listInventory(player.id, 1, total);
                targetIds = all.map((v) => v.id);
            } else if (cmd.sellQuality) {
                const total = await repo.countInventory(player.id);
                if (total <= 0) return asText('🎒 背包暂无可出售装备。');
                const all = await repo.listInventory(player.id, 1, total);
                const baseRank = QUALITY_RANK[cmd.sellQuality];
                const matched = all.filter((item) => {
                    if (cmd.sellQualityMode === 'at_least') return QUALITY_RANK[item.quality] >= baseRank;
                    if (cmd.sellQualityMode === 'at_most') return QUALITY_RANK[item.quality] <= baseRank;
                    return item.quality === cmd.sellQuality;
                });
                if (!matched.length) {
                    const modeLabel = cmd.sellQualityMode === 'at_least' ? '至少' : cmd.sellQualityMode === 'at_most' ? '至多' : '';
                    return asText(
                        `🔎 未找到品质为${modeLabel}${qualityLabel(cmd.sellQuality)}的可出售装备。`,
                    );
                }
                targetIds = matched.map((v) => v.id);
            } else {
                targetIds = cmd.itemIds?.length ? cmd.itemIds : cmd.itemId ? [cmd.itemId] : [];
                if (!targetIds.length) {
                    return asText('💡 用法：修仙出售 [装备ID...] 或 修仙出售 全部 或 修仙出售 品质 稀有以上/稀有以下');
                }
            }

            const equippedIds = new Set([player.weaponItemId, player.armorItemId, player.accessoryItemId, player.sutraItemId].filter((v): v is number => typeof v === 'number'));
            let soldCount = 0;
            let skippedEquipped = 0;
            let skippedLocked = 0;
            let skippedMissing = 0;
            let gainTotal = 0;
            const soldItems: Array<{id: number; itemName: string; score: number}> = [];

            for (const itemId of targetIds) {
                const item = await repo.findItem(player.id, itemId);
                if (!item) {
                    skippedMissing += 1;
                    continue;
                }
                if (equippedIds.has(item.id)) {
                    skippedEquipped += 1;
                    continue;
                }
                if (item.isLocked > 0) {
                    skippedLocked += 1;
                    continue;
                }

                const removed = await repo.removeItem(player.id, item.id);
                if (!removed) {
                    skippedMissing += 1;
                    continue;
                }

                const gain = calcSellPrice(item);
                gainTotal += gain;
                soldCount += 1;
                soldItems.push({id: item.id, itemName: item.itemName, score: item.score});
            }

            if (soldCount <= 0) {
                if (skippedEquipped > 0) return asText('🧷 目标装备均为已装备状态，请先「修仙卸装」。');
                if (skippedLocked > 0) return asText('🔒 目标装备均为锁定状态，解锁后再出售。');
                return asText('🔎 未找到可出售的装备编号，请先用「修仙背包」查看。');
            }

            await repo.gainSpiritStone(player.id, gainTotal, now);
            const latest = await repo.findPlayerById(player.id);
            const balanceAfter = latest?.spiritStone ?? player.spiritStone + gainTotal;
            const primary = soldItems[0];
            await repo.createEconomyLog({
                playerId: player.id,
                bizType: 'sell',
                deltaSpiritStone: gainTotal,
                balanceAfter,
                refType: soldCount > 1 ? 'inventory_item_batch' : 'inventory_item',
                refId: soldCount > 1 ? null : primary.id,
                idempotencyKey: idemKey,
                extraJson: JSON.stringify(
                    soldCount > 1
                        ? {
                              soldCount,
                              soldItemIds: soldItems.map((v) => v.id),
                              soldItemNames: soldItems.map((v) => v.itemName),
                          }
                        : {itemName: primary.itemName, score: primary.score},
                ),
                now,
            });

            if (soldCount === 1 && !cmd.sellAll && targetIds.length === 1) {
                return asText(sellResultText(primary.itemName, gainTotal, balanceAfter));
            }
            return asText(
                sellBatchResultText({
                    soldCount,
                    gain: gainTotal,
                    balanceAfter,
                    skippedEquipped,
                    skippedLocked,
                    skippedMissing,
                }),
            );
        }

        if (cmd.type === 'dismantle') {
            const idemKey = `${player.id}:dismantle:${message.messageId}`;
            const exists = await repo.findEconomyLogByIdempotency(player.id, idemKey);
            if (exists) return asText('🧾 该分解请求已处理，请勿重复提交。');

            let targetIds: number[] = [];
            if (cmd.dismantleAll) {
                const total = await repo.countInventory(player.id);
                if (total <= 0) return asText('🎒 背包暂无可分解装备。');
                const all = await repo.listInventory(player.id, 1, total);
                targetIds = all.map((v) => v.id);
            } else if (cmd.dismantleQuality) {
                const total = await repo.countInventory(player.id);
                if (total <= 0) return asText('🎒 背包暂无可分解装备。');
                const all = await repo.listInventory(player.id, 1, total);
                const baseRank = QUALITY_RANK[cmd.dismantleQuality];
                const matched = all.filter((item) => {
                    if (cmd.dismantleQualityMode === 'at_least') return QUALITY_RANK[item.quality] >= baseRank;
                    if (cmd.dismantleQualityMode === 'at_most') return QUALITY_RANK[item.quality] <= baseRank;
                    return item.quality === cmd.dismantleQuality;
                });
                if (!matched.length) {
                    const modeLabel =
                        cmd.dismantleQualityMode === 'at_least' ? '至少' : cmd.dismantleQualityMode === 'at_most' ? '至多' : '';
                    return asText(`🔎 未找到品质为${modeLabel}${qualityLabel(cmd.dismantleQuality)}的可分解装备。`);
                }
                targetIds = matched.map((v) => v.id);
            } else {
                targetIds = cmd.itemIds?.length ? cmd.itemIds : cmd.itemId ? [cmd.itemId] : [];
                if (!targetIds.length) {
                    return asText('💡 用法：修仙分解 [装备ID...] 或 修仙分解 全部 或 修仙分解 品质 稀有以下');
                }
            }

            const equippedIds = new Set(
                [player.weaponItemId, player.armorItemId, player.accessoryItemId, player.sutraItemId].filter(
                    (v): v is number => typeof v === 'number',
                ),
            );
            let dismantledCount = 0;
            let skippedEquipped = 0;
            let skippedLocked = 0;
            let skippedMissing = 0;
            let gainedEssence = 0;
            const dismantledIds: number[] = [];

            for (const itemId of targetIds) {
                const item = await repo.findItem(player.id, itemId);
                if (!item) {
                    skippedMissing += 1;
                    continue;
                }
                if (equippedIds.has(item.id)) {
                    skippedEquipped += 1;
                    continue;
                }
                if (item.isLocked > 0) {
                    skippedLocked += 1;
                    continue;
                }

                const refineLevel = (await repo.findItemRefineLevel(player.id, item.id)) ?? 0;
                const removed = await repo.removeItem(player.id, item.id);
                if (!removed) {
                    skippedMissing += 1;
                    continue;
                }
                await repo.clearItemRefine(item.id);
                dismantledCount += 1;
                dismantledIds.push(item.id);
                gainedEssence += refineMaterialGain(item, refineLevel);
            }

            if (dismantledCount <= 0) {
                if (skippedEquipped > 0) return asText('🧷 目标装备均为已装备状态，请先「修仙卸装」。');
                if (skippedLocked > 0) return asText('🔒 目标装备均为锁定状态，解锁后再分解。');
                return asText('🔎 未找到可分解的装备编号，请先用「修仙背包」查看。');
            }

            await repo.addRefineMaterial(player.id, XIUXIAN_REFINE_MATERIAL_KEY, gainedEssence, now);
            const essenceAfter = await repo.getRefineMaterial(player.id, XIUXIAN_REFINE_MATERIAL_KEY);
            await repo.createEconomyLog({
                playerId: player.id,
                bizType: 'other',
                deltaSpiritStone: 0,
                balanceAfter: player.spiritStone,
                refType: 'dismantle',
                refId: dismantledCount === 1 ? dismantledIds[0] : null,
                idempotencyKey: idemKey,
                extraJson: JSON.stringify({
                    materialKey: XIUXIAN_REFINE_MATERIAL_KEY,
                    materialName: XIUXIAN_REFINE_MATERIAL_LABEL,
                    gainedEssence,
                    dismantledCount,
                    dismantledIds,
                }),
                now,
            });
            return asText(
                dismantleResultText({
                    dismantledCount,
                    gainedEssence,
                    essenceAfter,
                    skippedEquipped,
                    skippedLocked,
                    skippedMissing,
                }),
            );
        }

        if (cmd.type === 'refine') {
            const essence = await repo.getRefineMaterial(player.id, XIUXIAN_REFINE_MATERIAL_KEY);
            if (!cmd.itemId) return asText(refineMaterialText(essence));

            const idemKey = `${player.id}:refine:${message.messageId}`;
            const exists = await repo.findEconomyLogByIdempotency(player.id, idemKey);
            if (exists) return asText('🧾 该炼器请求已处理，请勿重复提交。');

            const item = await repo.findItem(player.id, cmd.itemId);
            if (!item) return asText('🔎 未找到该装备编号，请先用「修仙背包」查看。');
            if (item.isLocked > 0) return asText('🔒 该装备处于锁定状态，解锁后再炼器。');

            const targetTimes = cmd.infinite ? XIUXIAN_REFINE_SAFETY_CAP : Math.min(Math.max(cmd.times ?? 1, 1), 100);
            const currentLevel = (await repo.findItemRefineLevel(player.id, item.id)) ?? 0;

            let doable = 0;
            let needEssence = 0;
            let needStone = 0;
            let essenceLeft = essence;
            let stoneLeft = player.spiritStone;
            let hitSafetyCap = false;
            for (let i = 0; i < targetTimes; i += 1) {
                const level = currentLevel + i;
                const cost = refineCostForLevel(level);
                if (essenceLeft < cost.essence || stoneLeft < cost.stone) break;
                essenceLeft -= cost.essence;
                stoneLeft -= cost.stone;
                needEssence += cost.essence;
                needStone += cost.stone;
                doable += 1;
            }
            if (cmd.infinite && doable >= XIUXIAN_REFINE_SAFETY_CAP) hitSafetyCap = true;

            if (doable <= 0) {
                const nextCost = refineCostForLevel(currentLevel);
                return asText(
                    `🧱 炼器材料不足：下一级需要 ${nextCost.essence} ${XIUXIAN_REFINE_MATERIAL_LABEL} + ${nextCost.stone} 灵石（当前 ${essence} / ${player.spiritStone}）。`,
                );
            }

            const consumed = await repo.consumeRefineMaterial(player.id, XIUXIAN_REFINE_MATERIAL_KEY, needEssence, now);
            if (!consumed) return asText('⚠️ 炼器材料扣除失败，请稍后重试。');
            const paid = await repo.spendSpiritStone(player.id, needStone, now);
            if (!paid) {
                await repo.addRefineMaterial(player.id, XIUXIAN_REFINE_MATERIAL_KEY, needEssence, now);
                return asText('💸 灵石不足，炼器已取消。');
            }

            const newLevel = currentLevel + doable;
            const updated = await repo.upsertItemRefineLevel(player.id, item.id, newLevel, now);
            if (!updated) {
                await repo.addRefineMaterial(player.id, XIUXIAN_REFINE_MATERIAL_KEY, needEssence, now);
                await repo.gainSpiritStone(player.id, needStone, now);
                return asText('⚠️ 装备状态已变更，炼器已回滚。');
            }

            const latest = await repo.findPlayerById(player.id);
            const balanceAfter = latest?.spiritStone ?? Math.max(0, player.spiritStone - needStone);
            const essenceAfter = await repo.getRefineMaterial(player.id, XIUXIAN_REFINE_MATERIAL_KEY);
            await repo.createEconomyLog({
                playerId: player.id,
                bizType: 'cost',
                deltaSpiritStone: -needStone,
                balanceAfter,
                refType: 'refine',
                refId: item.id,
                idempotencyKey: idemKey,
                extraJson: JSON.stringify({
                    itemName: item.itemName,
                    levelBefore: currentLevel,
                    levelAfter: newLevel,
                    times: doable,
                    essenceCost: needEssence,
                    materialKey: XIUXIAN_REFINE_MATERIAL_KEY,
                }),
                now,
            });

            const body = refineResultText({
                itemName: item.itemName,
                itemId: item.id,
                levelBefore: currentLevel,
                levelAfter: newLevel,
                successTimes: doable,
                essenceCost: needEssence,
                essenceAfter,
                stoneCost: needStone,
                balanceAfter,
            });
            if (cmd.infinite) {
                const tail = hitSafetyCap ? `⛔ 本次已达到单次安全上限 ${XIUXIAN_REFINE_SAFETY_CAP} 次。` : '⏹️ 材料或灵石不足，已自动停止。';
                return asText(`${body}\n━━━━━━━━━━━━\n${tail}`);
            }
            return asText(body);
        }

        if (cmd.type === 'refineDetail') {
            if (!cmd.itemId) return asText('💡 用法：修仙炼器详情 [装备ID]');
            const item = await repo.findItem(player.id, cmd.itemId);
            if (!item) return asText('🔎 未找到该装备编号，请先用「修仙背包」查看。');
            const refineLevel = (await repo.findItemRefineLevel(player.id, item.id)) ?? 0;
            const bonus = refineBonusByLevel(item, refineLevel);
            const nextCost = refineCostForLevel(refineLevel);
            const essence = await repo.getRefineMaterial(player.id, XIUXIAN_REFINE_MATERIAL_KEY);
            return asText(
                refineDetailText({
                    itemName: item.itemName,
                    itemId: item.id,
                    refineLevel,
                    bonus,
                    nextCost,
                    essence,
                    spiritStone: player.spiritStone,
                }),
            );
        }

        if (cmd.type === 'ledger') {
            const limit = Math.min(Math.max(cmd.limit ?? XIUXIAN_LEDGER_DEFAULT_LIMIT, 1), XIUXIAN_LEDGER_MAX_LIMIT);
            const logs = await repo.listEconomyLogs(player.id, limit);
            return asText(economyLogText(logs, limit));
        }

        if (cmd.type === 'checkin') {
            const todayKey = dayKeyOf(now);
            const inserted = await repo.addCheckin(player.id, todayKey, XIUXIAN_CHECKIN_REWARD, now);
            if (!inserted) return asText('📅 今日已签到，明日再来领取修炼补给吧。');

            const progress = applyExpProgress(player, XIUXIAN_CHECKIN_REWARD.exp);
            player.level = progress.level;
            player.exp = progress.exp;
            player.maxHp = progress.maxHp;
            player.attack = progress.attack;
            player.defense = progress.defense;
            player.hp = progress.maxHp;
            player.spiritStone += XIUXIAN_CHECKIN_REWARD.spiritStone;
            player.cultivation += XIUXIAN_CHECKIN_REWARD.cultivation;
            await repo.updatePlayer(player, now);
            await repo.createEconomyLog({
                playerId: player.id,
                bizType: 'reward',
                deltaSpiritStone: XIUXIAN_CHECKIN_REWARD.spiritStone,
                balanceAfter: player.spiritStone,
                refType: 'checkin',
                refId: null,
                idempotencyKey: `${player.id}:checkin:${todayKey}`,
                extraJson: JSON.stringify({exp: XIUXIAN_CHECKIN_REWARD.exp, cultivation: XIUXIAN_CHECKIN_REWARD.cultivation}),
                now,
            });
            return asText(checkinText(XIUXIAN_CHECKIN_REWARD, player.level, player.spiritStone));
        }

        if (cmd.type === 'task') {
            const todayKey = dayKeyOf(now);
            await syncDailyTasks(repo, player, now);
            const defs = (await repo.listTaskDefs()).slice(0, XIUXIAN_TASK_DEFAULT_LIMIT);
            const states = await repo.listPlayerTasks(player.id, todayKey);
            if (cmd.onlyClaimable) {
                const stateMap = new Map<number, (typeof states)[number]>();
                for (const row of states) stateMap.set(row.taskId, row);
                const filtered = defs.filter((def) => stateMap.get(def.id)?.status === 'claimable');
                if (!filtered.length) return asText('📭 当前没有可领取任务奖励。');
                return asText(taskText(filtered, states, todayKey, true));
            }
            return asText(taskText(defs, states, todayKey));
        }

        if (cmd.type === 'claim') {
            const todayKey = dayKeyOf(now);
            await syncDailyTasks(repo, player, now);
            const defs = await repo.listTaskDefs();
            const states = await repo.listPlayerTasks(player.id, todayKey);
            const stateMap = new Map<number, (typeof states)[number]>();
            for (const row of states) stateMap.set(row.taskId, row);

            let targets = defs.filter((d) => stateMap.get(d.id)?.status === 'claimable');
            if (cmd.taskId) {
                const one = defs.find((v) => v.id === cmd.taskId);
                if (!one) return asText('🔎 未找到该任务，请先发送「修仙任务」。');
                const st = stateMap.get(one.id);
                if (!st) return asText('🔎 未找到该任务，请先发送「修仙任务」。');
                if (st.status === 'claimed') return asText('🧾 该任务奖励已领取。');
                if (st.status !== 'claimable') return asText('⏳ 该任务尚未完成，先继续努力吧。');
                targets = [one];
            } else if (!cmd.claimAll) {
                targets = targets.slice(0, 1);
            }

            if (!targets.length) return asText('📭 当前没有可领取任务奖励，可发送「修仙任务」查看进度。');

            const claimedTitles: string[] = [];
            const claimedIds: number[] = [];
            let gainStone = 0;
            let gainExp = 0;
            let gainCultivation = 0;

            for (const def of targets) {
                const locked = await repo.markTaskClaimed(player.id, def.id, todayKey, now);
                if (!locked) continue;
                const reward = parseJsonRecord(def.rewardJson);
                gainStone += Number(reward.spiritStone ?? 0);
                gainExp += Number(reward.exp ?? 0);
                gainCultivation += Number(reward.cultivation ?? 0);
                claimedIds.push(def.id);
                claimedTitles.push(def.title);
            }

            if (!claimedIds.length) return asText('⚠️ 奖励状态已变化，请刷新任务列表后重试。');

            const progress = applyExpProgress(player, gainExp);
            player.level = progress.level;
            player.exp = progress.exp;
            player.maxHp = progress.maxHp;
            player.attack = progress.attack;
            player.defense = progress.defense;
            player.hp = progress.maxHp;
            player.spiritStone += gainStone;
            player.cultivation += gainCultivation;
            await repo.updatePlayer(player, now);

            if (gainStone > 0) {
                const single = claimedIds.length === 1;
                await repo.createEconomyLog({
                    playerId: player.id,
                    bizType: 'reward',
                    deltaSpiritStone: gainStone,
                    balanceAfter: player.spiritStone,
                    refType: single ? 'task' : 'task_batch',
                    refId: single ? claimedIds[0] : null,
                    idempotencyKey: single
                        ? `${player.id}:task-claim:${todayKey}:${claimedIds[0]}`
                        : `${player.id}:task-claim:${todayKey}:batch:${claimedIds.join(',')}`,
                    extraJson: JSON.stringify({taskIds: claimedIds, exp: gainExp, cultivation: gainCultivation}),
                    now,
                });
            }

            if (claimedIds.length === 1) {
                return asText(claimTaskText(claimedTitles[0], {spiritStone: gainStone, exp: gainExp, cultivation: gainCultivation}, player.spiritStone));
            }
            return asText(claimTaskBatchText(claimedTitles, {spiritStone: gainStone, exp: gainExp, cultivation: gainCultivation}, player.spiritStone));
        }

        if (cmd.type === 'achievement') {
            await syncAchievements(repo, player, now);
            const defs = await repo.listAchievementDefs();
            const states = await repo.listPlayerAchievements(player.id);

            const stateMap = new Map<number, (typeof states)[number]>();
            for (const row of states) stateMap.set(row.achievementId, row);

            let autoGainStone = 0;
            let autoGainExp = 0;
            let autoGainCultivation = 0;
            const claimedTitles: string[] = [];
            for (const def of defs) {
                const st = stateMap.get(def.id);
                if (!st || st.status !== 'claimable') continue;
                const marked = await repo.markAchievementClaimed(player.id, def.id, now);
                if (!marked) continue;
                const reward = parseJsonRecord(def.rewardJson);
                autoGainStone += Number(reward.spiritStone ?? 0);
                autoGainExp += Number(reward.exp ?? 0);
                autoGainCultivation += Number(reward.cultivation ?? 0);
                claimedTitles.push(def.title);
            }
            if (autoGainStone > 0 || autoGainExp > 0 || autoGainCultivation > 0) {
                const progress = applyExpProgress(player, autoGainExp);
                player.level = progress.level;
                player.exp = progress.exp;
                player.maxHp = progress.maxHp;
                player.attack = progress.attack;
                player.defense = progress.defense;
                player.hp = progress.maxHp;
                player.spiritStone += autoGainStone;
                player.cultivation += autoGainCultivation;
                await repo.updatePlayer(player, now);
                if (autoGainStone > 0) {
                    await repo.createEconomyLog({
                        playerId: player.id,
                        bizType: 'reward',
                        deltaSpiritStone: autoGainStone,
                        balanceAfter: player.spiritStone,
                        refType: 'achievement',
                        refId: null,
                        idempotencyKey: `${player.id}:achievement:${dayKeyOf(now)}:${claimedTitles.join('|')}`,
                        extraJson: JSON.stringify({titles: claimedTitles, exp: autoGainExp, cultivation: autoGainCultivation}),
                        now,
                    });
                }
                await syncAchievements(repo, player, now);
            }

            const refreshed = await repo.listPlayerAchievements(player.id);
            return asText(achievementText(defs, refreshed, claimedTitles));
        }

        if (cmd.type === 'bossRaid') {
            const left = await checkCooldown(repo, player.id, XIUXIAN_ACTIONS.bossRaid, now);
            if (left > 0) return asText(cooldownText('讨伐', left));

            const equippedRaw = await repo.getEquippedItems(player);
            const equipped = await enhanceItemsWithRefine(repo, player.id, equippedRaw);
            const pet = await repo.findPet(player.id);
            const power = mergeCombatPower(calcCombatPower(player, equipped), petCombatBonus(pet));
            const scopeKey = bossScopeKeyOfMessage(message);

            let state = await ensureWorldBossState(repo, scopeKey, player.level, now);
            if (state.status === 'defeated') {
                const baseTime = state.defeatedAt ?? state.updatedAt;
                const leftMs = Math.max(0, XIUXIAN_WORLD_BOSS.respawnMs - (now - baseTime));
                const sec = Math.ceil(leftMs / 1000);
                return asText(`⌛ 世界BOSS正在重生中，请约 ${sec}s 后再来讨伐。`);
            }
            const raidBoss = {
                name: state.bossName,
                level: state.bossLevel,
                attack: 16 + state.bossLevel * 4,
                defense: 10 + state.bossLevel * 3,
                maxHp: state.maxHp,
                dodge: Math.min(0.28, 0.05 + state.bossLevel * 0.002),
                crit: Math.min(0.32, 0.08 + state.bossLevel * 0.002),
            };
            const sim = runBossBattle(power, raidBoss);
            const theoryDamage = Math.max(1, state.maxHp - sim.enemyHpLeft);

            let updated: XiuxianWorldBossState | null = null;
            let hpBefore = state.currentHp;
            let actualDamage = 0;
            for (let i = 0; i < XIUXIAN_WORLD_BOSS.maxRetry; i += 1) {
                state = await ensureWorldBossState(repo, scopeKey, player.level, now);
                hpBefore = state.currentHp;
                actualDamage = Math.min(theoryDamage, hpBefore);
                if (actualDamage <= 0) break;
                const ok = await repo.attackWorldBoss(scopeKey, state.version, actualDamage, message.from, now);
                if (!ok) continue;
                updated = await repo.findWorldBossState(scopeKey);
                break;
            }

            if (!updated) {
                return asText('⚠️ 讨伐并发过高，请稍后再试。');
            }

            const killed = updated.status === 'defeated' && hpBefore > 0 && updated.currentHp === 0;
            await repo.addWorldBossContribution(scopeKey, updated.cycleNo, player.id, actualDamage, killed, now);

            const base = bossRewards(player.level, killed);
            const ratio = Math.max(0.1, Math.min(1, actualDamage / Math.max(1, updated.maxHp)));
            const reward = {
                gainedStone: Math.max(1, Math.floor(base.gainedStone * ratio + (killed ? 40 : 0))),
                gainedExp: Math.max(1, Math.floor(base.gainedExp * ratio + (killed ? 50 : 0))),
                gainedCultivation: Math.max(1, Math.floor(base.gainedCultivation * ratio + (killed ? 60 : 0))),
            };

            let dropName: string | undefined;
            if (killed) {
                const currentInv = await repo.countInventory(player.id);
                if (currentInv < player.backpackCap && Math.random() < 0.85) {
                    const drop = rollExploreLoot(player.level + 3);
                    if (drop) {
                        await repo.addItem(player.id, drop, now);
                        dropName = drop.itemName;
                    }
                }
            }

            const progress = applyExpProgress(player, reward.gainedExp);
            player.level = progress.level;
            player.exp = progress.exp;
            player.maxHp = progress.maxHp;
            player.attack = progress.attack;
            player.defense = progress.defense;
            player.hp = progress.maxHp;
            player.spiritStone += reward.gainedStone;
            player.cultivation += reward.gainedCultivation;
            await repo.updatePlayer(player, now);

            await repo.createEconomyLog({
                playerId: player.id,
                bizType: 'reward',
                deltaSpiritStone: reward.gainedStone,
                balanceAfter: player.spiritStone,
                refType: 'boss',
                refId: null,
                idempotencyKey: `${player.id}:boss:${updated.cycleNo}:${message.messageId}`,
                extraJson: JSON.stringify({
                    exp: reward.gainedExp,
                    cultivation: reward.gainedCultivation,
                    damage: actualDamage,
                    killed,
                    scopeKey,
                }),
                now,
            });

            const rewardJson = JSON.stringify({
                stone: reward.gainedStone,
                exp: reward.gainedExp,
                cultivation: reward.gainedCultivation,
                dropName: dropName ?? null,
                damage: actualDamage,
                hpAfter: updated.currentHp,
                cycleNo: updated.cycleNo,
            });
            await repo.addBossLog(
                player.id,
                updated.bossName,
                updated.bossLevel,
                killed ? 'win' : 'lose',
                sim.rounds,
                rewardJson,
                sim.logs.join('\n'),
                now,
            );
            await repo.setCooldown(player.id, XIUXIAN_ACTIONS.bossRaid, now + XIUXIAN_COOLDOWN_MS.bossRaid, now);

            return asText(
                bossRaidText({
                    bossName: updated.bossName,
                    result: killed ? 'win' : 'lose',
                    rounds: sim.rounds,
                    damage: actualDamage,
                    hpBefore,
                    hpAfter: updated.currentHp,
                    reward: {
                        gainedStone: reward.gainedStone,
                        gainedExp: reward.gainedExp,
                        gainedCultivation: reward.gainedCultivation,
                    },
                    dropName,
                }),
            );
        }

        if (cmd.type === 'towerClimb') {
            const autoSeason = await tryAutoClaimPreviousSeasonReward(repo, player, now);
            const left = await checkCooldown(repo, player.id, XIUXIAN_ACTIONS.towerClimb, now);
            if (left > 0) return asText(cooldownText('爬塔', left));

            const progress = await repo.findTowerProgress(player.id);
            const requested = Math.min(Math.max(cmd.times ?? 1, 1), XIUXIAN_TOWER.quickClimbMax);
            let highestFloor = progress?.highestFloor ?? 0;
            const equippedRaw = await repo.getEquippedItems(player);
            const equipped = await enhanceItemsWithRefine(repo, player.id, equippedRaw);
            const pet = await repo.findPet(player.id);
            let attempted = 0;
            let cleared = 0;
            let failedFloor: number | undefined;
            let lastResult: 'win' | 'lose' = 'lose';
            let lastRewardJson = '{}';
            const totalReward = {spiritStone: 0, exp: 0, cultivation: 0};
            const floorLines: string[] = [];
            let firstRun: {
                floor: number;
                result: 'win' | 'lose';
                rounds: number;
                reward: {spiritStone: number; exp: number; cultivation: number};
                enemyName: string;
            } | null = null;

            for (let i = 0; i < requested; i += 1) {
                const targetFloor = highestFloor + 1;
                attempted += 1;
                const enemy = towerEnemy(player.level, targetFloor);
                const power = mergeCombatPower(calcCombatPower(player, equipped), petCombatBonus(pet));
                const result = runSimpleBattle(power, enemy);
                const reward = towerRewards(player.level, targetFloor, result.win);
                if (!firstRun) {
                    firstRun = {
                        floor: targetFloor,
                        result: result.win ? 'win' : 'lose',
                        rounds: result.rounds,
                        reward,
                        enemyName: enemy.name,
                    };
                }

                const step = applyExpProgress(player, reward.exp);
                player.level = step.level;
                player.exp = step.exp;
                player.maxHp = step.maxHp;
                player.attack = step.attack;
                player.defense = step.defense;
                player.hp = step.maxHp;
                player.spiritStone += reward.spiritStone;
                player.cultivation += reward.cultivation;

                totalReward.spiritStone += reward.spiritStone;
                totalReward.exp += reward.exp;
                totalReward.cultivation += reward.cultivation;

                lastResult = result.win ? 'win' : 'lose';
                lastRewardJson = JSON.stringify({
                    spiritStone: reward.spiritStone,
                    exp: reward.exp,
                    cultivation: reward.cultivation,
                    floor: targetFloor,
                });
                await repo.addTowerLog(player.id, targetFloor, result.win ? 'win' : 'lose', result.rounds, lastRewardJson, result.logs.join('\n'), now);
                floorLines.push(
                    `第${targetFloor}层 ${result.win ? '✅' : '💥'} | ${result.rounds}回合 | 💎+${reward.spiritStone} 📈+${reward.exp} ✨+${reward.cultivation}`,
                );

                if (result.win) {
                    highestFloor = targetFloor;
                    cleared += 1;
                    continue;
                }
                failedFloor = targetFloor;
                break;
            }

            await repo.updatePlayer(player, now);
            await repo.upsertTowerProgress(player.id, highestFloor, lastResult, lastRewardJson, now);
            await repo.upsertTowerSeasonProgress(player.id, towerSeasonKey(now), highestFloor, now);
            await repo.setCooldown(player.id, XIUXIAN_ACTIONS.towerClimb, now + XIUXIAN_COOLDOWN_MS.towerClimb, now);
            await repo.createEconomyLog({
                playerId: player.id,
                bizType: 'reward',
                deltaSpiritStone: totalReward.spiritStone,
                balanceAfter: player.spiritStone,
                refType: 'tower',
                refId: highestFloor,
                idempotencyKey: `${player.id}:tower:${message.messageId}`,
                extraJson: JSON.stringify({
                    requested,
                    attempted,
                    cleared,
                    failedFloor: failedFloor ?? null,
                    highestFloor,
                    exp: totalReward.exp,
                    cultivation: totalReward.cultivation,
                }),
                now,
            });

            const climbText = requested === 1 && firstRun
                ? towerClimbText({
                    floor: firstRun.floor,
                    result: firstRun.result,
                    rounds: firstRun.rounds,
                    reward: firstRun.reward,
                    highestFloor,
                    enemyName: firstRun.enemyName,
                })
                : towerFastClimbText({
                    requested,
                    attempted,
                    cleared,
                    highestFloor,
                    totalReward,
                    floorLines: floorLines.slice(0, 8),
                    failedFloor,
                });
            if (!autoSeason) return asText(climbText);
            return asText(
                [
                    towerSeasonAutoClaimNoticeText({
                        seasonKey: autoSeason.seasonKey,
                        rank: autoSeason.rank,
                        reward: autoSeason.reward,
                    }),
                    climbText,
                ].join('\n\n'),
            );
        }

        if (cmd.type === 'towerStatus') {
            const progress = await repo.findTowerProgress(player.id);
            return asText(towerStatusText(progress));
        }

        if (cmd.type === 'towerRank') {
            const scope = cmd.scope ?? 'all';
            const weekStart = weekStartOf(now);
            const self = scope === 'weekly'
                ? await repo.findTowerWeeklyRank(player.id, weekStart)
                : await repo.findTowerRank(player.id);
            if (cmd.selfOnly) return asText(towerSelfRankText(self));
            const limit = Math.min(Math.max(cmd.limit ?? XIUXIAN_TOWER.rankSize, 1), XIUXIAN_TOWER.rankMax);
            const rows = scope === 'weekly'
                ? await repo.listTowerWeeklyTop(limit, weekStart)
                : await repo.listTowerTop(limit);
            const ahead = self
                ? scope === 'weekly'
                    ? await repo.findTowerWeeklyAheadNeighbor(player.id, weekStart)
                    : await repo.findTowerAheadNeighbor(player.id)
                : null;
            return asText(towerRankText(rows, self, limit, ahead, scope === 'weekly' ? '周榜' : '总榜'));
        }

        if (cmd.type === 'towerSeasonKey') {
            return asText(towerSeasonKeyText(towerSeasonKey(now)));
        }

        if (cmd.type === 'towerSeasonStatus') {
            const autoSeason = await tryAutoClaimPreviousSeasonReward(repo, player, now);
            const window = towerSeasonWindow(now);
            const prevKey = previousTowerSeasonKey(now);
            const prevRank = await repo.findTowerSeasonRank(prevKey, player.id);
            const prevClaim = await repo.findTowerSeasonClaim(player.id, prevKey);
            const statusText = towerSeasonStatusText({
                seasonKey: window.seasonKey,
                settleAt: window.settleAt,
                countdown: formatCountdown(window.settleAt - now),
                prevSeasonKey: prevKey,
                prevRank: prevRank?.rank,
                prevClaimed: Boolean(prevClaim),
            });
            if (!autoSeason) return asText(statusText);
            return asText(
                [
                    towerSeasonAutoClaimNoticeText({
                        seasonKey: autoSeason.seasonKey,
                        rank: autoSeason.rank,
                        reward: autoSeason.reward,
                    }),
                    statusText,
                ].join('\n\n'),
            );
        }

        if (cmd.type === 'towerSeasonRank') {
            const autoSeason = await tryAutoClaimPreviousSeasonReward(repo, player, now);
            const seasonKeyRaw = cmd.seasonKey === '__prev__' ? previousTowerSeasonKey(now) : cmd.seasonKey ?? towerSeasonKey(now);
            if (!/^\d{4}-W\d{2}$/.test(seasonKeyRaw)) {
                return asText('❌ 赛季键格式错误，应为 YYYY-Www，例如：2026-W15');
            }
            const seasonKey = seasonKeyRaw;
            const self = await repo.findTowerSeasonRank(seasonKey, player.id);
            if (cmd.selfOnly) {
                const selfText = towerSeasonSelfRankText(self, seasonKey);
                if (!autoSeason) return asText(selfText);
                return asText(
                    [
                        towerSeasonAutoClaimNoticeText({
                            seasonKey: autoSeason.seasonKey,
                            rank: autoSeason.rank,
                            reward: autoSeason.reward,
                        }),
                        selfText,
                    ].join('\n\n'),
                );
            }
            const limit = Math.min(Math.max(cmd.limit ?? XIUXIAN_TOWER.rankSize, 1), XIUXIAN_TOWER.rankMax);
            const rows = await repo.listTowerSeasonTop(seasonKey, limit);
            const ahead = self ? await repo.findTowerSeasonAheadNeighbor(seasonKey, player.id) : null;
            const listText = towerSeasonRankText(rows, self, limit, ahead, seasonKey);
            if (!autoSeason) return asText(listText);
            return asText(
                [
                    towerSeasonAutoClaimNoticeText({
                        seasonKey: autoSeason.seasonKey,
                        rank: autoSeason.rank,
                        reward: autoSeason.reward,
                    }),
                    listText,
                ].join('\n\n'),
            );
        }

        if (cmd.type === 'towerSeasonReward') {
            return asText(towerSeasonRewardText(towerSeasonKey(now), [...XIUXIAN_TOWER_SEASON_REWARDS]));
        }

        if (cmd.type === 'towerSeasonClaim') {
            const lastSeason = previousTowerSeasonKey(now);
            const claimed = await repo.findTowerSeasonClaim(player.id, lastSeason);
            if (claimed) return asText(`🧾 赛季 ${lastSeason} 奖励已领取，请勿重复领取。`);

            const rankRow = await repo.findTowerSeasonRank(lastSeason, player.id);
            if (!rankRow?.rank) return asText(`📭 赛季 ${lastSeason} 你未上榜，暂无可领取奖励。`);

            const reward = seasonRewardByRank(rankRow.rank);
            if (!reward) return asText(`📭 赛季 ${lastSeason} 你的排名为第 ${rankRow.rank} 名，不在奖励区间。`);

            const progress = applyExpProgress(player, reward.exp);
            player.level = progress.level;
            player.exp = progress.exp;
            player.maxHp = progress.maxHp;
            player.attack = progress.attack;
            player.defense = progress.defense;
            player.hp = progress.maxHp;
            player.spiritStone += reward.spiritStone;
            player.cultivation += reward.cultivation;
            await repo.updatePlayer(player, now);

            const rewardJson = JSON.stringify({
                seasonKey: lastSeason,
                rank: rankRow.rank,
                spiritStone: reward.spiritStone,
                exp: reward.exp,
                cultivation: reward.cultivation,
            });
            await repo.addTowerSeasonClaim(player.id, lastSeason, rankRow.rank, rewardJson, now);
            await repo.createEconomyLog({
                playerId: player.id,
                bizType: 'reward',
                deltaSpiritStone: reward.spiritStone,
                balanceAfter: player.spiritStone,
                refType: 'tower_season',
                refId: rankRow.rank,
                idempotencyKey: `${player.id}:tower-season-claim:${lastSeason}`,
                extraJson: rewardJson,
                now,
            });

            return asText(
                towerSeasonClaimText({
                    seasonKey: lastSeason,
                    rank: rankRow.rank,
                    reward,
                    balanceAfter: player.spiritStone,
                }),
            );
        }

        if (cmd.type === 'towerLog') {
            const page = Math.max(1, cmd.page ?? 1);
            const logs = await repo.listTowerLogs(player.id, page, XIUXIAN_PAGE_SIZE);
            return asText(towerLogText(logs, page, XIUXIAN_PAGE_SIZE));
        }

        if (cmd.type === 'towerDetail') {
            const log = await repo.findTowerLog(player.id, cmd.logId);
            if (!log) return asText('🔎 未找到该塔战报，请先发送「修仙塔报」。');
            return asText(towerDetailText(log));
        }

        if (cmd.type === 'bossStatus') {
            const scopeKey = bossScopeKeyOfMessage(message);
            const state = await ensureWorldBossState(repo, scopeKey, player.level, now);
            const self = await repo.findWorldBossContribution(scopeKey, state.cycleNo, player.id);
            const baseTime = state.defeatedAt ?? state.updatedAt;
            const respawnLeftSec =
                state.status === 'defeated'
                    ? Math.max(0, Math.ceil((XIUXIAN_WORLD_BOSS.respawnMs - (now - baseTime)) / 1000))
                    : 0;
            return asText(worldBossStatusText(state, self, {respawnLeftSec, cycleNo: state.cycleNo}));
        }

        if (cmd.type === 'bossRank') {
            const scopeKey = bossScopeKeyOfMessage(message);
            const state = await ensureWorldBossState(repo, scopeKey, player.level, now);
            const self = await repo.findWorldBossRank(scopeKey, state.cycleNo, player.id);
            if (cmd.selfOnly) {
                return asText(worldBossSelfRankText(self, state.cycleNo));
            }
            const limit = Math.min(Math.max(cmd.limit ?? XIUXIAN_WORLD_BOSS.rankSize, 1), XIUXIAN_WORLD_BOSS.rankMax);
            const rows = await repo.listWorldBossTop(scopeKey, state.cycleNo, limit);
            const killerName = state.lastHitUserId ? (await repo.findPlayerNameByUserId(state.lastHitUserId)) ?? '神秘道友' : undefined;
            const baseTime = state.defeatedAt ?? state.updatedAt;
            const respawnLeftSec =
                state.status === 'defeated'
                    ? Math.max(0, Math.ceil((XIUXIAN_WORLD_BOSS.respawnMs - (now - baseTime)) / 1000))
                    : 0;
            return asText(
                worldBossRankText(rows, self, {
                    killerName,
                    defeatedAt: state.defeatedAt ?? undefined,
                    limit,
                    respawnLeftSec,
                }),
            );
        }

        if (cmd.type === 'bossLog') {
            const page = Math.max(1, cmd.page ?? 1);
            const logs = await repo.listBossLogs(player.id, page, XIUXIAN_PAGE_SIZE);
            return asText(bossLogText(logs, page, XIUXIAN_PAGE_SIZE));
        }

        if (cmd.type === 'bossDetail') {
            const log = await repo.findBossLog(player.id, cmd.logId);
            if (!log) return asText('🔎 未找到该BOSS战报，请先发送「修仙伐报」。');
            return asText(bossDetailText(log));
        }

        if (cmd.type === 'battleLog') {
            const page = Math.max(1, cmd.page ?? 1);
            const logs = await repo.listBattles(player.id, page, XIUXIAN_PAGE_SIZE);
            return asText(battleLogText(logs, page, XIUXIAN_PAGE_SIZE));
        }

        if (cmd.type === 'battleDetail') {
            const battle = await repo.findBattle(player.id, cmd.battleId);
            if (!battle) return asText('🔎 未找到该战报编号，请先用「修仙战报」查看。');
            return asText(battleDetailText(battle));
        }

        return asText(helpText());
    } catch (error) {
        logger.error('修仙插件处理失败', {
            error: error instanceof Error ? error.message : String(error),
            from: message.from,
            content: message.content,
        });
        return asText('⚠️ 修仙系统开小差了，请稍后再试。');
    }
}

