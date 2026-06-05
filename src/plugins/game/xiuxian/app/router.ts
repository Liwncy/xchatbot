import type {IncomingMessage} from '../../../../types/message.js';
import type {HandlerResponse} from '../../../../types/reply.js';
import {
    asText,
    checkCooldown,
    createFortuneCombatPowerLoader,
    createPetStoneBonusLoader,
    fortuneHintLine,
    loadPlayerCombatPower,
    loadTodayFortuneBuff,
    mustPlayer,
} from './context.js';
import {petCombatBonus} from '../core/balance';
import {XiuxianRepository} from '../core/repository';
import type {XiuxianCommand, XiuxianIdentity} from '../core/types';
import {handleBattleReplyCommand} from '../features/battle';
import {ensureWorldBossState, handleBossReplyCommand} from '../features/boss';
import {handleEconomyCommand} from '../features/economy';
import {handleFortuneCommand} from '../features/fortune';
import {handleGrowthCommand} from '../features/growth';
import {handleHelpCommand} from '../features/help';
import {handleInventoryCommand} from '../features/inventory';
import {handlePetCommand} from '../features/pet';
import {handlePlayerCommand, handlePlayerEntryCommand} from '../features/player';
import {handleSocialCommand} from '../features/social';
import {handleTowerReplyCommand} from '../features/tower';
import {cooldownText} from './reply';

type XiuxianRouterContext = {
    identity: XiuxianIdentity;
    now: number;
};

export async function routeXiuxianCommand(
    repo: XiuxianRepository,
    message: IncomingMessage,
    cmd: XiuxianCommand,
    context: XiuxianRouterContext,
): Promise<HandlerResponse> {
    const helpResult = handleHelpCommand(cmd);
    if (helpResult) return helpResult;

    const playerEntryResult = await handlePlayerEntryCommand(repo, cmd, {
        identity: context.identity,
        senderName: message.senderName,
        now: context.now,
    });
    if (playerEntryResult) return playerEntryResult;

    const player = await mustPlayer(repo, context.identity);
    if (!player) return asText('🥡 你还没有角色，先发送：修仙创建 [名字]');

    const loadFortuneBuff = (playerId: number, currentNow: number) => loadTodayFortuneBuff(repo, playerId, currentNow);
    const getCooldown = (playerId: number, action: string, currentNow: number) => checkCooldown(repo, playerId, action, currentNow);
    const buildCombatPower = (currentPlayer: typeof player) => loadPlayerCombatPower(repo, currentPlayer);
    const buildTowerCombatPower = createFortuneCombatPowerLoader(repo);
    const buildBossCombatPower = createFortuneCombatPowerLoader(repo);
    const buildBattleCombatPower = createFortuneCombatPowerLoader(repo);
    const getPetStoneBonus = createPetStoneBonusLoader(repo, player.id);

    const playerResult = await handlePlayerCommand(repo, player, cmd);
    if (playerResult) return playerResult;

    const socialResult = await handleSocialCommand(repo, player, cmd, {
        message,
        now: context.now,
        loadFortuneBuff,
        buildCombatPower,
    });
    if (socialResult) return socialResult;

    const fortuneResult = await handleFortuneCommand(repo, player, cmd, {now: context.now});
    if (fortuneResult) return fortuneResult;

    const growthResult = await handleGrowthCommand(repo, player, cmd, {
        now: context.now,
        checkCooldown: getCooldown,
        cooldownText,
        loadFortuneBuff,
        fortuneHintLine: (buff) => fortuneHintLine(buff),
        getPetStoneBonus,
    });
    if (growthResult) return growthResult;

    const petResult = await handlePetCommand(repo, player, cmd, {
        now: context.now,
        getPetBonus: petCombatBonus,
        messageId: message.messageId,
    });
    if (petResult) return petResult;

    const inventoryResult = await handleInventoryCommand(repo, player, cmd, {now: context.now});
    if (inventoryResult) return inventoryResult;

    const economyResult = await handleEconomyCommand(repo, player, cmd, {
        now: context.now,
        messageId: message.messageId,
    });
    if (economyResult) return economyResult;

    const towerReplyResult = await handleTowerReplyCommand(repo, player, cmd, {
        now: context.now,
        messageId: message.messageId,
        checkCooldown: getCooldown,
        cooldownText,
        loadFortuneBuff,
        buildCombatPower: buildTowerCombatPower,
    });
    if (towerReplyResult) return towerReplyResult;

    const bossReplyResult = await handleBossReplyCommand(repo, player, cmd, {
        message,
        now: context.now,
        ensureWorldBossState,
        checkCooldown: getCooldown,
        cooldownText,
        loadFortuneBuff,
        buildCombatPower: buildBossCombatPower,
    });
    if (bossReplyResult) return bossReplyResult;

    const battleReplyResult = await handleBattleReplyCommand(repo, player, cmd, {
        now: context.now,
        checkCooldown: getCooldown,
        cooldownText,
        loadFortuneBuff,
        buildCombatPower: buildBattleCombatPower,
        fortuneHintLine: (buff) => fortuneHintLine(buff),
    });
    if (battleReplyResult) return battleReplyResult;

    return handleHelpCommand({type: 'help'}) ?? asText('⚠️ 修仙帮助加载失败。');
}
