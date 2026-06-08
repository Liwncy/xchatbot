import type {XiuxianCommand} from '../../core/types/index.js';
import {parsePositiveInt, parseTowerRankArgs, parseTowerSeasonRankArgs} from './common.js';

export function parseCombatCommand(text: string): XiuxianCommand | null {
    if (text === '修仙挑战') return {type: 'challenge'};

    if (text === '修仙讨伐') return {type: 'bossRaid'};

    if (text === '修仙伐况') return {type: 'bossStatus'};

    const bossRankMatch = text.match(/^修仙伐榜(?:\s+(.+))?$/);
    if (bossRankMatch) {
        const arg = bossRankMatch[1]?.trim();
        if (!arg) return {type: 'bossRank'};
        if (arg === '我' || arg.toLowerCase() === 'me') return {type: 'bossRank', selfOnly: true};
        return {type: 'bossRank', limit: parsePositiveInt(arg)};
    }

    const bossLogMatch = text.match(/^修仙伐报(?:\s+(\d+))?$/);
    if (bossLogMatch) return {type: 'bossLog', page: parsePositiveInt(bossLogMatch[1])};

    const bossDetailMatch = text.match(/^修仙伐详\s+(\d+)$/);
    if (bossDetailMatch) return {type: 'bossDetail', logId: Number(bossDetailMatch[1])};

    const towerClimbMatch = text.match(/^修仙爬塔(?:\s+(.+))?$/);
    if (towerClimbMatch) {
        const arg = (towerClimbMatch[1] ?? '').trim();
        if (!arg) return {type: 'towerClimb'};
        if (arg === '最大' || arg.toLowerCase() === 'max') {
            return {type: 'towerClimb', times: Number.MAX_SAFE_INTEGER};
        }
        return {type: 'towerClimb', times: parsePositiveInt(arg)};
    }

    if (text === '修仙塔况') return {type: 'towerStatus'};

    const towerRankMatch = text.match(/^修仙塔榜(?:\s+(.+))?$/);
    if (towerRankMatch) {
        const arg = towerRankMatch[1]?.trim();
        const parsed = parseTowerRankArgs(arg);
        return {type: 'towerRank', ...parsed};
    }

    const towerLogMatch = text.match(/^修仙塔报(?:\s+(\d+))?$/);
    if (towerLogMatch) return {type: 'towerLog', page: parsePositiveInt(towerLogMatch[1])};

    const towerDetailMatch = text.match(/^修仙塔详\s+(\d+)$/);
    if (towerDetailMatch) return {type: 'towerDetail', logId: Number(towerDetailMatch[1])};

    if (text === '修仙季键') return {type: 'towerSeasonKey'};
    if (text === '修仙季况') return {type: 'towerSeasonStatus'};

    const towerSeasonRankMatch = text.match(/^修仙季榜(?:\s+(.+))?$/);
    if (towerSeasonRankMatch) {
        const arg = towerSeasonRankMatch[1]?.trim();
        const parsed = parseTowerSeasonRankArgs(arg);
        return {type: 'towerSeasonRank', ...parsed};
    }

    if (text === '修仙季奖') return {type: 'towerSeasonReward'};
    if (text === '修仙季领') return {type: 'towerSeasonClaim'};

    const battleLogMatch = text.match(/^修仙战报(?:\s+(\d+))?$/);
    if (battleLogMatch) return {type: 'battleLog', page: parsePositiveInt(battleLogMatch[1])};

    const battleDetailMatch = text.match(/^修仙战详\s+(\d+)$/);
    if (battleDetailMatch) return {type: 'battleDetail', battleId: Number(battleDetailMatch[1])};

    return null;
}