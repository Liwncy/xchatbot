import type {HandlerResponse} from '../../../../../types/message.js';
import {XIUXIAN_PAGE_SIZE} from '../../core/constants/index.js';
import {enhanceItemsWithRefine} from '../../core/refine/index.js';
import {XiuxianRepository} from '../../core/repository/index.js';
import type {XiuxianBagQuery, XiuxianCommand, XiuxianPlayer} from '../../core/types/index.js';
import {bagText, equipText, unequipText} from './reply.js';

type InventoryCommandContext = {
    now: number;
};

function asText(content: string): HandlerResponse {
    return {type: 'text', content};
}

function resolveBagFilter(raw: string | undefined): {query?: XiuxianBagQuery; label?: string; error?: string} {
    if (!raw) return {};
    const parts = raw
        .trim()
        .split(/\s+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
    if (!parts.length) return {};

    const query: XiuxianBagQuery = {};
    const labels: string[] = [];

    for (const key of parts) {
        if (key === '武器' || key === '神兵' || key === 'weapon') {
            query.itemType = 'weapon';
            labels.push('神兵');
            continue;
        }
        if (key === '护甲' || key === 'armor') {
            query.itemType = 'armor';
            labels.push('护甲');
            continue;
        }
        if (key === '灵宝' || key === 'accessory') {
            query.itemType = 'accessory';
            labels.push('灵宝');
            continue;
        }
        if (key === '法器' || key === 'sutra') {
            query.itemType = 'sutra';
            labels.push('法器');
            continue;
        }

        if (key === '普通' || key === '白' || key === 'common') {
            query.quality = 'common';
            labels.push('普通(白)');
            continue;
        }
        if (key === '优秀' || key === '精良' || key === '绿' || key === 'uncommon') {
            query.quality = 'uncommon';
            labels.push('优秀(绿)');
            continue;
        }
        if (key === '稀有' || key === '蓝' || key === 'rare') {
            query.quality = 'rare';
            labels.push('稀有(蓝)');
            continue;
        }
        if (key === '史诗' || key === '紫' || key === 'epic') {
            query.quality = 'epic';
            labels.push('史诗(紫)');
            continue;
        }
        if (key === '传说' || key === '金' || key === 'legendary') {
            query.quality = 'legendary';
            labels.push('传说(金)');
            continue;
        }
        if (key === '神话' || key === '红' || key === 'mythic') {
            query.quality = 'mythic';
            labels.push('神话(红)');
            continue;
        }

        if (key === '评分降序' || key === '评分高' || key === 'scoredesc') {
            query.sort = 'score_desc';
            labels.push('评分降序');
            continue;
        }
        if (key === '评分升序' || key === '评分低' || key === 'scoreasc') {
            query.sort = 'score_asc';
            labels.push('评分升序');
            continue;
        }
        if (key === '最新' || key === '时间' || key === 'timedesc') {
            query.sort = 'id_desc';
            labels.push('时间倒序');
            continue;
        }

        return {error: '⚠️ 背包参数仅支持：神兵/护甲/灵宝/法器/普通(白)/优秀(绿)/稀有(蓝)/史诗(紫)/传说(金)/神话(红)/评分降序/评分升序/最新'};
    }

    return {query, label: labels.join(' + ')};
}

export async function handleInventoryCommand(
    repo: XiuxianRepository,
    player: XiuxianPlayer,
    cmd: XiuxianCommand,
    context?: InventoryCommandContext,
): Promise<HandlerResponse | null> {
    if (cmd.type === 'bag') {
        const page = Math.max(1, cmd.page ?? 1);
        const filter = resolveBagFilter(cmd.filter);
        if (filter.error) return asText(filter.error);
        const total = await repo.countInventory(player.id, filter.query);
        const itemsRaw = await repo.listInventory(player.id, page, XIUXIAN_PAGE_SIZE, filter.query);
        const items = await enhanceItemsWithRefine(repo, player.id, itemsRaw);
        return asText(bagText(items, page, total, XIUXIAN_PAGE_SIZE, filter.label));
    }

    if (!context) return null;

    if (cmd.type === 'equip') {
        const item = await repo.findItem(player.id, cmd.itemId);
        if (!item) return asText('🔎 未找到该装备编号，请先用「修仙背包」查看。');

        if (item.itemType === 'weapon') player.weaponItemId = item.id;
        if (item.itemType === 'armor') player.armorItemId = item.id;
        if (item.itemType === 'accessory') player.accessoryItemId = item.id;
        if (item.itemType === 'sutra') player.sutraItemId = item.id;
        await repo.updatePlayer(player, context.now);
        return asText(equipText(item));
    }

    if (cmd.type === 'unequip') {
        if (cmd.slot === 'weapon') player.weaponItemId = null;
        if (cmd.slot === 'armor') player.armorItemId = null;
        if (cmd.slot === 'accessory') player.accessoryItemId = null;
        if (cmd.slot === 'sutra') player.sutraItemId = null;
        await repo.updatePlayer(player, context.now);
        return asText(unequipText(cmd.slot));
    }

    if (cmd.type === 'lock' || cmd.type === 'unlock') {
        const targetIds = cmd.itemIds?.length ? cmd.itemIds : cmd.itemId ? [cmd.itemId] : [];
        if (!targetIds.length) {
            return asText(cmd.type === 'lock' ? '💡 用法：修仙上锁 [装备ID...]' : '💡 用法：修仙解锁 [装备ID...]');
        }

        const lockValue = cmd.type === 'lock' ? 1 : 0;
        let success = 0;
        let skippedMissing = 0;
        let skippedAlready = 0;

        for (const itemId of targetIds) {
            const item = await repo.findItem(player.id, itemId);
            if (!item) {
                skippedMissing += 1;
                continue;
            }
            if ((item.isLocked > 0 ? 1 : 0) === lockValue) {
                skippedAlready += 1;
                continue;
            }
            const changed = await repo.setItemLock(player.id, item.id, lockValue);
            if (changed) {
                success += 1;
            } else {
                skippedAlready += 1;
            }
        }

        if (success <= 0) {
            if (skippedMissing > 0 && skippedAlready <= 0) {
                return asText('🔎 未找到可操作的装备编号，请先用「修仙背包」查看。');
            }
            return asText(cmd.type === 'lock' ? '🔒 目标装备均已锁定。' : '🔓 目标装备均已解锁。');
        }

        const actionText = cmd.type === 'lock' ? '上锁' : '解锁';
        const skipped = skippedMissing + skippedAlready;
        return asText(
            [
                `✅ 批量${actionText}完成（成功 ${success} 件）`,
                ...(skipped > 0 ? [`⏭️ 跳过：${skipped} 件（状态未变化 ${skippedAlready}，不存在 ${skippedMissing}）`] : []),
            ].join('\n'),
        );
    }

    return null;
}