import type {TextMessage} from '../../types.js';
import {buildHelpDetailReply, buildHelpListReply} from './list-reply.js';

const HELP_KEYWORDS = new Set([
    '帮助',
    'help',
    '插件',
    '插件帮助',
    '插件列表',
    '功能列表',
]);

function isHelpCommand(content: string): boolean {
    const normalized = content.trim().toLowerCase();
    return HELP_KEYWORDS.has(normalized) || normalized.startsWith('帮助 ') || normalized.startsWith('help ');
}

function parseHelpQuery(content: string): string {
    const normalized = content.trim();
    const lower = normalized.toLowerCase();
    if (lower.startsWith('帮助 ')) return normalized.slice(3).trim();
    if (lower.startsWith('help ')) return normalized.slice(5).trim();
    return '';
}

export const helpPlugin: TextMessage = {
    type: 'text',
    name: 'help-plugin',
    description: '查看插件列表和详情',
    match: (content) => isHelpCommand(content),
    handle: async (message, _env) => {
        const query = parseHelpQuery(message.content ?? '');
        if (!query) return buildHelpListReply(message);
        return buildHelpDetailReply(message, query);
    },
};
