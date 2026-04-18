import type {IncomingMessage, HandlerResponse} from '../../../../../types/message.js';
import {applyExpProgress, bossEnemy, bossRewards, rollExploreLoot, runBossBattle} from '../../core/balance/index.js';
import {XIUXIAN_ACTIONS, XIUXIAN_COOLDOWN_MS, XIUXIAN_PAGE_SIZE, XIUXIAN_WORLD_BOSS} from '../../core/constants/index.js';
import type {CombatPower, XiuxianCommand, XiuxianPlayer, XiuxianWorldBossState} from '../../core/types/index.js';
import {XiuxianRepository} from '../../core/repository/index.js';
import {applyBattleRewardRate} from '../fortune/index.js';
import {bossDetailText, bossLogText, bossRaidText, worldBossRankText, worldBossSelfRankText, worldBossStatusText} from './reply.js';

type BossFortuneBuff = Parameters<typeof applyBattleRewardRate>[1];

type BossCommandContext = {
    message: IncomingMessage;
    now: number;
    ensureWorldBossState?: (
        repo: XiuxianRepository,
        scopeKey: string,
        level: number,
        now: number,
    ) => Promise<XiuxianWorldBossState>;
    checkCooldown?: (playerId: number, action: string, now: number) => Promise<number>;
    cooldownText?: (action: string, leftMs: number) => string;
    loadFortuneBuff?: (playerId: number, now: number) => Promise<BossFortuneBuff>;
    buildCombatPower?: (player: XiuxianPlayer, fortuneBuff: BossFortuneBuff) => Promise<CombatPower>;
};

function asText(content: string): HandlerResponse {
    return {type: 'text', content};
}

export async function handleBossReplyCommand(
    repo: XiuxianRepository,
    player: XiuxianPlayer,
    cmd: XiuxianCommand,
    context?: BossCommandContext,
): Promise<HandlerResponse | null> {
    if (
        cmd.type === 'bossRaid'
        && context?.ensureWorldBossState
        && context.checkCooldown
        && context.cooldownText
        && context.loadFortuneBuff
        && context.buildCombatPower
    ) {
        const left = await context.checkCooldown(player.id, XIUXIAN_ACTIONS.bossRaid, context.now);
        if (left > 0) return asText(context.cooldownText('讨伐', left));

        const fortuneBuff = await context.loadFortuneBuff(player.id, context.now);
        const power = await context.buildCombatPower(player, fortuneBuff);
        const scopeKey = bossScopeKeyOfMessage(context.message);

        let state = await context.ensureWorldBossState(repo, scopeKey, player.level, context.now);
        if (state.status === 'defeated') {
            const baseTime = state.defeatedAt ?? state.updatedAt;
            const leftMs = Math.max(0, XIUXIAN_WORLD_BOSS.respawnMs - (context.now - baseTime));
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
            state = await context.ensureWorldBossState(repo, scopeKey, player.level, context.now);
            hpBefore = state.currentHp;
            actualDamage = Math.min(theoryDamage, hpBefore);
            if (actualDamage <= 0) break;
            const ok = await repo.attackWorldBoss(scopeKey, state.version, actualDamage, context.message.from, context.now);
            if (!ok) continue;
            updated = await repo.findWorldBossState(scopeKey);
            break;
        }

        if (!updated) {
            return asText('⚠️ 讨伐并发过高，请稍后再试。');
        }

        const killed = updated.status === 'defeated' && hpBefore > 0 && updated.currentHp === 0;
        await repo.addWorldBossContribution(scopeKey, updated.cycleNo, player.id, actualDamage, killed, context.now);

        const base = bossRewards(player.level, killed);
        const ratio = Math.max(0.1, Math.min(1, actualDamage / Math.max(1, updated.maxHp)));
        const reward = {
            gainedStone: Math.max(1, applyBattleRewardRate(Math.floor(base.gainedStone * ratio + (killed ? 40 : 0)), fortuneBuff)),
            gainedExp: Math.max(1, applyBattleRewardRate(Math.floor(base.gainedExp * ratio + (killed ? 50 : 0)), fortuneBuff)),
            gainedCultivation: Math.max(1, applyBattleRewardRate(Math.floor(base.gainedCultivation * ratio + (killed ? 60 : 0)), fortuneBuff)),
        };

        let dropName: string | undefined;
        if (killed) {
            const currentInv = await repo.countInventory(player.id);
            if (currentInv < player.backpackCap && Math.random() < 0.85) {
                const drop = rollExploreLoot(player.level + 3);
                if (drop) {
                    await repo.addItem(player.id, drop, context.now);
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
        await repo.updatePlayer(player, context.now);

        await repo.createEconomyLog({
            playerId: player.id,
            bizType: 'reward',
            deltaSpiritStone: reward.gainedStone,
            balanceAfter: player.spiritStone,
            refType: 'boss',
            refId: null,
            idempotencyKey: `${player.id}:boss:${updated.cycleNo}:${context.message.messageId}`,
            extraJson: JSON.stringify({
                exp: reward.gainedExp,
                cultivation: reward.gainedCultivation,
                damage: actualDamage,
                killed,
                scopeKey,
            }),
            now: context.now,
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
            context.now,
        );
        await repo.setCooldown(player.id, XIUXIAN_ACTIONS.bossRaid, context.now + XIUXIAN_COOLDOWN_MS.bossRaid, context.now);

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

    if ((cmd.type === 'bossStatus' || cmd.type === 'bossRank') && context?.ensureWorldBossState) {
        const scopeKey = bossScopeKeyOfMessage(context.message);
        const state = await context.ensureWorldBossState(repo, scopeKey, player.level, context.now);

        if (cmd.type === 'bossStatus') {
            const self = await repo.findWorldBossContribution(scopeKey, state.cycleNo, player.id);
            const baseTime = state.defeatedAt ?? state.updatedAt;
            const respawnLeftSec =
                state.status === 'defeated'
                    ? Math.max(0, Math.ceil((XIUXIAN_WORLD_BOSS.respawnMs - (context.now - baseTime)) / 1000))
                    : 0;
            return asText(worldBossStatusText(state, self, {respawnLeftSec, cycleNo: state.cycleNo}));
        }

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
                ? Math.max(0, Math.ceil((XIUXIAN_WORLD_BOSS.respawnMs - (context.now - baseTime)) / 1000))
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

    return null;
}

function bossScopeKeyOfMessage(message: IncomingMessage): string {
    void message;
    return 'world:global';
}

export async function ensureWorldBossState(
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

function worldBossHp(level: number): number {
    return 500 + level * 120;
}