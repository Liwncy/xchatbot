import type {IncomingMessage, HandlerResponse} from '../../../../../types/message.js';
import {applyExpProgress, runSimpleBattle} from '../../core/balance/index.js';
import {XIUXIAN_ACTIONS, XIUXIAN_BOND_MILESTONE_REWARDS, XIUXIAN_NPC_ENCOUNTER_POOL, XIUXIAN_PAGE_SIZE, XIUXIAN_PVP} from '../../core/constants/index.js';
import {XiuxianRepository} from '../../core/repository/index.js';
import type {CombatPower, XiuxianCommand, XiuxianPlayer} from '../../core/types/index.js';
import {applyBattleRewardRate, applyFortuneToPower, type XiuxianFortuneBuff} from '../fortune/index.js';
import {bondActivatedText, bondBreakText, bondLogText, bondRequestText, bondStatusText, bondTravelText, npcEncounterLogText, npcEncounterText, pvpBattleResultText, pvpSparRejectText, pvpSparRequestText} from './reply.js';

type SocialCommandContext = {
    message: IncomingMessage;
    now: number;
    loadFortuneBuff: (playerId: number, now: number) => Promise<XiuxianFortuneBuff>;
    buildCombatPower: (player: XiuxianPlayer) => Promise<CombatPower>;
};

function asText(content: string): HandlerResponse {
    return {type: 'text', content};
}

export async function handleSocialCommand(
    repo: XiuxianRepository,
    player: XiuxianPlayer,
    cmd: XiuxianCommand,
    context?: SocialCommandContext,
): Promise<HandlerResponse | null> {
    if (!context) return null;

    const {message, now} = context;

    if (cmd.type === 'spar') {
        const resolved = resolvePvpTarget(message, cmd.targetUserId, '切磋');
        if (resolved.error) return asText(resolved.error);
        if (!resolved.targetUserId) return asText('💡 用法：修仙切磋 @对方（群聊） 或 修仙切磋 对方wxid');

        const target = await repo.findPlayerByPlatformUserId('wechat', resolved.targetUserId);
        if (!target) return asText('🔎 未找到该道友，请确认对方已创建角色且wxid正确。');
        const invalid = validatePvpTarget(player, target);
        if (invalid) return asText(invalid);

        const incoming = await repo.findPendingPvpRequestBetween(target.id, player.id, 'spar', now);
        if (incoming) {
            return asText(`⚔️ ${target.userName} 已向你发起切磋邀请，发送「修仙应战」或「修仙拒战」即可处理。`);
        }
        const existed = await repo.findPendingPvpRequestBetween(player.id, target.id, 'spar', now);
        if (existed) {
            return asText(`📨 你已向 ${target.userName} 发起切磋邀请，请等待对方回应。`);
        }

        const expiresAt = now + XIUXIAN_PVP.sparRequestExpireMs;
        await repo.createPvpRequest(player.id, target.id, 'spar', expiresAt, now);
        return asText(pvpSparRequestText(target.userName, expiresAt));
    }

    if (cmd.type === 'sparAccept') {
        const request = await repo.findLatestIncomingPvpRequest(player.id, 'spar', now);
        if (!request) return asText('📭 当前没有待你应战的切磋邀请。');
        const requester = await repo.findPlayerById(request.requesterId);
        if (!requester) {
            await repo.updatePvpRequestStatus(request.id, 'pending', 'expired', now);
            return asText('⚠️ 发起切磋的道友已不存在，本次邀请已失效。');
        }
        const invalid = validatePvpTarget(player, requester);
        if (invalid) {
            await repo.updatePvpRequestStatus(request.id, 'pending', 'expired', now);
            return asText(invalid);
        }

        const locked = await repo.updatePvpRequestStatus(request.id, 'pending', 'accepted', now);
        if (!locked) return asText('⚠️ 该切磋邀请状态已变化，请刷新后重试。');

        const selfFortune = await context.loadFortuneBuff(player.id, now);
        const enemyFortune = await context.loadFortuneBuff(requester.id, now);
        const selfPower = applyFortuneToPower(await context.buildCombatPower(player), selfFortune);
        const enemyPower = applyFortuneToPower(await context.buildCombatPower(requester), enemyFortune);
        const result = runSimpleBattle(selfPower, enemyPower);
        const winReward = {
            exp: 14 + Math.floor((player.level + requester.level) / 2) * 3,
            cultivation: 12 + Math.floor((player.level + requester.level) / 2) * 2,
        };
        const loseReward = {
            exp: 8 + Math.floor((player.level + requester.level) / 2) * 2,
            cultivation: 6 + Math.floor((player.level + requester.level) / 2),
        };
        const baseSelfReward = result.win ? winReward : loseReward;
        const baseEnemyReward = result.win ? loseReward : winReward;
        const selfReward = {
            exp: applyBattleRewardRate(baseSelfReward.exp, selfFortune),
            cultivation: applyBattleRewardRate(baseSelfReward.cultivation, selfFortune),
        };
        const enemyReward = {
            exp: applyBattleRewardRate(baseEnemyReward.exp, enemyFortune),
            cultivation: applyBattleRewardRate(baseEnemyReward.cultivation, enemyFortune),
        };

        applyBattleGrowth(player, selfReward);
        applyBattleGrowth(requester, enemyReward);
        await repo.updatePlayer(player, now);
        await repo.updatePlayer(requester, now);

        await repo.addBattleLog(
            player.id,
            requester.userName,
            requester.level,
            result.win ? 'win' : 'lose',
            result.rounds,
            JSON.stringify({battleType: 'pvp', pvpMode: 'spar', opponentId: requester.id, opponentName: requester.userName, ...selfReward}),
            result.logs.join('\n'),
            now,
        );
        await repo.addBattleLog(
            requester.id,
            player.userName,
            player.level,
            result.win ? 'lose' : 'win',
            result.rounds,
            JSON.stringify({battleType: 'pvp', pvpMode: 'spar', opponentId: player.id, opponentName: player.userName, ...enemyReward}),
            invertBattlePerspective(result.logs).join('\n'),
            now,
        );

        return asText(
            pvpBattleResultText({
                mode: 'spar',
                opponentName: requester.userName,
                win: result.win,
                rounds: result.rounds,
                exp: selfReward.exp,
                cultivation: selfReward.cultivation,
                logs: result.logs,
            }),
        );
    }

    if (cmd.type === 'sparReject') {
        const request = await repo.findLatestIncomingPvpRequest(player.id, 'spar', now);
        if (!request) return asText('📭 当前没有待你处理的切磋邀请。');
        const requester = await repo.findPlayerById(request.requesterId);
        const rejected = await repo.updatePvpRequestStatus(request.id, 'pending', 'rejected', now);
        if (!rejected) return asText('⚠️ 该切磋邀请状态已变化，请刷新后重试。');
        return asText(pvpSparRejectText(requester?.userName ?? `道友#${request.requesterId}`));
    }

    if (cmd.type === 'forceFight') {
        const resolved = resolvePvpTarget(message, cmd.targetUserId, '强斗');
        if (resolved.error) return asText(resolved.error);
        if (!resolved.targetUserId) return asText('💡 用法：修仙强斗 @对方（群聊） 或 修仙强斗 对方wxid');

        const target = await repo.findPlayerByPlatformUserId('wechat', resolved.targetUserId);
        if (!target) return asText('🔎 未找到该道友，请确认对方已创建角色且wxid正确。');
        const invalid = validatePvpTarget(player, target);
        if (invalid) return asText(invalid);

        const attackerCd = await getCooldownLeft(repo, player.id, XIUXIAN_ACTIONS.forceFight, now);
        if (attackerCd > 0) return asText(`⏳ 强斗冷却中，请 ${Math.ceil(attackerCd / 1000)}s 后再试。`);
        const targetShield = await getCooldownLeft(repo, target.id, XIUXIAN_ACTIONS.forceFightShield, now);
        if (targetShield > 0) return asText(`🛡️ ${target.userName} 当前处于强斗保护中，请 ${Math.ceil(targetShield / 1000)}s 后再试。`);

        const attackerBaseLevel = player.level;
        const targetBaseLevel = target.level;
        const selfFortune = await context.loadFortuneBuff(player.id, now);
        const targetFortune = await context.loadFortuneBuff(target.id, now);
        const selfPower = applyFortuneToPower(await context.buildCombatPower(player), selfFortune);
        const targetPower = applyFortuneToPower(await context.buildCombatPower(target), targetFortune);
        const result = runSimpleBattle(selfPower, targetPower);

        const winReward = {
            exp: 18 + Math.floor((player.level + target.level) / 2) * 4,
            cultivation: 14 + Math.floor((player.level + target.level) / 2) * 3,
        };
        const loseReward = {
            exp: 7 + Math.floor((player.level + target.level) / 2) * 2,
            cultivation: 5 + Math.floor((player.level + target.level) / 2),
        };
        const baseSelfReward = result.win ? winReward : loseReward;
        const baseEnemyReward = result.win ? loseReward : winReward;
        const selfReward = {
            exp: applyBattleRewardRate(baseSelfReward.exp, selfFortune),
            cultivation: applyBattleRewardRate(baseSelfReward.cultivation, selfFortune),
        };
        const enemyReward = {
            exp: applyBattleRewardRate(baseEnemyReward.exp, targetFortune),
            cultivation: applyBattleRewardRate(baseEnemyReward.cultivation, targetFortune),
        };
        applyBattleGrowth(player, selfReward);
        applyBattleGrowth(target, enemyReward);
        await repo.updatePlayer(player, now);
        await repo.updatePlayer(target, now);

        let lootStone = 0;
        if (result.win) {
            const lootProfile = getForceFightLootProfile(attackerBaseLevel, targetBaseLevel);
            lootStone = Math.min(lootProfile.cap, Math.floor(target.spiritStone * lootProfile.rate));
            if (lootStone > 0) {
                const spent = await repo.spendSpiritStone(target.id, lootStone, now);
                if (spent) {
                    await repo.gainSpiritStone(player.id, lootStone, now);
                } else {
                    lootStone = 0;
                }
            }
        }

        const shieldExpiresAt = now + XIUXIAN_PVP.forceFightShieldMs;
        await repo.setCooldown(player.id, XIUXIAN_ACTIONS.forceFight, now + XIUXIAN_PVP.forceFightCooldownMs, now);
        await repo.setCooldown(target.id, XIUXIAN_ACTIONS.forceFightShield, shieldExpiresAt, now);

        if (lootStone > 0) {
            const latestSelf = await repo.findPlayerById(player.id);
            const latestTarget = await repo.findPlayerById(target.id);
            await repo.createEconomyLog({
                playerId: player.id,
                bizType: 'reward',
                deltaSpiritStone: lootStone,
                balanceAfter: latestSelf?.spiritStone ?? 0,
                refType: 'pvp_force_loot',
                refId: null,
                idempotencyKey: `${player.id}:pvp-force-loot:${message.messageId}`,
                extraJson: JSON.stringify({targetId: target.id, targetName: target.userName}),
                now,
            });
            await repo.createEconomyLog({
                playerId: target.id,
                bizType: 'cost',
                deltaSpiritStone: -lootStone,
                balanceAfter: latestTarget?.spiritStone ?? 0,
                refType: 'pvp_force_loss',
                refId: null,
                idempotencyKey: `${target.id}:pvp-force-loss:${message.messageId}`,
                extraJson: JSON.stringify({attackerId: player.id, attackerName: player.userName}),
                now,
            });
        }

        await repo.addBattleLog(
            player.id,
            target.userName,
            target.level,
            result.win ? 'win' : 'lose',
            result.rounds,
            JSON.stringify({battleType: 'pvp', pvpMode: 'force', opponentId: target.id, opponentName: target.userName, ...selfReward, lootStone, spiritStone: lootStone}),
            result.logs.join('\n'),
            now,
        );
        await repo.addBattleLog(
            target.id,
            player.userName,
            player.level,
            result.win ? 'lose' : 'win',
            result.rounds,
            JSON.stringify({battleType: 'pvp', pvpMode: 'force', opponentId: player.id, opponentName: player.userName, ...enemyReward, lootStone: 0, spiritStone: 0}),
            invertBattlePerspective(result.logs).join('\n'),
            now,
        );

        return asText(
            pvpBattleResultText({
                mode: 'force',
                opponentName: target.userName,
                win: result.win,
                rounds: result.rounds,
                exp: selfReward.exp,
                cultivation: selfReward.cultivation,
                lootStone,
                shieldExpiresAt,
                logs: result.logs,
            }),
        );
    }

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
            return asText(`💞 结缘成功！你与 ${target.userName} 已缔结情缘。`);
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

    if (cmd.type === 'bondLog') {
        const page = Math.max(1, cmd.page ?? 1);
        const logs = await repo.listBondLogs(player.id, page, XIUXIAN_PAGE_SIZE);
        return asText(bondLogText(logs, page, XIUXIAN_PAGE_SIZE));
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
                ...milestoneReached.map((milestone) => {
                    const tier = XIUXIAN_BOND_MILESTONE_REWARDS.find((item) => item.intimacy === milestone)!;
                    return `🎉 达成情缘里程碑 ${milestone}：💎+${tier.spiritStone} 📈+${tier.exp} ✨+${tier.cultivation}`;
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

    return null;
}

export const handleSocialReplyCommand = handleSocialCommand;

function dayKeyOf(now: number): string {
    return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function getCooldownLeft(repo: XiuxianRepository, playerId: number, action: string, now: number): Promise<number> {
    const cd = await repo.getCooldown(playerId, action);
    if (!cd) return 0;
    return Math.max(0, cd.nextAt - now);
}

async function findIncomingPendingBond(repo: XiuxianRepository, playerId: number) {
    const bond = await repo.findLatestBondByPlayer(playerId);
    if (!bond || bond.status !== 'pending') return null;
    if (bond.targetId !== playerId) return null;
    return bond;
}

function pickNpcEncounter(): {
    code: string;
    title: string;
    tier: string;
    spiritStone: number;
    exp: number;
    cultivation: number;
} {
    const total = XIUXIAN_NPC_ENCOUNTER_POOL.reduce((sum, item) => sum + item.weight, 0);
    let point = Math.random() * total;
    for (const item of XIUXIAN_NPC_ENCOUNTER_POOL) {
        point -= item.weight;
        if (point <= 0) {
            return {
                code: item.code,
                title: item.title,
                tier: item.tier,
                spiritStone: item.spiritStone,
                exp: item.exp,
                cultivation: item.cultivation,
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

type RawWechatMessageItem = {
    id?: number | string;
    msg_id?: number | string;
    new_id?: number | string;
    new_msg_id?: number | string;
    source?: string;
    msg_source?: string;
    [key: string]: unknown;
};

function getRawWechatItems(raw: unknown): RawWechatMessageItem[] {
    if (!raw || typeof raw !== 'object') return [];
    const record = raw as {new_messages?: unknown} & RawWechatMessageItem;
    if (Array.isArray(record.new_messages)) return record.new_messages as RawWechatMessageItem[];
    if (record.source || record.msg_source || record.id || record.msg_id || record.new_id || record.new_msg_id) {
        return [record];
    }
    return [];
}

function matchWechatRawItemMessageId(item: RawWechatMessageItem, messageId: string): boolean {
    const ids = [item.id, item.msg_id, item.new_id, item.new_msg_id]
        .map((value) => (value == null ? '' : String(value)))
        .filter(Boolean);
    return ids.includes(messageId);
}

function decodeXmlEntities(value: string): string {
    return value
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&amp;/gi, '&');
}

function normalizeMentionCandidate(value: string): string {
    return decodeXmlEntities(value)
        .trim()
        .replace(/^<!\[CDATA\[/i, '')
        .replace(/]]>$/i, '')
        .replace(/^['"]+|['"]+$/g, '')
        .trim();
}

function parseMentionUserIdList(value: string): string[] {
    const normalized = normalizeMentionCandidate(value);
    if (!normalized) return [];
    return normalized
        .split(/[\n,;，；]+/)
        .map((part) => normalizeMentionCandidate(part))
        .filter((part) => Boolean(part) && part !== 'notify@all');
}

function extractMentionUserIdsFromXml(source: string): string[] {
    const normalized = decodeXmlEntities(source);
    const matches = normalized.matchAll(/<atuserlist(?:\s[^>]*)?>([\s\S]*?)<\/atuserlist>/gi);
    const values: string[] = [];
    for (const match of matches) {
        if (match[1]) values.push(...parseMentionUserIdList(match[1]));
    }
    return values;
}

function isDirectMentionFieldKey(key: string): boolean {
    const normalized = key.trim().toLowerCase();
    return normalized === 'atuserlist'
        || normalized === 'at_user_list'
        || normalized === 'atusers'
        || normalized === 'at_users'
        || normalized === 'mentioneduserids'
        || normalized === 'mentioned_user_ids'
        || normalized === 'remind';
}

function collectMentionedUserIds(value: unknown, result: Set<string>, keyHint?: string): void {
    if (value == null) return;

    if (typeof value === 'string') {
        const ids = keyHint && isDirectMentionFieldKey(keyHint)
            ? parseMentionUserIdList(value)
            : extractMentionUserIdsFromXml(value);
        for (const id of ids) result.add(id);
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectMentionedUserIds(item, result, keyHint);
        }
        return;
    }

    if (typeof value !== 'object') return;

    for (const [key, nested] of Object.entries(value)) {
        collectMentionedUserIds(nested, result, key);
    }
}

function extractGroupMentionedUserIds(message: IncomingMessage): string[] {
    if (message.source !== 'group') return [];
    const items = getRawWechatItems(message.raw);
    const mentioned = new Set<string>();

    const target = items.find((item) => matchWechatRawItemMessageId(item, message.messageId)) ?? items[0];
    if (target) {
        collectMentionedUserIds(target, mentioned);
    }
    if (!mentioned.size) {
        collectMentionedUserIds(message.raw, mentioned);
    }

    return [...mentioned];
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

function resolvePvpTarget(
    message: IncomingMessage,
    rawInput: string | undefined,
    modeLabel: '切磋' | '强斗',
): {targetUserId?: string; error?: string} {
    const input = (rawInput ?? '').trim();
    const mentioned = extractGroupMentionedUserIds(message);

    if (mentioned.length > 1) {
        return {error: `⚠️ ${modeLabel}一次仅支持 @1 位道友，请重新发送。`};
    }
    if (mentioned.length === 1) {
        return {targetUserId: mentioned[0]};
    }
    if (!input) {
        return {error: `💡 用法：修仙${modeLabel} @对方（群聊） 或 修仙${modeLabel} 对方wxid`};
    }
    if (input.startsWith('@')) {
        return {error: '⚠️ 未解析到被 @ 的道友，请在群里使用 @ 选择成员后重试。'};
    }
    return {targetUserId: input};
}

function validatePvpTarget(player: XiuxianPlayer, target: XiuxianPlayer): string | null {
    if (target.id === player.id) return '😅 不能对自己发起战斗。';
    if (Math.abs(player.level - target.level) > XIUXIAN_PVP.maxLevelGap) {
        return `⚖️ 你与 ${target.userName} 的境界差距过大（超过 ${XIUXIAN_PVP.maxLevelGap} 级），暂不可交手。`;
    }
    return null;
}

function getForceFightLootProfile(attackerLevel: number, targetLevel: number): {rate: number; cap: number} {
    const levelDelta = targetLevel - attackerLevel;
    const rate = clampNumber(
        XIUXIAN_PVP.lootRate + levelDelta * XIUXIAN_PVP.lootRatePerLevelDelta,
        XIUXIAN_PVP.minLootRate,
        XIUXIAN_PVP.maxLootRate,
    );
    const cap = Math.round(
        clampNumber(
            XIUXIAN_PVP.lootCap + levelDelta * XIUXIAN_PVP.lootCapPerLevelDelta,
            XIUXIAN_PVP.minLootCap,
            XIUXIAN_PVP.maxLootCap,
        ),
    );
    return {rate, cap};
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function applyBattleGrowth(player: XiuxianPlayer, reward: {exp: number; cultivation: number}): void {
    const progress = applyExpProgress(player, reward.exp);
    player.level = progress.level;
    player.exp = progress.exp;
    player.maxHp = progress.maxHp;
    player.attack = progress.attack;
    player.defense = progress.defense;
    player.hp = progress.maxHp;
    player.cultivation += reward.cultivation;
}

function invertBattlePerspective(logs: string[]): string[] {
    return logs.map((line) => {
        if (line.includes('你造成')) return line.replace('你造成', '敌人造成');
        if (line.includes('敌人造成')) return line.replace('敌人造成', '你造成');
        if (line.includes('你的攻击被闪避')) return line.replace('你的攻击被闪避', '敌人的攻击被闪避');
        if (line.includes('你闪避了敌人的攻击')) return line.replace('你闪避了敌人的攻击', '敌人闪避了你的攻击');
        return line;
    });
}

