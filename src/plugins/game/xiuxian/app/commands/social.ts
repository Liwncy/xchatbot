import type {XiuxianCommand} from '../../core/types/index.js';

export function parseSocialCommand(text: string): XiuxianCommand | null {
    const sparMatch = text.match(/^修仙切磋(?:\s*(.+))?$/);
    if (sparMatch) return {type: 'spar', targetUserId: sparMatch[1]?.trim() || undefined};

    if (text === '修仙应战') return {type: 'sparAccept'};

    if (text === '修仙拒战') return {type: 'sparReject'};

    const forceFightMatch = text.match(/^修仙(?:强斗|强战|强制战斗)(?:\s*(.+))?$/);
    if (forceFightMatch) return {type: 'forceFight', targetUserId: forceFightMatch[1]?.trim() || undefined};

    if (text === '修仙奇遇') return {type: 'npcEncounter'};

    const encounterLogMatch = text.match(/^修仙奇录(?:\s+(\d+))?$/);
    if (encounterLogMatch) return {type: 'npcEncounterLog', page: Number(encounterLogMatch[1]) || undefined};

    const bondMatch = text.match(/^修仙结缘(?:\s*(.+))?$/);
    if (bondMatch) return {type: 'bond', targetUserId: bondMatch[1]?.trim() || undefined};

    if (text === '修仙允缘') return {type: 'bondAccept'};
    if (text === '修仙拒缘') return {type: 'bondReject'};
    if (text === '修仙解缘') return {type: 'bondBreak'};
    if (text === '修仙同游') return {type: 'bondTravel'};
    if (text === '修仙情缘') return {type: 'bondStatus'};

    const bondLogMatch = text.match(/^修仙情录(?:\s+(\d+))?$/);
    if (bondLogMatch) return {type: 'bondLog', page: Number(bondLogMatch[1]) || undefined};

    return null;
}