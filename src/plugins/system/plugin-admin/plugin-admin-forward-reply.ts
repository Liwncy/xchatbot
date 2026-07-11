import type {IncomingMessage} from '../../../types/message.js';
import type {HandlerResponse, ReplyMessage, TextReply} from '../../../types/reply.js';
import {DEFAULT_BOT_AVATAR_URL, getDefaultBotWechatName} from '../../../utils/bot.js';
import {splitTextForChatRecord} from '../../../utils/chat-record-chunks.js';
import {buildWechatChatRecordAppReply} from '../../../wechat';
import type {PluginAdminCommand} from './plugin-admin-types.js';

const LONG_TEXT_MIN_LENGTH = 260;
const LONG_TEXT_MIN_LINES = 12;
/** 插件管理详情常含长 jsonPath，单条放宽一些，少切几刀 */
const MAX_CHUNK_LENGTH = 1400;
const MAX_CHUNK_LINES = 40;

interface PluginAdminChatRecordPolicy {
    forceFold?: boolean;
    title?: string;
}

const PLUGIN_ADMIN_CHAT_RECORD_POLICY: Partial<Record<PluginAdminCommand['action'], PluginAdminChatRecordPolicy>> = {
    help: {forceFold: true, title: '插件管理帮助'},
    list: {title: '插件规则列表'},
    search: {title: '插件规则搜索'},
    check: {title: '插件规则检查'},
    add: {title: '插件规则新增'},
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
    const nickname = getDefaultBotWechatName();
    const chunks = splitTextForChatRecord(content, {
        maxLength: MAX_CHUNK_LENGTH,
        maxLines: MAX_CHUNK_LINES,
    });

    try {
        return buildWechatChatRecordAppReply({
            title,
            summary: buildSummary(content),
            desc: chunks.length > 1 ? `${title}（共 ${chunks.length} 条）` : title,
            isChatRoom: message.source === 'group',
            items: chunks.map((chunk, index) => ({
                nickname,
                avatarUrl: DEFAULT_BOT_AVATAR_URL,
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
        return resolveDetailChatRecordPolicy();
    }
    if (command.action === 'delete') {
        return {title: command.confirmed ? '插件规则删除' : '规则预览删除'};
    }
    return PLUGIN_ADMIN_CHAT_RECORD_POLICY[command.action] ?? {};
}

function resolveDetailChatRecordPolicy(): PluginAdminChatRecordPolicy {
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
