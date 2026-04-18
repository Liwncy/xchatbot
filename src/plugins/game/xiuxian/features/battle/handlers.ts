import type {HandlerResponse} from '../../../../../types/message.js';
import {applyExpProgress, challengeEnemy, runSimpleBattle} from '../../core/balance/index.js';
import {XIUXIAN_ACTIONS, XIUXIAN_COOLDOWN_MS, XIUXIAN_PAGE_SIZE} from '../../core/constants/index.js';
import type {CombatPower, XiuxianCommand, XiuxianPlayer} from '../../core/types/index.js';
import {XiuxianRepository} from '../../core/repository/index.js';
import {applyBattleRewardRate} from '../fortune/index.js';
import {battleDetailText, battleLogText, challengeResultText} from './reply.js';

type BattleFortuneBuff = Parameters<typeof applyBattleRewardRate>[1];

type BattleCommandContext = {
    now: number;
    checkCooldown: (playerId: number, action: string, now: number) => Promise<number>;
    cooldownText: (action: string, leftMs: number) => string;
    loadFortuneBuff: (playerId: number, now: number) => Promise<BattleFortuneBuff>;
    buildCombatPower: (player: XiuxianPlayer, fortuneBuff: BattleFortuneBuff) => Promise<CombatPower>;
    fortuneHintLine: (buff: BattleFortuneBuff) => string;
};

function asText(content: string): HandlerResponse {
    return {type: 'text', content};
}

export async function handleBattleReplyCommand(
    repo: XiuxianRepository,
    player: XiuxianPlayer,
    cmd: XiuxianCommand,
    context?: BattleCommandContext,
): Promise<HandlerResponse | null> {
    if (cmd.type === 'challenge' && context) {
        const left = await context.checkCooldown(player.id, XIUXIAN_ACTIONS.challenge, context.now);
        if (left > 0) return asText(context.cooldownText('挑战', left));

        const fortuneBuff = await context.loadFortuneBuff(player.id, context.now);
        const power = await context.buildCombatPower(player, fortuneBuff);
        const enemy = challengeEnemy(player.level);
        const result = runSimpleBattle(power, enemy);

        let rewardExp = 0;
        let rewardStone = 0;
        if (result.win) {
            rewardExp = applyBattleRewardRate(20 + player.level * 6, fortuneBuff);
            rewardStone = applyBattleRewardRate(10 + player.level * 3, fortuneBuff);
            const progress = applyExpProgress(player, rewardExp);
            player.level = progress.level;
            player.exp = progress.exp;
            player.maxHp = progress.maxHp;
            player.attack = progress.attack;
            player.defense = progress.defense;
            player.hp = progress.maxHp;
            player.spiritStone += rewardStone;
            await repo.updatePlayer(player, context.now);
        }

        await repo.addBattleLog(
            player.id,
            enemy.name,
            enemy.level,
            result.win ? 'win' : 'lose',
            result.rounds,
            JSON.stringify({exp: rewardExp, spiritStone: rewardStone}),
            result.logs.join('\n'),
            context.now,
        );
        await repo.setCooldown(player.id, XIUXIAN_ACTIONS.challenge, context.now + XIUXIAN_COOLDOWN_MS.challenge, context.now);

        return asText(
            challengeResultText({
                enemyName: enemy.name,
                win: result.win,
                rounds: result.rounds,
                exp: rewardExp,
                spiritStone: rewardStone,
                logs: result.logs,
                fortuneLine: context.fortuneHintLine(fortuneBuff),
            }),
        );
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

    return null;
}