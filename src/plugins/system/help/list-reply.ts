import type {IncomingMessage} from '../../../types/message.js';
import type {HandlerResponse} from '../../../types/reply.js';
import type {WechatChatRecordItem} from '../../../wechat/builders/chat-record.js';
import {buildWechatChatRecordAppReply} from '../../../wechat/builders/chat-record.js';
import {listRegisteredPlugins} from '../../registry.js';
import type {MessageEvent} from '../../types.js';
import {HELP_AVATAR_URL, HELP_LIST_RECORD_TITLE} from './constants.js';

const HELP_LIST_INTRO_NICKNAME = `🌟 ${HELP_LIST_RECORD_TITLE}`;

type HelpPluginCategory = 'system' | 'cognitive' | 'media' | 'toolkits' | 'scenarios' | 'rule-engine';

interface HelpPluginCategoryMeta {
    label: string;
    emoji: string;
}

const HELP_PLUGIN_CATEGORIES: HelpPluginCategory[] = [
    'system',
    'cognitive',
    'media',
    'toolkits',
    'scenarios',
    'rule-engine',
];

const HELP_PLUGIN_CATEGORY_META: Record<HelpPluginCategory, HelpPluginCategoryMeta> = {
    system: {label: '系统', emoji: '⚙️'},
    cognitive: {label: '智能', emoji: '🧠'},
    media: {label: '媒体', emoji: '🎬'},
    toolkits: {label: '工具', emoji: '🧰'},
    scenarios: {label: '场景', emoji: '🎮'},
    'rule-engine': {label: '规则', emoji: '📋'},
};

interface ListedPlugin {
    type: MessageEvent['type'];
    name: string;
    description: string;
    category: HelpPluginCategory;
}

function resolvePluginCategory(name: string): HelpPluginCategory {
    if (/^(help|contact-admin|plugin-admin)/.test(name)) return 'system';
    if (/(xiuxian|xuanxue)/.test(name)) return 'scenarios';
    if (/(-engine|common-plugins|dynamic-common)/.test(name)) return 'rule-engine';
    if (/(haokan|yinguo|video-link-parser)/.test(name)) return 'media';
    if (/(ai-dialog|ai-sing|agnes-|smart-draw|intent-image|image-intent|agent-bridge)/.test(name)) return 'cognitive';
    return 'toolkits';
}

function listPlugins(): ListedPlugin[] {
    return listRegisteredPlugins()
        .map((plugin) => ({
            type: plugin.type,
            name: plugin.name,
            description: plugin.description,
            category: resolvePluginCategory(plugin.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function formatCategoryRecordNickname(category: HelpPluginCategory, count: number): string {
    const meta = HELP_PLUGIN_CATEGORY_META[category];
    return `${meta.emoji}${meta.label}·${count}`;
}

function formatPluginLine(index: number, plugin: ListedPlugin): string {
    return `${index}. ${plugin.name} — ${plugin.description}`;
}

function buildIntroContent(total: number): string {
    return [
        `📦 共 ${total} 个插件`,
        '💡 发送「帮助 插件名」查看详情',
        '💡 示例：帮助 emoji-stash-trigger',
        '💡 也可用：help / 插件列表 / 功能列表',
    ].join('\n');
}

function buildCategoryContent(bucket: ListedPlugin[]): string {
    return bucket.map((plugin, index) => formatPluginLine(index + 1, plugin)).join('\n');
}

function buildCategorySummary(plugins: ListedPlugin[]): string {
    const counts = new Map<HelpPluginCategory, number>();
    for (const plugin of plugins) {
        counts.set(plugin.category, (counts.get(plugin.category) ?? 0) + 1);
    }

    return HELP_PLUGIN_CATEGORIES
        .filter((category) => counts.has(category))
        .map((category) => formatCategoryRecordNickname(category, counts.get(category) ?? 0))
        .join(' ');
}

function groupPluginsByCategory(plugins: ListedPlugin[]): Map<HelpPluginCategory, ListedPlugin[]> {
    const grouped = new Map<HelpPluginCategory, ListedPlugin[]>();
    for (const category of HELP_PLUGIN_CATEGORIES) {
        grouped.set(category, []);
    }

    for (const plugin of plugins) {
        const bucket = grouped.get(plugin.category) ?? grouped.get('toolkits')!;
        bucket.push(plugin);
    }

    return grouped;
}

function buildListItems(plugins: ListedPlugin[], baseTimestampMs: number): WechatChatRecordItem[] {
    const items: WechatChatRecordItem[] = [];
    let offsetMs = 0;

    items.push({
        nickname: HELP_LIST_INTRO_NICKNAME,
        avatarUrl: HELP_AVATAR_URL,
        content: buildIntroContent(plugins.length),
        timestampMs: baseTimestampMs + offsetMs,
    });
    offsetMs += 1000;

    const grouped = groupPluginsByCategory(plugins);
    for (const category of HELP_PLUGIN_CATEGORIES) {
        const bucket = grouped.get(category) ?? [];
        if (bucket.length === 0) continue;

        items.push({
            nickname: formatCategoryRecordNickname(category, bucket.length),
            avatarUrl: HELP_AVATAR_URL,
            content: buildCategoryContent(bucket),
            timestampMs: baseTimestampMs + offsetMs,
        });
        offsetMs += 1000;
    }

    return items;
}

function buildPluginDetailItems(plugin: ListedPlugin, baseTimestampMs: number): WechatChatRecordItem[] {
    const meta = HELP_PLUGIN_CATEGORY_META[plugin.category];
    return [
        {
            nickname: HELP_LIST_INTRO_NICKNAME,
            avatarUrl: HELP_AVATAR_URL,
            content: `🔎 插件详情：${plugin.name}`,
            timestampMs: baseTimestampMs,
        },
        {
            nickname: `${meta.emoji} ${plugin.name}`,
            avatarUrl: HELP_AVATAR_URL,
            content: [
                `📛 名称：${plugin.name}`,
                `🏷️ 类型：${plugin.type}`,
                `📂 分类：${meta.label}`,
                `💬 功能：${plugin.description}`,
                '',
                '发送「帮助」可返回完整列表。',
            ].join('\n'),
            timestampMs: baseTimestampMs + 1000,
        },
    ];
}

export function buildHelpListReply(message: IncomingMessage): HandlerResponse {
    const plugins = listPlugins();
    const baseTimestampMs = message.timestamp > 0 ? message.timestamp * 1000 : Date.now();
    const categorySummary = buildCategorySummary(plugins);

    return buildWechatChatRecordAppReply({
        title: HELP_LIST_RECORD_TITLE,
        summary: categorySummary || `${plugins.length} 个插件`,
        desc: `共 ${plugins.length} 个 · 发送「帮助 插件名」查看详情`,
        items: buildListItems(plugins, baseTimestampMs),
        isChatRoom: Boolean(message.room?.id),
    });
}

export function buildHelpDetailReply(message: IncomingMessage, query: string): HandlerResponse {
    const plugins = listPlugins();
    const target = query.trim().toLowerCase();
    const exact = plugins.find((plugin) => plugin.name.toLowerCase() === target);
    const fuzzy = plugins.find((plugin) => plugin.name.toLowerCase().includes(target));
    const matched = exact ?? fuzzy;

    if (!matched) {
        return {
            type: 'text',
            content: [
                `未找到插件：${query}`,
                '你可以先发送「帮助」查看完整插件列表。',
            ].join('\n'),
        };
    }

    const baseTimestampMs = message.timestamp > 0 ? message.timestamp * 1000 : Date.now();
    const meta = HELP_PLUGIN_CATEGORY_META[matched.category];

    return buildWechatChatRecordAppReply({
        title: `${matched.name} 插件详情`,
        summary: `${meta.emoji} ${matched.description}`,
        desc: `${matched.type} · ${meta.label}`,
        items: buildPluginDetailItems(matched, baseTimestampMs),
        isChatRoom: Boolean(message.room?.id),
    });
}
