import type {XiuxianCommand} from '../../core/types/index.js';
import {parsePositiveInt} from './common.js';

export function parseGrowthCommand(text: string): XiuxianCommand | null {
    const cultivateMatch = text.match(/^修仙修炼(?:\s+(\d+))?$/);
    if (cultivateMatch) return {type: 'cultivate', times: parsePositiveInt(cultivateMatch[1])};

    if (text === '修仙探索') return {type: 'explore'};

    if (text === '修仙签到') return {type: 'checkin'};

    if (text === '修仙任务 可领') return {type: 'task', onlyClaimable: true};
    if (text === '修仙任务') return {type: 'task'};

    const claimMatch = text.match(/^修仙领奖(?:\s+(.+))?$/);
    if (claimMatch) {
        const arg = claimMatch[1]?.trim();
        if (!arg) return {type: 'claim'};
        if (arg === '全部') return {type: 'claim', claimAll: true};
        return {type: 'claim', taskId: parsePositiveInt(arg)};
    }

    if (text === '修仙成就') return {type: 'achievement'};

    if (text === '修仙占卜') return {type: 'fortune'};
    if (text === '修仙运势') return {type: 'fortuneStatus'};
    if (text === '修仙改运') return {type: 'fortuneReroll'};

    return null;
}