import type {IncomingMessage, HandlerResponse} from '../../../../types/message.js';
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
import {petCombatBonus} from '../core/balance/index.js';
import {XiuxianRepository} from '../core/repository/index.js';
import type {XiuxianCommand, XiuxianIdentity} from '../core/types/index.js';
import {handleBattleReplyCommand} from '../features/battle/index.js';
import {ensureWorldBossState, handleBossReplyCommand} from '../features/boss/index.js';
import {handleEconomyCommand} from '../features/economy/index.js';
import {handleFortuneCommand} from '../features/fortune/index.js';
import {handleGrowthCommand} from '../features/growth/index.js';
import {handleHelpCommand} from '../features/help/index.js';
import {handleInventoryCommand} from '../features/inventory/index.js';
import {handlePetCommand} from '../features/pet/index.js';
import {handlePlayerCommand, handlePlayerEntryCommand} from '../features/player/index.js';
import {handleSocialCommand} from '../features/social/index.js';
import {handleTowerReplyCommand} from '../features/tower/index.js';
import {cooldownText} from './reply/index.js';

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