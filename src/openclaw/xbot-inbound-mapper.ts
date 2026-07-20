import type {IncomingMessage} from '../types/message.js';
import type {Env} from '../types/env.js';
import {resolveXbotChannelClientId} from './xbot-channel-config.js';

export interface XbotInboundPayload {
    accountId: string;
    clientId: string;
    connId: string;
    messageId: string;
    source: 'private' | 'group';
    from: string;
    senderName?: string;
    conversationId: string;
    roomId?: string;
    type: string;
    content?: string;
    timestamp: number;
    mentions?: string[];
    botMentioned?: boolean;
    wechatApiBaseUrl?: string;
    xchatbotApiBaseUrl?: string;
    xchatbotAdminToken?: string;
}

function describeQuotedType(referType?: number): string {
    switch (referType) {
        case 1:
            return 'text';
        case 3:
            return 'image';
        case 34:
            return 'voice';
        case 43:
            return 'video';
        case 47:
            return 'emoji';
        case 48:
            return 'location';
        case 49:
            return 'link';
        default:
            return 'unknown';
    }
}

function formatQuotedSender(message: IncomingMessage): string {
    const quote = message.quote;
    if (!quote) return '';
    const senderId = quote.referFrom?.trim() ?? '';
    const senderName = quote.referSenderName?.trim() ?? '';
    if (senderName && senderId && senderName !== senderId) {
        return `${senderName}(${senderId})`;
    }
    return senderName || senderId || '未知发送者';
}

function buildQuotedExtraLines(message: IncomingMessage): string[] {
    const quote = message.quote;
    if (!quote) return [];

    const lines: string[] = [];
    const mediaHint = quote.mediaHint;

    if (mediaHint?.title?.trim() && mediaHint.title.trim() !== quote.title.trim()) {
        lines.push(`标题: ${mediaHint.title.trim()}`);
    }
    if (mediaHint?.description?.trim()) {
        lines.push(`描述: ${mediaHint.description.trim()}`);
    }
    if (mediaHint?.url?.trim()) {
        lines.push(`链接: ${mediaHint.url.trim()}`);
    }
    if (mediaHint?.originalUrl?.trim()) {
        lines.push(`原地址: ${mediaHint.originalUrl.trim()}`);
    }
    if (mediaHint?.emojiUrl?.trim()) {
        lines.push(`表情地址: ${mediaHint.emojiUrl.trim()}`);
    }
    if (mediaHint?.thumbUrl?.trim()) {
        lines.push(`缩略图: ${mediaHint.thumbUrl.trim()}`);
    }
    if (mediaHint?.md5?.trim()) {
        lines.push(`MD5: ${mediaHint.md5.trim()}`);
    }
    if (mediaHint?.mediaId?.trim()) {
        lines.push(`媒体ID: ${mediaHint.mediaId.trim()}`);
    }
    if (typeof mediaHint?.duration === 'number' && Number.isFinite(mediaHint.duration) && mediaHint.duration > 0) {
        lines.push(`时长: ${mediaHint.duration}`);
    }
    if (typeof mediaHint?.format === 'number' && Number.isFinite(mediaHint.format)) {
        lines.push(`格式: ${mediaHint.format}`);
    }

    if (quote.emojiMeta?.cdnurl?.trim() && !lines.some((line) => line.startsWith('表情地址: '))) {
        lines.push(`表情地址: ${quote.emojiMeta.cdnurl.trim()}`);
    }
    if (quote.emojiMeta?.md5?.trim() && !lines.some((line) => line.startsWith('MD5: '))) {
        lines.push(`MD5: ${quote.emojiMeta.md5.trim()}`);
    }
    if (quote.imageMeta?.fileId?.trim()) {
        lines.push(`图片文件: ${quote.imageMeta.fileId.trim()}`);
    }
    if (quote.videoMeta?.fileId?.trim()) {
        lines.push(`视频文件: ${quote.videoMeta.fileId.trim()}`);
    }
    if (quote.videoMeta?.thumbFileId?.trim()) {
        lines.push(`视频封面: ${quote.videoMeta.thumbFileId.trim()}`);
    }
    if (typeof quote.videoMeta?.duration === 'number' && Number.isFinite(quote.videoMeta.duration) && quote.videoMeta.duration > 0) {
        lines.push(`视频时长: ${quote.videoMeta.duration}`);
    }
    if (quote.voiceMeta?.voiceUrl?.trim()) {
        lines.push(`语音地址: ${quote.voiceMeta.voiceUrl.trim()}`);
    }
    if (typeof quote.voiceMeta?.duration === 'number' && Number.isFinite(quote.voiceMeta.duration) && quote.voiceMeta.duration > 0) {
        lines.push(`语音时长: ${quote.voiceMeta.duration}`);
    }
    if (typeof quote.voiceMeta?.format === 'number' && Number.isFinite(quote.voiceMeta.format)) {
        lines.push(`语音格式: ${quote.voiceMeta.format}`);
    }
    if (quote.referMessageId?.newIdText?.trim()) {
        lines.push(`消息ID: ${quote.referMessageId.newIdText.trim()}`);
    }

    return lines;
}

function buildOpenClawContent(message: IncomingMessage): string {
    const content = message.content?.trim() ?? '';
    const quote = message.quote;
    if (!quote) return content;

    const lines = [
        '[引用消息]',
        `发送者: ${formatQuotedSender(message)}`,
        `类型: ${describeQuotedType(quote.referType)}`,
        `内容: ${quote.referContent?.trim() || '[空消息]'}`,
        ...buildQuotedExtraLines(message),
        '[/引用消息]',
    ];
    if (content) {
        lines.push('', '[用户消息]', content, '[/用户消息]');
    }
    return lines.join('\n');
}

function detectBotMention(content: string, env: Env): {mentions: string[]; botMentioned: boolean} {
    const mentions: string[] = [];
    let botMentioned = false;
    const botWechatId = env.BOT_WECHAT_ID?.trim() ?? '';
    const botName = env.BOT_WECHAT_NAME?.trim() || '小聪明儿';

    if (botWechatId) {
        if (content.includes(botWechatId)) {
            mentions.push(botWechatId);
            botMentioned = true;
        }
        if (content.includes(`@${botWechatId}`)) {
            botMentioned = true;
        }
    }
    if (botName) {
        if (content.includes(botName)) {
            botMentioned = true;
        }
        if (content.includes(`@${botName}`)) {
            botMentioned = true;
        }
    }
    return {mentions, botMentioned};
}

export function mapIncomingMessageToXbotInbound(
    message: IncomingMessage,
    env: Env,
    options?: {wechatApiBaseUrl?: string; xchatbotApiBaseUrl?: string; xchatbotAdminToken?: string},
): XbotInboundPayload {
    const clientId = resolveXbotChannelClientId(env);
    const content = buildOpenClawContent(message);
    const {mentions, botMentioned} = detectBotMention(content, env);
    const isGroup = message.source === 'group';
    const roomId = message.room?.id?.trim();
    const conversationId = isGroup ? (roomId ?? '') : message.from.trim();

    return {
        accountId: 'Primary',
        clientId,
        connId: clientId,
        messageId: message.messageId,
        source: isGroup ? 'group' : 'private',
        from: message.from,
        ...(message.senderName?.trim() ? {senderName: message.senderName.trim()} : {}),
        conversationId,
        ...(roomId ? {roomId} : {}),
        type: message.type,
        ...(content ? {content} : {}),
        timestamp: message.timestamp > 1_000_000_000_000
            ? message.timestamp
            : message.timestamp * 1000,
        mentions,
        botMentioned,
        ...(options?.wechatApiBaseUrl?.trim()
            ? {wechatApiBaseUrl: options.wechatApiBaseUrl.trim()}
            : {}),
        ...(options?.xchatbotApiBaseUrl?.trim()
            ? {xchatbotApiBaseUrl: options.xchatbotApiBaseUrl.trim()}
            : {}),
        ...(options?.xchatbotAdminToken?.trim()
            ? {xchatbotAdminToken: options.xchatbotAdminToken.trim()}
            : {}),
    };
}
