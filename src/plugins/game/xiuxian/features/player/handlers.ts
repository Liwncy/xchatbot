import type {HandlerResponse} from '../../../../../types/message.js';
import {calcCombatPower, calcSetBonusSummary, mergeCombatPower, petCombatBonus} from '../../core/balance/index.js';
import {XIUXIAN_DEFAULTS, XIUXIAN_TERMS} from '../../core/constants/index.js';
import {enhanceItemsWithRefine} from '../../core/refine/index.js';
import {XiuxianRepository} from '../../core/repository/index.js';
import type {XiuxianCommand, XiuxianIdentity, XiuxianPlayer} from '../../core/types/index.js';
import {createdText, statusText} from './reply.js';

type PlayerEntryCommandContext = {
    identity: XiuxianIdentity;
    senderName?: string;
    now: number;
};

function asText(content: string): HandlerResponse {
    return {type: 'text', content};
}

export async function handlePlayerEntryCommand(
    repo: XiuxianRepository,
    cmd: XiuxianCommand,
    context: PlayerEntryCommandContext,
): Promise<HandlerResponse | null> {
    if (cmd.type !== 'create') return null;

    const existed = await repo.findPlayer(context.identity);
    if (existed) return asText(`🧍 你已经创建过角色：${existed.userName}`);

    const name = cmd.name?.trim() || context.senderName?.trim() || XIUXIAN_DEFAULTS.name;
    const player = await repo.createPlayer(context.identity, name, context.now);
    return asText(createdText(player));
}

export async function handlePlayerCommand(
    repo: XiuxianRepository,
    player: XiuxianPlayer,
    cmd: XiuxianCommand,
): Promise<HandlerResponse | null> {
    if (cmd.type !== 'status') return null;

    const equippedRaw = await repo.getEquippedItems(player);
    const equipped = await enhanceItemsWithRefine(repo, player.id, equippedRaw);
    const setBonus = calcSetBonusSummary(equipped);
    const pet = await repo.findPet(player.id);
    const petBonus = petCombatBonus(pet);
    const power = mergeCombatPower(calcCombatPower(player, equipped), petBonus);
    const inventoryCount = await repo.countInventory(player.id);
    const panel = statusText(player, power, equipped, inventoryCount, setBonus.lines);

    if (!pet) return asText(panel);

    return asText(
        `${panel}\n━━━━━━━━━━━━\n🐶 灵宠：${pet.petName}（${XIUXIAN_TERMS.pet.levelLabel}${pet.level}，亲密 ${pet.affection}/100）\n⚔️ 灵宠战斗加成：攻+${petBonus.attack} 防+${petBonus.defense} 血+${petBonus.maxHp}`,
    );
}