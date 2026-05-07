import type {HandlerResponse, IncomingMessage, ReplyMessage, TextReply} from '../../types/message.js';
import {buildWechatChatRecordAppReply} from '../../wechat/chat-record.js';
import type {PluginAdminCommand} from './plugin-admin-types.js';

const LONG_TEXT_MIN_LENGTH = 260;
const LONG_TEXT_MIN_LINES = 12;
const MAX_CHUNK_LENGTH = 320;
const MAX_CHUNK_LINES = 10;
const FORCE_CHAT_RECORD_ACTIONS = new Set<PluginAdminCommand['action']>(['help']);

export function finalizePluginAdminReply(
    message: IncomingMessage,
    command: PluginAdminCommand | null,
    response: HandlerResponse,
): HandlerResponse {
    if (!response) return response;
    if (Array.isArray(response)) {
        return response.map((reply) => maybeConvertPluginAdminReply(message, command, reply));
    }
    return maybeConvertPluginAdminReply(message, command, response);
}

function maybeConvertPluginAdminReply(
    message: IncomingMessage,
    command: PluginAdminCommand | null,
    reply: ReplyMessage,
): ReplyMessage {
    if (!shouldUseChatRecordReply(command, reply)) return reply;
    const content = normalizeText(reply.content);
    if (!content) return reply;

    const title = resolveRecordTitle(command, content);
    const chunks = splitIntoRecordChunks(content);

    try {
        return buildWechatChatRecordAppReply({
            title,
            summary: buildSummary(content),
            desc: chunks.length > 1 ? `${title}（共 ${chunks.length} 条）` : title,
            isChatRoom: message.source === 'group',
            items: chunks.map((chunk, index) => ({
                nickname: chunks.length > 1 ? `插件管理${index + 1}` : '插件管理',
                content: chunk,
                timestampMs: message.timestamp * 1000,
                localId: `${message.messageId}-plugin-admin-${index + 1}`,
                messageId: `${message.messageId}-plugin-admin-${index + 1}`,
            })),
        }, {
            to: reply.to,
            mentions: reply.mentions,
        });
    } catch {
        return reply;
    }
}

function shouldUseChatRecordReply(command: PluginAdminCommand | null, reply: ReplyMessage): reply is TextReply {
    if (reply.type !== 'text') return false;
    const content = normalizeText(reply.content);
    if (!content) return false;
    if (command && FORCE_CHAT_RECORD_ACTIONS.has(command.action)) return true;
    const lineCount = content.split('\n').length;
    return content.length >= LONG_TEXT_MIN_LENGTH || lineCount >= LONG_TEXT_MIN_LINES;
}

function normalizeText(content: string): string {
    return content.replace(/\r\n/g, '\n').trim();
}

function resolveRecordTitle(command: PluginAdminCommand | null, content: string): string {
    if (!command) {
        const firstLine = firstNonEmptyLine(content);
        if (!firstLine) return '插件管理消息';
        return firstLine.length > 24 ? `${firstLine.slice(0, 24)}…` : firstLine;
    }

    if (command.action === 'help') return '插件管理帮助';
    if (command.action === 'list') return '插件规则列表';
    if (command.action === 'search') return '插件规则搜索';
    if (command.action === 'detail') {
        const selector = command.stepSelector;
        if (selector?.view === 'steps-json') return '插件步骤JSON';
        if (selector?.view === 'rule-json') return '插件规则JSON';
        if (selector?.stepIndex || selector?.stepName) return '插件步骤详情';
        return '插件规则详情';
    }
    if (command.action === 'check') return '插件规则检查';
    if (command.action === 'preview-add') return '规则预览添加';
    if (command.action === 'add') return '插件规则新增';
    if (command.action === 'preview-update') return '规则预览修改';
    if (command.action === 'update') return '插件规则修改';
    if (command.action === 'delete') return command.confirmed ? '插件规则删除' : '规则预览删除';
    if (command.action === 'preview-copy') return '规则预览复制';
    if (command.action === 'copy') return '插件规则复制';
    if (command.action === 'preview-rename') return '规则预览重命名';
    if (command.action === 'rename') return '插件规则重命名';
    if (command.action === 'preview-rollback') return '规则预览回滚';
    if (command.action === 'rollback') return '插件规则回滚';
    if (command.action === 'refresh') return '插件规则刷新';

    const firstLine = firstNonEmptyLine(content);
    if (!firstLine) return '插件管理消息';
    return firstLine.length > 24 ? `${firstLine.slice(0, 24)}…` : firstLine;
}

function firstNonEmptyLine(content: string): string {
    return content.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
}

function buildSummary(content: string): string {
    const lines = content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 3);
    const summary = lines.join(' / ');
    return summary.length > 120 ? `${summary.slice(0, 120)}…` : summary;
}

function splitIntoRecordChunks(content: string): string[] {
    const blocks = content
        .split(/\n\s*\n/g)
        .map((block) => block.trim())
        .filter(Boolean);
    if (!blocks.length) return [content];

    const chunks: string[] = [];
    let current = '';

    const flushCurrent = (): void => {
        const trimmed = current.trim();
        if (trimmed) chunks.push(trimmed);
        current = '';
    };

    const appendBlock = (block: string): void => {
        const next = current ? `${current}\n\n${block}` : block;
        if (next.length > MAX_CHUNK_LENGTH || lineCountOf(next) > MAX_CHUNK_LINES) {
            flushCurrent();
            if (block.length > MAX_CHUNK_LENGTH || lineCountOf(block) > MAX_CHUNK_LINES) {
                splitLargeBlock(block).forEach((part) => chunks.push(part));
                return;
            }
        }
        current = current ? `${current}\n\n${block}` : block;
    };

    for (const block of blocks) {
        appendBlock(block);
    }
    flushCurrent();

    return chunks.length ? chunks : splitLargeBlock(content);
}

function splitLargeBlock(block: string): string[] {
    const lines = block.split('\n');
    const chunks: string[] = [];
    let current: string[] = [];

    const flush = (): void => {
        const text = current.join('\n').trim();
        if (text) chunks.push(text);
        current = [];
    };

    for (const line of lines) {
        const next = current.length ? [...current, line].join('\n') : line;
        if (next.length > MAX_CHUNK_LENGTH || current.length + 1 > MAX_CHUNK_LINES) {
            flush();
        }
        if (line.length > MAX_CHUNK_LENGTH) {
            flush();
            chunks.push(...sliceLongLine(line));
            continue;
        }
        current.push(line);
    }
    flush();

    return chunks.length ? chunks : [block.trim()];
}

function sliceLongLine(line: string): string[] {
    const result: string[] = [];
    let rest = line.trim();
    while (rest.length > MAX_CHUNK_LENGTH) {
        result.push(rest.slice(0, MAX_CHUNK_LENGTH));
        rest = rest.slice(MAX_CHUNK_LENGTH).trim();
    }
    if (rest) result.push(rest);
    return result;
}

function lineCountOf(content: string): number {
    return content.split('\n').length;
}


