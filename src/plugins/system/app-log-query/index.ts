import type {TextMessage} from '../../types.js';
import type {IncomingMessage} from '../../../types/message.js';
import type {ReplyMessage, TextReply} from '../../../types/reply.js';
import {NO_PERMISSION_REPLY} from '../../../constants/messages.js';
import {queryAppLogs, type AppLogLevel, type AppLogQueryOptions, type AppLogRecord} from '../../../ops/app-log/index.js';
import {buildWechatChatRecordAppReply} from '../../../wechat/index.js';

const COMMAND_PREFIXES = ['查日志', '日志查询', 'applog'] as const;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const DETAIL_PREVIEW_LENGTH = 180;

function ensureOwner(messageFrom: string, ownerWxid?: string): string | null {
    const owner = ownerWxid?.trim();
    if (!owner) return '日志查询还没找到主人，暂时不能用';
    if (messageFrom.trim() !== owner) return NO_PERMISSION_REPLY;
    return null;
}

function stripCommandPrefix(content: string): string | null {
    const trimmed = content.trim();
    for (const prefix of COMMAND_PREFIXES) {
        if (trimmed === prefix) return '';
        if (trimmed.startsWith(`${prefix} `) || trimmed.startsWith(`${prefix}\n`)) {
            return trimmed.slice(prefix.length).trim();
        }
    }
    return null;
}

function parseLimit(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    if (!/^\d+$/u.test(raw)) return undefined;
    return Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(raw, 10)));
}

function parseLevel(raw: string | undefined): AppLogLevel | undefined {
    if (!raw) return undefined;
    const normalized = raw.trim().toUpperCase();
    if (normalized === 'WARN' || normalized === 'WARNING' || normalized === '警告') return 'WARN';
    if (normalized === 'ERROR' || normalized === 'ERR' || normalized === '错误') return 'ERROR';
    return undefined;
}

function buildHelpText(): string {
    return [
        '查日志用法：',
        '查日志',
        '查日志 error',
        '查日志 warn 20',
        '查日志 搜 超时',
        '查日志 搜 525 5',
        '',
        '默认最近 10 条，最多 50 条；仅主人可用。',
    ].join('\n');
}

function parseQuery(body: string): AppLogQueryOptions | {help: true} | {error: string} {
    if (!body || body === '帮助' || body === 'help' || body === '?') {
        return {help: true};
    }

    const tokens = body.split(/\s+/u).filter(Boolean);
    if (tokens[0] === '搜' || tokens[0] === 'search' || tokens[0] === '关键词') {
        const keyword = tokens[1];
        if (!keyword) return {error: '搜什么？补个关键词，比如：查日志 搜 超时'};
        const limit = parseLimit(tokens[2]) ?? DEFAULT_LIMIT;
        const level = parseLevel(tokens[3]);
        return {keyword, limit, level};
    }

    let level: AppLogLevel | undefined;
    let limit: number | undefined;
    for (const token of tokens) {
        const parsedLevel = parseLevel(token);
        if (parsedLevel) {
            level = parsedLevel;
            continue;
        }
        const parsedLimit = parseLimit(token);
        if (parsedLimit != null) {
            limit = parsedLimit;
            continue;
        }
        return {error: `没看懂「${token}」，发「查日志 帮助」看看用法`};
    }

    return {
        level,
        limit: limit ?? DEFAULT_LIMIT,
    };
}

function formatTime(createdAt: number): string {
    const ms = createdAt > 1_000_000_000_000 ? createdAt : createdAt * 1000;
    return new Date(ms).toLocaleString('zh-CN', {hour12: false});
}

function formatDetail(detailJson: string): string {
    const trimmed = detailJson.trim();
    if (!trimmed || trimmed === '[]' || trimmed === '{}') return '';
    const compact = trimmed.replace(/\s+/gu, ' ');
    if (compact.length <= DETAIL_PREVIEW_LENGTH) return compact;
    return `${compact.slice(0, DETAIL_PREVIEW_LENGTH)}...`;
}

function formatLogs(rows: AppLogRecord[], options: AppLogQueryOptions): string {
    if (!rows.length) {
        const parts = ['暂时没有日志'];
        if (options.level) parts.push(`级别 ${options.level}`);
        if (options.keyword) parts.push(`关键词「${options.keyword}」`);
        return `${parts.join('，')}。`;
    }

    const headerBits = [`最近 ${rows.length} 条`];
    if (options.level) headerBits.push(options.level);
    if (options.keyword) headerBits.push(`含「${options.keyword}」`);

    const lines = [headerBits.join(' · '), ''];
    for (const row of rows) {
        lines.push(`#${row.id} ${row.level} ${formatTime(row.createdAt)}`);
        lines.push(row.message || '(无文案)');
        const detail = formatDetail(row.detailJson);
        if (detail) lines.push(detail);
        lines.push('────');
    }
    if (lines[lines.length - 1] === '────') lines.pop();
    return lines.join('\n');
}

function formatLogItem(row: AppLogRecord): string {
    const lines = [
        `#${row.id} ${row.level} ${formatTime(row.createdAt)}`,
        row.message || '(无文案)',
    ];
    const detail = formatDetail(row.detailJson);
    if (detail) lines.push(detail);
    return lines.join('\n');
}

function buildLogChatRecordReply(
    message: IncomingMessage,
    rows: AppLogRecord[],
    options: AppLogQueryOptions,
): ReplyMessage {
    if (!rows.length) {
        const parts = ['暂时没有日志'];
        if (options.level) parts.push(`级别 ${options.level}`);
        if (options.keyword) parts.push(`关键词「${options.keyword}」`);
        const emptyText = `${parts.join('，')}。`;
        try {
            return buildWechatChatRecordAppReply({
                title: '运行日志',
                summary: emptyText,
                desc: '运行日志',
                isChatRoom: message.source === 'group',
                items: [{
                    nickname: '日志',
                    content: emptyText,
                    timestampMs: message.timestamp * 1000,
                    localId: `${message.messageId}-app-log-empty`,
                    messageId: `${message.messageId}-app-log-empty`,
                }],
            });
        } catch {
            return {type: 'text', content: emptyText};
        }
    }

    const headerBits = [`最近 ${rows.length} 条`];
    if (options.level) headerBits.push(options.level);
    if (options.keyword) headerBits.push(`含「${options.keyword}」`);
    const title = '运行日志';
    const summary = headerBits.join(' · ');

    try {
        return buildWechatChatRecordAppReply({
            title,
            summary,
            desc: `${title}（${rows.length} 条）`,
            isChatRoom: message.source === 'group',
            items: rows.map((row, index) => ({
                nickname: `${row.level}#${row.id}`,
                content: formatLogItem(row),
                timestampMs: (row.createdAt > 1_000_000_000_000 ? row.createdAt : row.createdAt * 1000),
                localId: `${message.messageId}-app-log-${index + 1}`,
                messageId: `${message.messageId}-app-log-${row.id}`,
            })),
        });
    } catch {
        return {type: 'text', content: formatLogs(rows, options)};
    }
}

export const appLogQueryPlugin: TextMessage = {
    type: 'text',
    name: 'app-log-query',
    description: '主人查询 D1 运行日志（WARN/ERROR）',
    match: (content) => stripCommandPrefix(content) !== null,
    handle: async (message, env) => {
        const body = stripCommandPrefix(message.content ?? '');
        if (body === null) return null;

        const ownerErr = ensureOwner(message.from, env.BOT_OWNER_WECHAT_ID);
        if (ownerErr) return {type: 'text', content: ownerErr} satisfies TextReply;

        const parsed = parseQuery(body);
        if ('help' in parsed) {
            return {type: 'text', content: buildHelpText()};
        }
        if ('error' in parsed) {
            return {type: 'text', content: parsed.error};
        }

        try {
            const rows = await queryAppLogs(env, parsed);
            return buildLogChatRecordReply(message, rows, parsed);
        } catch (error) {
            return {
                type: 'text',
                content: `日志查不出来：${error instanceof Error ? error.message : String(error)}`,
            };
        }
    },
};
