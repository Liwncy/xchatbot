import type {TextMessage} from '../types.js';
import {pluginManager} from '../manager.js';

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

function normalizeText(value: string): string {
    return value.trim().toLowerCase();
}

function parseHelpQuery(content: string): string {
    const normalized = content.trim();
    const lower = normalized.toLowerCase();
    if (lower.startsWith('帮助 ')) return normalized.slice(3).trim();
    if (lower.startsWith('help ')) return normalized.slice(5).trim();
    return '';
}

function listPlugins() {
    return pluginManager
        .getPlugins()
        .map((plugin) => ({
            type: plugin.type,
            name: plugin.name,
            description: plugin.description,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function buildHelpText(): string {
    const plugins = listPlugins();

    const lines = plugins.map((plugin, index) =>
        `${index + 1}. [${plugin.type}] ${plugin.name} - ${plugin.description}`,
    );

    return [
        `已注册插件：${plugins.length} 个`,
        '',
        ...lines,
        '',
        '可用指令示例：',
        '- 帮助 / help / 插件列表',
        '- 帮助 插件名（查看单个插件详情）',
        '- 小聪明儿 今天天气怎么样',
        '- 今日老婆',
    ].join('\n');
}

function buildPluginDetailText(query: string): string {
    const plugins = listPlugins();
    const target = normalizeText(query);
    const exact = plugins.find((plugin) => normalizeText(plugin.name) === target);
    const fuzzy = plugins.find((plugin) => normalizeText(plugin.name).includes(target));
    const matched = exact ?? fuzzy;

    if (!matched) {
        return [
            `未找到插件：${query}`,
            '你可以先发送「帮助」查看完整插件列表。',
        ].join('\n');
    }

    return [
        '插件详情：',
        `- 名称：${matched.name}`,
        `- 类型：${matched.type}`,
        `- 功能：${matched.description}`,
        '',
        '提示：发送「帮助」可查看全部插件。',
    ].join('\n');
}

export const helpPlugin: TextMessage = {
    type: 'text',
    name: 'help-plugin',
    description: '查看插件列表和详情',
    match: (content) => isHelpCommand(content),
    handle: async (message, _env) => ({
        type: 'text',
        content: (() => {
            const query = parseHelpQuery(message.content ?? '');
            if (!query) return buildHelpText();
            return buildPluginDetailText(query);
        })(),
    }),
};

