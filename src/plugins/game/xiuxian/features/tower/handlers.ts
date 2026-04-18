import type {HandlerResponse} from '../../../../../types/message.js';
import {applyExpProgress, runSimpleBattle} from '../../core/balance/index.js';
import {XIUXIAN_ACTIONS, XIUXIAN_COOLDOWN_MS, XIUXIAN_PAGE_SIZE, XIUXIAN_TOWER, XIUXIAN_TOWER_SEASON_REWARDS} from '../../core/constants/index.js';
import {formatCountdown} from '../../core/utils/time.js';
import type {CombatPower, XiuxianCommand, XiuxianPlayer} from '../../core/types/index.js';
import {XiuxianRepository} from '../../core/repository/index.js';
import {applyBattleRewardRate} from '../fortune/index.js';
import {
    towerClimbText,
    towerDetailText,
    towerFastClimbText,
    towerLogText,
    towerRankText,
    towerSeasonAutoClaimNoticeText,
    towerSeasonClaimText,
    towerSeasonKeyText,
    towerSeasonRankText,
    towerSeasonRewardText,
    towerSeasonSelfRankText,
    towerSeasonStatusText,
    towerSelfRankText,
    towerStatusText,
} from './reply.js';
import {previousTowerSeasonKey, seasonRewardByRank, towerEnemy, towerRewards, towerSeasonKey, towerSeasonWindow, tryAutoClaimPreviousSeasonReward, weekStartOf} from './shared.js';

type TowerFortuneBuff = Parameters<typeof applyBattleRewardRate>[1];

type TowerCommandContext = {
    now: number;
    messageId: string;
    checkCooldown: (playerId: number, action: string, now: number) => Promise<number>;
    cooldownText: (action: string, leftMs: number) => string;
    loadFortuneBuff: (playerId: number, now: number) => Promise<TowerFortuneBuff>;
    buildCombatPower: (player: XiuxianPlayer, fortuneBuff: TowerFortuneBuff) => Promise<CombatPower>;
};

function asText(content: string): HandlerResponse {
    return {type: 'text', content};
}

export async function handleTowerReplyCommand(
    repo: XiuxianRepository,
    player: XiuxianPlayer,
    cmd: XiuxianCommand,
    context?: TowerCommandContext,
): Promise<HandlerResponse | null> {
    const now = context?.now;

    if (cmd.type === 'towerClimb') {
        if (!context) return null;
        const climbNow = context.now;
        const autoSeason = await tryAutoClaimPreviousSeasonReward(repo, player, climbNow);
        const left = await context.checkCooldown(player.id, XIUXIAN_ACTIONS.towerClimb, climbNow);
        if (left > 0) return asText(context.cooldownText('爬塔', left));

        const progress = await repo.findTowerProgress(player.id);
        const requested = Math.min(Math.max(cmd.times ?? 1, 1), XIUXIAN_TOWER.quickClimbMax);
        let highestFloor = progress?.highestFloor ?? 0;
        const fortuneBuff = await context.loadFortuneBuff(player.id, climbNow);
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
            const power = await context.buildCombatPower(player, fortuneBuff);
            const result = runSimpleBattle(power, enemy);
            const baseReward = towerRewards(player.level, targetFloor, result.win);
            const reward = {
                spiritStone: applyBattleRewardRate(baseReward.spiritStone, fortuneBuff),
                exp: applyBattleRewardRate(baseReward.exp, fortuneBuff),
                cultivation: applyBattleRewardRate(baseReward.cultivation, fortuneBuff),
            };
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
            await repo.addTowerLog(player.id, targetFloor, result.win ? 'win' : 'lose', result.rounds, lastRewardJson, result.logs.join('\n'), climbNow);
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

        await repo.updatePlayer(player, climbNow);
        await repo.upsertTowerProgress(player.id, highestFloor, lastResult, lastRewardJson, climbNow);
        await repo.upsertTowerSeasonProgress(player.id, towerSeasonKey(climbNow), highestFloor, climbNow);
        await repo.setCooldown(player.id, XIUXIAN_ACTIONS.towerClimb, climbNow + XIUXIAN_COOLDOWN_MS.towerClimb, climbNow);
        await repo.createEconomyLog({
            playerId: player.id,
            bizType: 'reward',
            deltaSpiritStone: totalReward.spiritStone,
            balanceAfter: player.spiritStone,
            refType: 'tower',
            refId: highestFloor,
            idempotencyKey: `${player.id}:tower:${context.messageId}`,
            extraJson: JSON.stringify({
                requested,
                attempted,
                cleared,
                failedFloor: failedFloor ?? null,
                highestFloor,
                exp: totalReward.exp,
                cultivation: totalReward.cultivation,
            }),
            now: climbNow,
        });

        const content = requested === 1 && firstRun
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
        if (!autoSeason) return asText(content);
        return asText([
            towerSeasonAutoClaimNoticeText({
                seasonKey: autoSeason.seasonKey,
                rank: autoSeason.rank,
                reward: autoSeason.reward,
            }),
            content,
        ].join('\n\n'));
    }

    if (cmd.type === 'towerStatus') {
        const progress = await repo.findTowerProgress(player.id);
        return asText(towerStatusText(progress));
    }

    if (cmd.type === 'towerRank') {
        if (typeof now !== 'number') return null;
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
        if (typeof now !== 'number') return null;
        return asText(towerSeasonKeyText(towerSeasonKey(now)));
    }

    if (cmd.type === 'towerSeasonStatus') {
        if (typeof now !== 'number') return null;
        const autoSeason = await tryAutoClaimPreviousSeasonReward(repo, player, now);
        const window = towerSeasonWindow(now);
        const prevKey = previousTowerSeasonKey(now);
        const prevRank = await repo.findTowerSeasonRank(prevKey, player.id);
        const prevClaim = await repo.findTowerSeasonClaim(player.id, prevKey);
        const content = towerSeasonStatusText({
            seasonKey: window.seasonKey,
            settleAt: window.settleAt,
            countdown: formatCountdown(window.settleAt - now),
            prevSeasonKey: prevKey,
            prevRank: prevRank?.rank,
            prevClaimed: Boolean(prevClaim),
        });
        if (!autoSeason) return asText(content);
        return asText([
            towerSeasonAutoClaimNoticeText({
                seasonKey: autoSeason.seasonKey,
                rank: autoSeason.rank,
                reward: autoSeason.reward,
            }),
            content,
        ].join('\n\n'));
    }

    if (cmd.type === 'towerSeasonRank') {
        if (typeof now !== 'number') return null;
        const autoSeason = await tryAutoClaimPreviousSeasonReward(repo, player, now);
        const seasonKeyRaw = cmd.seasonKey === '__prev__' ? previousTowerSeasonKey(now) : cmd.seasonKey ?? towerSeasonKey(now);
        if (!/^\d{4}-W\d{2}$/.test(seasonKeyRaw)) {
            return asText('❌ 赛季键格式错误，应为 YYYY-Www，例如：2026-W15');
        }

        const seasonKey = seasonKeyRaw;
        const self = await repo.findTowerSeasonRank(seasonKey, player.id);
        if (cmd.selfOnly) {
            const content = towerSeasonSelfRankText(self, seasonKey);
            if (!autoSeason) return asText(content);
            return asText([
                towerSeasonAutoClaimNoticeText({
                    seasonKey: autoSeason.seasonKey,
                    rank: autoSeason.rank,
                    reward: autoSeason.reward,
                }),
                content,
            ].join('\n\n'));
        }

        const limit = Math.min(Math.max(cmd.limit ?? XIUXIAN_TOWER.rankSize, 1), XIUXIAN_TOWER.rankMax);
        const rows = await repo.listTowerSeasonTop(seasonKey, limit);
        const ahead = self ? await repo.findTowerSeasonAheadNeighbor(seasonKey, player.id) : null;
        const content = towerSeasonRankText(rows, self, limit, ahead, seasonKey);
        if (!autoSeason) return asText(content);
        return asText([
            towerSeasonAutoClaimNoticeText({
                seasonKey: autoSeason.seasonKey,
                rank: autoSeason.rank,
                reward: autoSeason.reward,
            }),
            content,
        ].join('\n\n'));
    }

    if (cmd.type === 'towerSeasonReward') {
        if (typeof now !== 'number') return null;
        return asText(towerSeasonRewardText(towerSeasonKey(now), [...XIUXIAN_TOWER_SEASON_REWARDS]));
    }

    if (cmd.type === 'towerSeasonClaim') {
        if (typeof now !== 'number') return null;
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

    return null;
}