import type {HandlerResponse} from '../../../../../types/message.js';
import {applyExpProgress, cultivateReward, exploreDropHintText, exploreStoneReward, rollExploreLoot} from '../../core/balance/index.js';
import {XIUXIAN_ACTIONS, XIUXIAN_CHECKIN_REWARD, XIUXIAN_COOLDOWN_MS, XIUXIAN_TASK_DEFAULT_LIMIT} from '../../core/constants/index.js';
import type {XiuxianCommand, XiuxianPlayer} from '../../core/types/index.js';
import {XiuxianRepository} from '../../core/repository/index.js';
import {applyCultivateRate, applyExploreRate} from '../fortune/index.js';
import {achievementText, checkinText, claimTaskBatchText, claimTaskText, cultivateText, exploreLootText, exploreStoneText, taskText} from './reply.js';
import {dayKeyOf, rewardFromJson, syncAchievements, syncDailyTasks} from './shared.js';

type GrowthFortuneBuff = Parameters<typeof applyCultivateRate>[1];

type GrowthCommandContext = {
    now: number;
    checkCooldown: (playerId: number, action: string, now: number) => Promise<number>;
    cooldownText: (action: string, leftMs: number) => string;
    loadFortuneBuff: (playerId: number, now: number) => Promise<GrowthFortuneBuff>;
    fortuneHintLine: (buff: GrowthFortuneBuff) => string;
    getPetStoneBonus: (times: number) => Promise<number>;
};

function asText(content: string): HandlerResponse {
    return {type: 'text', content};
}

export async function handleGrowthCommand(
    repo: XiuxianRepository,
    player: XiuxianPlayer,
    cmd: XiuxianCommand,
    context?: GrowthCommandContext,
): Promise<HandlerResponse | null> {
    if (cmd.type === 'explore' && context) {
        const dropHint = exploreDropHintText();
        const left = await context.checkCooldown(player.id, XIUXIAN_ACTIONS.explore, context.now);
        if (left > 0) return asText(context.cooldownText('探索', left));

        const fortuneBuff = await context.loadFortuneBuff(player.id, context.now);
        const fortuneLine = context.fortuneHintLine(fortuneBuff);

        const total = await repo.countInventory(player.id);
        if (total >= player.backpackCap) {
            const stone = applyExploreRate(exploreStoneReward(player.level), fortuneBuff);
            player.spiritStone += stone;
            await repo.updatePlayer(player, context.now);
            await repo.setCooldown(player.id, XIUXIAN_ACTIONS.explore, context.now + XIUXIAN_COOLDOWN_MS.explore, context.now);
            return asText(exploreStoneText({stone, dropHint, fortuneLine, backpackFull: true}));
        }

        const loot = rollExploreLoot(player.level);
        await repo.setCooldown(player.id, XIUXIAN_ACTIONS.explore, context.now + XIUXIAN_COOLDOWN_MS.explore, context.now);

        if (!loot) {
            const stone = applyExploreRate(exploreStoneReward(player.level), fortuneBuff);
            player.spiritStone += stone;
            await repo.updatePlayer(player, context.now);
            return asText(exploreStoneText({stone, dropHint, fortuneLine}));
        }

        await repo.addItem(player.id, loot, context.now);
        return asText(exploreLootText({loot, dropHint, fortuneLine}));
    }

    if (cmd.type === 'checkin' && context) {
        const todayKey = dayKeyOf(context.now);
        const inserted = await repo.addCheckin(player.id, todayKey, XIUXIAN_CHECKIN_REWARD, context.now);
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
        await repo.updatePlayer(player, context.now);
        await repo.createEconomyLog({
            playerId: player.id,
            bizType: 'reward',
            deltaSpiritStone: XIUXIAN_CHECKIN_REWARD.spiritStone,
            balanceAfter: player.spiritStone,
            refType: 'checkin',
            refId: null,
            idempotencyKey: `${player.id}:checkin:${todayKey}`,
            extraJson: JSON.stringify({exp: XIUXIAN_CHECKIN_REWARD.exp, cultivation: XIUXIAN_CHECKIN_REWARD.cultivation}),
            now: context.now,
        });
        return asText(checkinText(XIUXIAN_CHECKIN_REWARD, player.level, player.spiritStone));
    }

    if (cmd.type === 'task' && context) {
        const todayKey = dayKeyOf(context.now);
        await syncDailyTasks(repo, player, context.now);
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

    if (cmd.type === 'claim' && context) {
        const todayKey = dayKeyOf(context.now);
        await syncDailyTasks(repo, player, context.now);
        const defs = await repo.listTaskDefs();
        const states = await repo.listPlayerTasks(player.id, todayKey);
        const stateMap = new Map<number, (typeof states)[number]>();
        for (const row of states) stateMap.set(row.taskId, row);

        let targets = defs.filter((def) => stateMap.get(def.id)?.status === 'claimable');
        if (cmd.taskId) {
            const one = defs.find((value) => value.id === cmd.taskId);
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
            const locked = await repo.markTaskClaimed(player.id, def.id, todayKey, context.now);
            if (!locked) continue;
            const reward = rewardFromJson(def.rewardJson);
            gainStone += reward.spiritStone;
            gainExp += reward.exp;
            gainCultivation += reward.cultivation;
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
        await repo.updatePlayer(player, context.now);

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
                now: context.now,
            });
        }

        if (claimedIds.length === 1) {
            return asText(claimTaskText(claimedTitles[0], {spiritStone: gainStone, exp: gainExp, cultivation: gainCultivation}, player.spiritStone));
        }
        return asText(claimTaskBatchText(claimedTitles, {spiritStone: gainStone, exp: gainExp, cultivation: gainCultivation}, player.spiritStone));
    }

    if (cmd.type === 'achievement' && context) {
        await syncAchievements(repo, player, context.now);
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
            const marked = await repo.markAchievementClaimed(player.id, def.id, context.now);
            if (!marked) continue;
            const reward = rewardFromJson(def.rewardJson);
            autoGainStone += reward.spiritStone;
            autoGainExp += reward.exp;
            autoGainCultivation += reward.cultivation;
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
            await repo.updatePlayer(player, context.now);
            if (autoGainStone > 0) {
                await repo.createEconomyLog({
                    playerId: player.id,
                    bizType: 'reward',
                    deltaSpiritStone: autoGainStone,
                    balanceAfter: player.spiritStone,
                    refType: 'achievement',
                    refId: null,
                    idempotencyKey: `${player.id}:achievement:${dayKeyOf(context.now)}:${claimedTitles.join('|')}`,
                    extraJson: JSON.stringify({titles: claimedTitles, exp: autoGainExp, cultivation: autoGainCultivation}),
                    now: context.now,
                });
            }
            await syncAchievements(repo, player, context.now);
        }

        const refreshed = await repo.listPlayerAchievements(player.id);
        return asText(achievementText(defs, refreshed, claimedTitles));
    }

    if (cmd.type === 'cultivate' && context) {
        const left = await context.checkCooldown(player.id, XIUXIAN_ACTIONS.cultivate, context.now);
        if (left > 0) return asText(context.cooldownText('修炼', left));

        const times = Math.min(Math.max(cmd.times ?? 1, 1), 20);
        const reward = cultivateReward(player.level, times);
        const petBonus = await context.getPetStoneBonus(times);
        const fortuneBuff = await context.loadFortuneBuff(player.id, context.now);
        const gainedExp = applyCultivateRate(reward.gainedExp, fortuneBuff);
        const gainedCultivation = applyCultivateRate(reward.gainedCultivation, fortuneBuff);
        const gainedStone = applyCultivateRate(reward.gainedStone, fortuneBuff);
        const progress = applyExpProgress(player, gainedExp);

        player.level = progress.level;
        player.exp = progress.exp;
        player.maxHp = progress.maxHp;
        player.attack = progress.attack;
        player.defense = progress.defense;
        player.hp = progress.maxHp;
        player.cultivation += gainedCultivation;
        player.spiritStone += gainedStone + petBonus;

        await repo.updatePlayer(player, context.now);
        await repo.setCooldown(player.id, XIUXIAN_ACTIONS.cultivate, context.now + XIUXIAN_COOLDOWN_MS.cultivate, context.now);

        return asText(
            cultivateText({
                times,
                gainedCultivation,
                gainedExp,
                gainedStone,
                petBonus,
                level: player.level,
                fortuneLine: context.fortuneHintLine(fortuneBuff),
            }),
        );
    }

    return null;
}