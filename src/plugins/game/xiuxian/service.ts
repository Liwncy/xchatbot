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
} from './types.js';
import {XiuxianRepository} from './repository.js';
import {
    applyExpProgress,
    calcSellPrice,
    calcCombatPower,
    calcShopPrice,
    challengeEnemy,
    cultivateReward,
    exploreStoneReward,
    generateShopItems,
    rollExploreLoot,
    runSimpleBattle,
} from './balance.js';
import {
    bagText,
    battleDetailText,
    battleLogText,
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
    sellResultText,
    shopText,
    statusText,
    taskText,
    unequipText,
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

        if (key === '普通' || key === 'common') {
            query.quality = 'common';
            labels.push('普通');
            continue;
        }
        if (key === '稀有' || key === 'rare') {
            query.quality = 'rare';
            labels.push('稀有');
            continue;
        }
        if (key === '史诗' || key === 'epic') {
            query.quality = 'epic';
            labels.push('史诗');
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

        return {error: '⚠️ 背包参数仅支持：神兵/护甲/灵宝/法器/普通/稀有/史诗/评分降序/评分升序/最新'};
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
            quality: String(data.quality),
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
        if (cmd.type === 'help') return asText(helpText());

        if (cmd.type === 'create') {
            const existed = await repo.findPlayer(identity);
            if (existed) return asText(`🧾 你已经创建过角色：${existed.userName}`);
            const name = cmd.name?.trim() || message.senderName?.trim() || XIUXIAN_DEFAULTS.name;
            const player = await repo.createPlayer(identity, name, now);
            return asText(createdText(player));
        }

        const player = await mustPlayer(repo, identity);
        if (!player) return asText('🌱 你还没有角色，先发送：修仙创建 [名字]');

        if (cmd.type === 'status') {
            const equipped = await repo.getEquippedItems(player);
            const power = calcCombatPower(player, equipped);
            const inventoryCount = await repo.countInventory(player.id);
            return asText(statusText(player, power, equipped, inventoryCount));
        }

        if (cmd.type === 'cultivate') {
            const left = await checkCooldown(repo, player.id, XIUXIAN_ACTIONS.cultivate, now);
            if (left > 0) return asText(cooldownText('修炼', left));

            const times = Math.min(Math.max(cmd.times ?? 1, 1), 20);
            const reward = cultivateReward(player.level, times);
            const progress = applyExpProgress(player, reward.gainedExp);

            player.level = progress.level;
            player.exp = progress.exp;
            player.maxHp = progress.maxHp;
            player.attack = progress.attack;
            player.defense = progress.defense;
            player.hp = progress.maxHp;
            player.cultivation += reward.gainedCultivation;
            player.spiritStone += reward.gainedStone;

            await repo.updatePlayer(player, now);
            await repo.setCooldown(player.id, XIUXIAN_ACTIONS.cultivate, now + XIUXIAN_COOLDOWN_MS.cultivate, now);

            return asText(
                [
                    `🧘 修炼完成 x${times}`,
                    '━━━━━━━━━━━━',
                    `✨ 修为 +${reward.gainedCultivation}`,
                    `📈 经验 +${reward.gainedExp}`,
                    `💎 灵石 +${reward.gainedStone}`,
                    `🪪 当前境界：${player.level} 级`,
                ].join('\n'),
            );
        }

        if (cmd.type === 'explore') {
            const left = await checkCooldown(repo, player.id, XIUXIAN_ACTIONS.explore, now);
            if (left > 0) return asText(cooldownText('探索', left));

            const total = await repo.countInventory(player.id);
            if (total >= player.backpackCap) {
                const stone = exploreStoneReward(player.level);
                player.spiritStone += stone;
                await repo.updatePlayer(player, now);
                await repo.setCooldown(player.id, XIUXIAN_ACTIONS.explore, now + XIUXIAN_COOLDOWN_MS.explore, now);
                return asText(`🎒 背包已满，本次探索改为获得灵石 ${stone}。`);
            }

            const loot = rollExploreLoot(player.level);
            await repo.setCooldown(player.id, XIUXIAN_ACTIONS.explore, now + XIUXIAN_COOLDOWN_MS.explore, now);

            if (!loot) {
                const stone = exploreStoneReward(player.level);
                player.spiritStone += stone;
                await repo.updatePlayer(player, now);
                return asText(`🧭 本次探索没有发现装备，获得灵石 ${stone}。`);
            }

            await repo.addItem(player.id, loot, now);
            return asText(
                [
                    `🎁 探索成功：获得 ${loot.itemName}（${loot.quality}）`,
                    '━━━━━━━━━━━━',
                    `🧩 类型：${loot.itemType}`,
                    `🗡️ 攻击 +${loot.attack}  🛡️ 防御 +${loot.defense}  ❤️ 气血 +${loot.hp}`,
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
            const power = calcCombatPower(player, equipped);
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

