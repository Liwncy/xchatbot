import type {XiuxianCommand} from '../../core/types/index.js';
import {parsePositiveInt} from './common.js';

export function parsePetCommand(text: string): XiuxianCommand | null {
    if (text === '修仙领宠') return {type: 'petAdopt'};

    if (text === '修仙卡池') return {type: 'petPool'};

    const petDrawMatch = text.match(/^修仙抽宠(?:\s+(.+))?$/);
    if (petDrawMatch) {
        const arg = (petDrawMatch[1] ?? '').trim();
        if (!arg) return {type: 'petDraw', times: 1};
        if (arg === '十连') return {type: 'petDraw', times: 10};
        const n = parsePositiveInt(arg);
        return {type: 'petDraw', times: n};
    }

    if (text === '修仙保底') return {type: 'petPity'};

    const petStatusMatch = text.match(/^修仙宠物(?:\s+(\d+))?$/);
    if (petStatusMatch) return {type: 'petStatus', petId: parsePositiveInt(petStatusMatch[1])};

    const petBagMatch = text.match(/^修仙宠包(?:\s+(\d+))?$/);
    if (petBagMatch) return {type: 'petBag', page: parsePositiveInt(petBagMatch[1])};

    const petFeedMatch = text.match(/^修仙喂宠(?:\s+(\d+)(?:\s+(\d+))?)?$/);
    if (petFeedMatch) {
        return {
            type: 'petFeed',
            itemId: parsePositiveInt(petFeedMatch[1]),
            count: parsePositiveInt(petFeedMatch[2]),
        };
    }

    const petDeployMatch = text.match(/^修仙出宠(?:\s+(\d+))?$/);
    if (petDeployMatch) return {type: 'petDeploy', petId: parsePositiveInt(petDeployMatch[1])};

    if (text === '修仙休宠') return {type: 'petRest'};

    return null;
}