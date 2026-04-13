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
    XIUXIAN_BOND_MILESTONE_REWARDS,
    XIUXIAN_NPC_ENCOUNTER_POOL,
    XIUXIAN_TOWER,
    XIUXIAN_TOWER_SEASON_REWARDS,
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
} from './types.js';
import {XiuxianRepository} from './repository.js';
import {formatRealm, realmName} from './realm.js';
import {
    applyExpProgress,
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
    rollExploreLoot,
    runBossBattle,
    runSimpleBattle,
} from './balance.js';
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
    economyLogText,
    equipText,
    helpText,
    achievementText,
    npcEncounterLogText,
    npcEncounterText,
    petAdoptText,
    petBattleStateText,
    petFeedText,
    petStatusText,
    sellResultText,
    shopText,
    statusText,
    taskText,
    towerClimbText,
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
            itemLevel: Number(data.itemLevel),
            quality: String(data.quality) as XiuxianItemQuality,
            attack: Number(data.attack),
            defense: Number(data.defense),
            hp: Number(data.hp),
            dodge: Number(data.dodge),
            crit: Number(data.crit),
            score: Number(data.score),
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
    return {
        name: `镇塔守卫·${realmName(level)}（第${floor}层）`,
        attack: 10 + level * 2 + floor * 2,
        defense: 6 + level + floor,
        maxHp: 100 + level * 20 + floor * 35,
        dodge: Math.min(0.25, 0.03 + floor * 0.002),
        crit: Math.min(0.3, 0.04 + floor * 0.002),
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

function petCultivateStoneBonus(petLevel: number, affection: number, times: number): number {
    const per = Math.floor(petLevel / 5) + (affection >= 50 ? 1 : 0);
    if (per <= 0) return 0;
    return per * times;
}

function petCombatBonus(pet: {level: number; affection: number; inBattle?: number} | null): {
    attack: number;
    defense: number;
    maxHp: number;
    dodge: number;
    crit: number;
} {
    if (!pet || pet.inBattle === 0) return {attack: 0, defense: 0, maxHp: 0, dodge: 0, crit: 0};
    const attack = Math.floor(pet.level / 4) + (pet.affection >= 60 ? 2 : 0);
    const defense = Math.floor(pet.level / 5) + (pet.affection >= 80 ? 2 : 0);
    const maxHp = pet.level * 6 + pet.affection;
    const dodge = pet.affection >= 70 ? 0.01 : 0;
    const crit = pet.affection >= 90 ? 0.01 : 0;
    return {attack, defense, maxHp, dodge, crit};
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
    message: IncomingMessage,
    cmd: XiuxianCommand,
): Promise<HandlerResponse> {
    const repo = new XiuxianRepository(db);
    const now = Date.now();
    const identity = identityFromMessage(message);

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
            const targetUserId = cmd.targetUserId?.trim();
            if (!targetUserId) return asText('💡 用法：修仙结缘 对方wxid');
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
                return asText('💗 你当前暂无情缘，发送「修仙结缘 对方wxid」发起关系。');
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
            const equipped = await repo.getEquippedItems(player);
            const pet = await repo.findPet(player.id);
            const petBonus = petCombatBonus(pet);
            const power = mergeCombatPower(calcCombatPower(player, equipped), petBonus);
            const inventoryCount = await repo.countInventory(player.id);
            const panel = statusText(player, power, equipped, inventoryCount);
            if (!pet) return asText(panel);
            return asText(`${panel}\n━━━━━━━━━━━━\n🐶 灵宠：${pet.petName} Lv.${pet.level}（亲密 ${pet.affection}/100）\n⚔️ 灵宠战斗加成：攻+${petBonus.attack} 防+${petBonus.defense} 血+${petBonus.maxHp}`);
        }

        if (cmd.type === 'cultivate') {
            const left = await checkCooldown(repo, player.id, XIUXIAN_ACTIONS.cultivate, now);
            if (left > 0) return asText(cooldownText('修炼', left));

            const times = Math.min(Math.max(cmd.times ?? 1, 1), 20);
            const reward = cultivateReward(player.level, times);
            const pet = await repo.findPet(player.id);
            const petBonus = pet ? petCultivateStoneBonus(pet.level, pet.affection, times) : 0;
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
                    `🪪 当前境界：${formatRealm(player.level)}`,
                ].join('\n'),
            );
        }

        if (cmd.type === 'petAdopt') {
            const existed = await repo.findPet(player.id);
            if (existed) return asText(`🐾 你已经拥有灵宠：${existed.petName}`);
            const pool = [
                {name: '灵狐', type: '灵兽'},
                {name: '玄龟', type: '守护'},
                {name: '青鸾', type: '飞羽'},
                {name: '月兔', type: '瑞兽'},
            ];
            const roll = pool[Math.floor(Math.random() * pool.length)];
            const pet = await repo.createPet(player.id, roll.name, roll.type, now);
            return asText(petAdoptText(pet));
        }

        if (cmd.type === 'petStatus') {
            const pet = await repo.findPet(player.id);
            if (!pet) return asText('🐾 你还没有灵宠，发送「修仙领宠」即可获得首只灵宠。');
            const bonus = petCombatBonus(pet);
            return asText(petStatusText(pet, {attack: bonus.attack, defense: bonus.defense, hp: bonus.maxHp}));
        }

        if (cmd.type === 'petDeploy') {
            const pet = await repo.findPet(player.id);
            if (!pet) return asText('🐾 你还没有灵宠，发送「修仙领宠」即可获得首只灵宠。');
            if (pet.inBattle === 1) return asText(`⚔️ ${pet.petName} 当前已经是出战状态。`);
            await repo.updatePetBattleState(pet.id, 1, now);
            return asText(petBattleStateText(pet.petName, true));
        }

        if (cmd.type === 'petRest') {
            const pet = await repo.findPet(player.id);
            if (!pet) return asText('🐾 你还没有灵宠，发送「修仙领宠」即可获得首只灵宠。');
            if (pet.inBattle === 0) return asText(`🛌 ${pet.petName} 当前已经是休战状态。`);
            await repo.updatePetBattleState(pet.id, 0, now);
            return asText(petBattleStateText(pet.petName, false));
        }

        if (cmd.type === 'petFeed') {
            const pet = await repo.findPet(player.id);
            if (!pet) return asText('🐾 你还没有灵宠，发送「修仙领宠」即可获得首只灵宠。');
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
            await repo.updatePetFeed(pet.id, dayKey, now);
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

            return asText(petFeedText(latest, cost, player.spiritStone, milestoneLines));
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
            const items = await repo.listInventory(player.id, page, XIUXIAN_PAGE_SIZE, filter.query);
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

        if (cmd.type === 'challenge') {
            const left = await checkCooldown(repo, player.id, XIUXIAN_ACTIONS.challenge, now);
            if (left > 0) return asText(cooldownText('挑战', left));

            const equipped = await repo.getEquippedItems(player);
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

            const item = await repo.findItem(player.id, cmd.itemId);
            if (!item) return asText('🔎 未找到该装备编号，请先用「修仙背包」查看。');

            const equippedIds = [player.weaponItemId, player.armorItemId, player.accessoryItemId, player.sutraItemId];
            if (equippedIds.includes(item.id)) {
                return asText('🧷 已装备的物品无法出售，请先「修仙卸装」。');
            }

            const gain = calcSellPrice(item);
            const removed = await repo.removeItem(player.id, item.id);
            if (!removed) return asText('⚠️ 该装备已被处理，请刷新背包后重试。');

            await repo.gainSpiritStone(player.id, gain, now);
            const latest = await repo.findPlayerById(player.id);
            const balanceAfter = latest?.spiritStone ?? player.spiritStone + gain;
            await repo.createEconomyLog({
                playerId: player.id,
                bizType: 'sell',
                deltaSpiritStone: gain,
                balanceAfter,
                refType: 'inventory_item',
                refId: item.id,
                idempotencyKey: idemKey,
                extraJson: JSON.stringify({itemName: item.itemName, score: item.score}),
                now,
            });
            return asText(sellResultText(item.itemName, gain, balanceAfter));
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

            const equipped = await repo.getEquippedItems(player);
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
            const targetFloor = (progress?.highestFloor ?? 0) + 1;
            const enemy = towerEnemy(player.level, targetFloor);
            const equipped = await repo.getEquippedItems(player);
            const pet = await repo.findPet(player.id);
            const power = mergeCombatPower(calcCombatPower(player, equipped), petCombatBonus(pet));
            const result = runSimpleBattle(power, enemy);
            const reward = towerRewards(player.level, targetFloor, result.win);

            const step = applyExpProgress(player, reward.exp);
            player.level = step.level;
            player.exp = step.exp;
            player.maxHp = step.maxHp;
            player.attack = step.attack;
            player.defense = step.defense;
            player.hp = step.maxHp;
            player.spiritStone += reward.spiritStone;
            player.cultivation += reward.cultivation;
            await repo.updatePlayer(player, now);

            const highestFloor = result.win ? targetFloor : progress?.highestFloor ?? 0;
            const rewardJson = JSON.stringify({
                spiritStone: reward.spiritStone,
                exp: reward.exp,
                cultivation: reward.cultivation,
                floor: targetFloor,
            });
            await repo.upsertTowerProgress(player.id, highestFloor, result.win ? 'win' : 'lose', rewardJson, now);
            await repo.upsertTowerSeasonProgress(player.id, towerSeasonKey(now), highestFloor, now);
            await repo.addTowerLog(player.id, targetFloor, result.win ? 'win' : 'lose', result.rounds, rewardJson, result.logs.join('\n'), now);
            await repo.setCooldown(player.id, XIUXIAN_ACTIONS.towerClimb, now + XIUXIAN_COOLDOWN_MS.towerClimb, now);
            await repo.createEconomyLog({
                playerId: player.id,
                bizType: 'reward',
                deltaSpiritStone: reward.spiritStone,
                balanceAfter: player.spiritStone,
                refType: 'tower',
                refId: targetFloor,
                idempotencyKey: `${player.id}:tower:${message.messageId}`,
                extraJson: JSON.stringify({result: result.win ? 'win' : 'lose', floor: targetFloor, exp: reward.exp, cultivation: reward.cultivation}),
                now,
            });

            const climbText = towerClimbText({
                floor: targetFloor,
                result: result.win ? 'win' : 'lose',
                rounds: result.rounds,
                reward,
                highestFloor,
                enemyName: enemy.name,
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

