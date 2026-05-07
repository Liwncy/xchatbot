import type {HandlerResponse, IncomingMessage, ReplyMessage, TextReply} from '../../types/message.js';
import {buildWechatChatRecordAppReply} from '../../wechat/index.js';
import type {PluginAdminCommand} from './plugin-admin-types.js';

const LONG_TEXT_MIN_LENGTH = 260;
const LONG_TEXT_MIN_LINES = 12;
const MAX_CHUNK_LENGTH = 800;
const MAX_CHUNK_LINES = 18;

interface PluginAdminChatRecordPolicy {
    forceFold?: boolean;
    title?: string;
}

const PLUGIN_ADMIN_CHAT_RECORD_POLICY: Partial<Record<PluginAdminCommand['action'], PluginAdminChatRecordPolicy>> = {
    help: {forceFold: true, title: '插件管理帮助'},
    list: {title: '插件规则列表'},
    search: {title: '插件规则搜索'},
    check: {title: '插件规则检查'},
    'preview-add': {title: '规则预览添加'},
    add: {title: '插件规则新增'},
    'preview-update': {title: '规则预览修改'},
    update: {title: '插件规则修改'},
    'preview-copy': {title: '规则预览复制'},
    copy: {title: '插件规则复制'},
    'preview-rename': {title: '规则预览重命名'},
    rename: {title: '插件规则重命名'},
    'preview-rollback': {title: '规则预览回滚'},
    rollback: {title: '插件规则回滚'},
    refresh: {title: '插件规则刷新'},
};

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
    const policy = resolveChatRecordPolicy(command);
    if (policy.forceFold) return true;
    const lineCount = content.split('\n').length;
    return content.length >= LONG_TEXT_MIN_LENGTH || lineCount >= LONG_TEXT_MIN_LINES;
}

function normalizeText(content: string): string {
    return content.replace(/\r\n/g, '\n').trim();
}

function resolveRecordTitle(command: PluginAdminCommand | null, content: string): string {
    const policy = resolveChatRecordPolicy(command);
    if (policy.title) return policy.title;

    const firstLine = firstNonEmptyLine(content);
    if (!firstLine) return '插件管理消息';
    return firstLine.length > 24 ? `${firstLine.slice(0, 24)}…` : firstLine;
}

function resolveChatRecordPolicy(command: PluginAdminCommand | null): PluginAdminChatRecordPolicy {
    if (!command) return {};
    if (command.action === 'detail') {
        return resolveDetailChatRecordPolicy(command);
    }
    if (command.action === 'delete') {
        return {title: command.confirmed ? '插件规则删除' : '规则预览删除'};
    }
    return PLUGIN_ADMIN_CHAT_RECORD_POLICY[command.action] ?? {};
}

function resolveDetailChatRecordPolicy(command: Extract<PluginAdminCommand, {action: 'detail'}>): PluginAdminChatRecordPolicy {
    const selector = command.stepSelector;
    if (selector?.view === 'steps-json') return {forceFold: true, title: '插件步骤JSON'};
    if (selector?.view === 'rule-json') return {forceFold: true, title: '插件规则JSON'};
    if (selector?.stepIndex || selector?.stepName) return {forceFold: true, title: '插件步骤详情'};
    return {forceFold: true, title: '插件规则详情'};
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
        const sliceIndex = resolveLongLineSliceIndex(rest, MAX_CHUNK_LENGTH);
        result.push(rest.slice(0, sliceIndex).trim());
        rest = rest.slice(sliceIndex).trim();
    }
    if (rest) result.push(rest);
    return result;
}

function resolveLongLineSliceIndex(text: string, maxLength: number): number {
    const preferredBreakChars = [' ', '，', '。', '；', '：', ',', '.', ';', ':', '）', ')', ']', '】', '}', '、'];
    for (let index = maxLength; index >= Math.floor(maxLength * 0.6); index -= 1) {
        if (preferredBreakChars.includes(text[index] ?? '')) {
            return index + 1;
        }
    }
    return maxLength;
}

function lineCountOf(content: string): number {
    return content.split('\n').length;
}


