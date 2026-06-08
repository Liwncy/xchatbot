import {formatBeijingTime} from '../../core/utils/time.js';

export function npcEncounterText(params: {
    title: string;
    tier: string;
    reward: {spiritStone: number; exp: number; cultivation: number};
}): string {
    const tierLabel = params.tier === 'legend' ? '传说' : params.tier === 'epic' ? '稀有' : params.tier === 'rare' ? '奇异' : '普通';
    return [
        `🎲 今日奇遇：${params.title}`,
        '━━━━━━━━━━━━',
        `🏷️ 奇遇品质：${tierLabel}`,
        `💎 灵石 +${params.reward.spiritStone}`,
        `📈 经验 +${params.reward.exp}`,
        `✨ 修为 +${params.reward.cultivation}`,
    ].join('\n');
}

export function npcEncounterLogText(
    logs: Array<{id: number; dayKey: string; eventTitle: string; eventTier: string; createdAt: number}>,
    page: number,
    pageSize: number,
): string {
    if (!logs.length) return '📜 暂无奇遇记录，先发送「修仙奇遇」吧。';
    const lines = logs.map((it) => {
        const dt = formatBeijingTime(it.createdAt);
        return `#${it.id} ${it.eventTitle}（${it.eventTier}） | ${it.dayKey} | ${dt}`;
    });
    return [`📜 奇遇记录第 ${page} 页（每页 ${pageSize} 条）`, '━━━━━━━━━━━━', ...lines].join('\n');
}

export function bondRequestText(targetUserId: string): string {
    return `💌 你已向 ${targetUserId} 发起结缘请求，对方发送「修仙允缘」即可确认，或发送「修仙拒缘」拒绝。`;
}

export function pvpSparRequestText(targetName: string, expiresAt: number): string {
    return [
        `⚔️ 已向 ${targetName} 发起切磋邀请。`,
        '━━━━━━━━━━━━',
        '💡 对方发送「修仙应战」即可开打，发送「修仙拒战」可拒绝。',
        `⏰ 邀请截止：${formatBeijingTime(expiresAt)}`,
    ].join('\n');
}

export function pvpSparRejectText(requesterName: string): string {
    return `🛑 你已拒绝来自 ${requesterName} 的切磋邀请。`;
}

export function pvpBattleResultText(params: {
    mode: 'spar' | 'force';
    opponentName: string;
    win: boolean;
    rounds: number;
    exp: number;
    cultivation: number;
    lootStone?: number;
    shieldExpiresAt?: number;
    logs: string[];
}): string {
    return [
        `${params.mode === 'force' ? '☠️' : '⚔️'} ${params.mode === 'force' ? '强斗' : '切磋'}${params.win ? '胜利' : '失利'}：${params.opponentName}`,
        '━━━━━━━━━━━━',
        `🕒 回合数：${params.rounds}`,
        `📈 经验 +${params.exp}`,
        `✨ 修为 +${params.cultivation}`,
        ...(params.lootStone && params.lootStone > 0 ? [`💎 灵石掠夺 +${params.lootStone}`] : []),
        ...(params.shieldExpiresAt ? [`🛡️ 对方保护至：${formatBeijingTime(params.shieldExpiresAt)}`] : []),
        '━━━━━━━━━━━━',
        ...params.logs.slice(0, 6),
    ].join('\n');
}

export function bondActivatedText(targetName: string): string {
    return `💞 结缘成功！你与 ${targetName} 已缔结情缘。`;
}

export function bondBreakText(targetName: string): string {
    return `💔 你与 ${targetName} 已解除情缘。愿各自安好，仙路再会。`;
}

export function bondStatusText(params: {partnerName: string; status: 'pending' | 'active' | 'ended'; intimacy: number; level: number; canTravel: boolean}): string {
    return [
        `💗 情缘对象：${params.partnerName}`,
        '━━━━━━━━━━━━',
        `📌 关系状态：${params.status === 'active' ? '已结缘' : params.status === 'pending' ? '待确认' : '已解除'}`,
        `💞 亲密度：${params.intimacy}`,
        `💠 情缘等级：${params.level}`,
        `🌸 今日同游：${params.canTravel ? '可进行' : '已完成'}`,
    ].join('\n');
}

export function bondTravelText(params: {partnerName: string; gainedIntimacy: number; level: number; reward: {spiritStone: number; exp: number; cultivation: number}}): string {
    return [
        `🌸 今日与 ${params.partnerName} 同游完成`,
        '━━━━━━━━━━━━',
        `💞 亲密度 +${params.gainedIntimacy}`,
        `💠 当前情缘等级：${params.level}`,
        `💎 灵石 +${params.reward.spiritStone}`,
        `📈 经验 +${params.reward.exp}`,
        `✨ 修为 +${params.reward.cultivation}`,
    ].join('\n');
}

export function bondLogText(
    logs: Array<{id: number; action: string; deltaIntimacy: number; createdAt: number}>,
    page: number,
    pageSize: number,
): string {
    if (!logs.length) return '📖 暂无情缘记录，先发送「修仙结缘」吧。';
    const lines = logs.map((it) => {
        const dt = formatBeijingTime(it.createdAt);
        return `#${it.id} ${it.action} | 亲密+${it.deltaIntimacy} | ${dt}`;
    });
    return [`📖 情录第 ${page} 页（每页 ${pageSize} 条）`, '━━━━━━━━━━━━', ...lines].join('\n');
}