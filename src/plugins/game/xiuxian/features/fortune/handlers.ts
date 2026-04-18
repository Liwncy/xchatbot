import type {HandlerResponse} from '../../../../../types/message.js';
import type {XiuxianCommand, XiuxianPlayer} from '../../core/types/index.js';
import {XiuxianRepository} from '../../core/repository/index.js';
import {
    fortuneAlreadyDrewText,
    fortuneDrawText,
    fortuneNotYetText,
    fortuneRerollCapText,
    fortuneRerollNotEnoughText,
    fortuneStatusText,
} from './reply.js';
import {fortuneDayKey, nextRerollCost, rollFortune, type XiuxianFortuneBuff, type XiuxianFortuneLevel} from './buff.js';

type FortuneCommandContext = {
    now: number;
};

function asText(content: string): HandlerResponse {
    return {type: 'text', content};
}

export async function handleFortuneCommand(
    repo: XiuxianRepository,
    player: XiuxianPlayer,
    cmd: XiuxianCommand,
    context?: FortuneCommandContext,
): Promise<HandlerResponse | null> {
    if (!context) return null;

    if (cmd.type === 'fortune') {
        const dayKey = fortuneDayKey(context.now);
        const existing = await repo.findFortuneByDay(player.id, dayKey);
        if (existing) {
            return asText(fortuneAlreadyDrewText());
        }
        const drawn = rollFortune();
        const inserted = await repo.insertFortune({
            playerId: player.id,
            dayKey,
            level: drawn.level,
            buffJson: JSON.stringify(drawn.buff),
            signText: drawn.sign,
            now: context.now,
        });
        if (!inserted) {
            const record = await repo.findFortuneByDay(player.id, dayKey);
            if (!record) return asText('⚠️ 占卜失败，请稍后重试。');
            const buff = JSON.parse(record.buffJson) as XiuxianFortuneBuff;
            return asText(
                fortuneStatusText({
                    level: record.level as XiuxianFortuneLevel,
                    buff,
                    sign: record.signText,
                    dayKey: record.dayKey,
                    rerollCount: record.rerollCount,
                    rerollSpent: record.rerollSpent,
                }),
            );
        }
        return asText(
            fortuneDrawText({
                level: drawn.level,
                buff: drawn.buff,
                sign: drawn.sign,
                dayKey,
            }),
        );
    }

    if (cmd.type === 'fortuneStatus') {
        const dayKey = fortuneDayKey(context.now);
        const record = await repo.findFortuneByDay(player.id, dayKey);
        if (!record) return asText(fortuneNotYetText());
        const buff = JSON.parse(record.buffJson) as XiuxianFortuneBuff;
        return asText(
            fortuneStatusText({
                level: record.level as XiuxianFortuneLevel,
                buff,
                sign: record.signText,
                dayKey: record.dayKey,
                rerollCount: record.rerollCount,
                rerollSpent: record.rerollSpent,
            }),
        );
    }

    if (cmd.type === 'fortuneReroll') {
        const dayKey = fortuneDayKey(context.now);
        const record = await repo.findFortuneByDay(player.id, dayKey);
        if (!record) return asText(fortuneNotYetText());
        const cost = nextRerollCost(record.rerollCount);
        if (cost == null) return asText(fortuneRerollCapText(record.rerollCount, record.rerollSpent));
        if (player.spiritStone < cost) return asText(fortuneRerollNotEnoughText(cost, player.spiritStone));

        const spent = await repo.spendSpiritStone(player.id, cost, context.now);
        if (!spent) return asText('💸 灵石扣除失败，请稍后再试。');

        const drawn = rollFortune();
        const ok = await repo.rerollFortune({
            playerId: player.id,
            dayKey,
            level: drawn.level,
            buffJson: JSON.stringify(drawn.buff),
            signText: drawn.sign,
            extraSpent: cost,
            expectedRerollCount: record.rerollCount,
            now: context.now,
        });
        if (!ok) {
            await repo.gainSpiritStone(player.id, cost, context.now);
            return asText('⚠️ 改运并发冲突，灵石已退还，请重试。');
        }

        const latest = await repo.findPlayerById(player.id);
        await repo.createEconomyLog({
            playerId: player.id,
            bizType: 'cost',
            deltaSpiritStone: -cost,
            balanceAfter: latest?.spiritStone ?? 0,
            refType: 'fortune_reroll',
            refId: null,
            idempotencyKey: `${player.id}:fortune-reroll:${dayKey}:${record.rerollCount + 1}`,
            extraJson: JSON.stringify({dayKey, level: drawn.level, rerollCount: record.rerollCount + 1}),
            now: context.now,
        });

        return asText(
            fortuneDrawText({
                level: drawn.level,
                buff: drawn.buff,
                sign: drawn.sign,
                dayKey,
                reroll: {
                    cost,
                    totalSpent: record.rerollSpent + cost,
                    count: record.rerollCount + 1,
                },
            }),
        );
    }

    return null;
}