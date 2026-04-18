import type {XiuxianCommand} from '../../core/types/index.js';

export function parsePlayerCommand(text: string): XiuxianCommand | null {
    const createMatch = text.match(/^修仙创建(?:\s+(.+))?$/);
    if (createMatch) return {type: 'create', name: createMatch[1]?.trim() || undefined};

    if (text === '修仙状态') return {type: 'status'};

    const helpMatch = text.match(/^修仙帮助(?:\s+(.+))?$/);
    if (helpMatch) return {type: 'help', topic: helpMatch[1]?.trim() || undefined};
    if (text === '修仙指令' || text === '修仙菜单') return {type: 'help'};

    return null;
}