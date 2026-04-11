import type {IncomingMessage, HandlerResponse} from '../../../types/message.js';
import {logger} from '../../../utils/logger.js';
import {XIUXIAN_ACTIONS, XIUXIAN_COOLDOWN_MS, XIUXIAN_DEFAULTS, XIUXIAN_PAGE_SIZE} from './constants.js';
import type {XiuxianCommand, XiuxianIdentity, XiuxianPlayer} from './types.js';
import {XiuxianRepository} from './repository.js';
import {
    applyExpProgress,
    calcCombatPower,
    challengeEnemy,
    cultivateReward,
    exploreStoneReward,
    rollExploreLoot,
    runSimpleBattle,
} from './balance.js';
import {bagText, cooldownText, createdText, equipText, helpText, statusText, unequipText} from './reply.js';

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
            return asText(statusText(player, power));
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
            const total = await repo.countInventory(player.id);
            const items = await repo.listInventory(player.id, page, XIUXIAN_PAGE_SIZE);
            return asText(bagText(items, page, total, XIUXIAN_PAGE_SIZE));
        }

        if (cmd.type === 'equip') {
            const item = await repo.findItem(player.id, cmd.itemId);
            if (!item) return asText('🔎 未找到该装备编号，请先用「背包」查看。');

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

