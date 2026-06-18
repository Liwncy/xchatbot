import type {Env} from '../types/env.js';
import type {IncomingMessage} from '../types/message.js';
import type {ReplyMessage} from '../types/reply.js';
import type {ChatActorType, ChatInboundMsgType, ChatMsgType, ChatOutboundMsgType} from './types.js';

const MAX_CONTENT_TEXT_LENGTH = 4000;

export function isChatLogEnabled(env: Env): boolean {
    const raw = env.CHAT_LOG_ENABLE;
    if (typeof raw !== 'string') return true;
    const normalized = raw.trim().toLowerCase();
    return !['0', 'false', 'no', 'off', '关', '关闭'].includes(normalized);
}

function truncateText(value: string, maxLength = MAX_CONTENT_TEXT_LENGTH): string {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}...`;
}

export function formatSpeakerIdentity(senderId: string, senderName?: string): string {
    const id = senderId.trim();
    const name = senderName?.trim();
    if (id && name && name !== id) {
        return `${name}(${id})`;
    }
    if (id) return id;
    if (name) return name;
    return '未知成员';
}

function buildMemberPrefix(senderId: string, senderName?: string): string {
    return `群成员「${formatSpeakerIdentity(senderId, senderName)}」`;
}

function buildPrivateUserPrefix(senderId: string, senderName?: string): string {
    return `用户「${formatSpeakerIdentity(senderId, senderName)}」`;
}

export function buildInboundSpeakerLine(message: IncomingMessage, contentText: string): string {
    const senderId = message.from.trim();
    const senderName = message.senderName?.trim();
    if (message.room?.id?.trim()) {
        return `${buildMemberPrefix(senderId, senderName)}说：${contentText}`;
    }
    return `${buildPrivateUserPrefix(senderId, senderName)}说：${contentText}`;
}

function normalizeInboundActorType(message: IncomingMessage): ChatActorType {
    if (message.type === 'event') return 'system';
    return 'member';
}

function buildInboundPayload(message: IncomingMessage): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    if (message.mediaId?.trim()) payload.media_id = message.mediaId.trim();
    if (message.emoji) payload.emoji = message.emoji;
    if (message.location) payload.location = message.location;
    if (message.link) payload.link = message.link;
    if (message.quote) payload.quote = message.quote;
    if (message.event) payload.event = message.event;

    return payload;
}

export function normalizeInboundMessage(message: IncomingMessage): {
    msgType: ChatInboundMsgType;
    contentText: string;
    payloadJson: string;
    actorType: ChatActorType;
} {
    const msgType = message.type;
    let contentText = '';

    switch (msgType) {
        case 'text':
            contentText = truncateText((message.content ?? '').trim());
            break;
        case 'image':
            contentText = '[图片]';
            break;
        case 'emoji':
            contentText = '[表情]';
            break;
        case 'voice':
            contentText = '[语音]';
            break;
        case 'video':
            contentText = '[视频]';
            break;
        case 'location':
            contentText = truncateText(`[位置] ${message.location?.label?.trim() || ''}`.trim());
            break;
        case 'link':
            contentText = truncateText(message.link?.title?.trim() || message.link?.url?.trim() || '[链接]');
            break;
        case 'event':
            contentText = truncateText(`[事件] ${message.event?.type ?? 'unknown'}`);
            break;
        default:
            contentText = truncateText((message.content ?? '').trim());
            break;
    }

    return {
        msgType,
        contentText,
        payloadJson: JSON.stringify(buildInboundPayload(message)),
        actorType: normalizeInboundActorType(message),
    };
}

function buildOutboundPayload(reply: ReplyMessage): Record<string, unknown> {
    switch (reply.type) {
        case 'text':
            return reply.mentions?.length ? {mentions: reply.mentions} : {};
        case 'image':
            return {
                media_id: reply.mediaId,
                ...(reply.originalUrl ? {original_url: reply.originalUrl} : {}),
            };
        case 'voice':
            return {
                media_id: reply.mediaId,
                duration: reply.duration,
                format: reply.format,
                ...(reply.originalUrl ? {original_url: reply.originalUrl} : {}),
                ...(reply.fallbackText ? {fallback_text: reply.fallbackText} : {}),
            };
        case 'video':
            return {
                media_id: reply.mediaId,
                title: reply.title,
                description: reply.description,
                duration: reply.duration,
                ...(reply.originalUrl ? {original_url: reply.originalUrl} : {}),
            };
        case 'news':
            return {articles: reply.articles};
        case 'markdown':
            return {title: reply.title};
        case 'card':
            return {card: reply.cardContent};
        case 'app':
            return {app_type: reply.appType};
        case 'emoji':
            return {md5: reply.md5, emoji_url: reply.emojiUrl};
        default:
            return {};
    }
}

export function normalizeOutboundReply(reply: ReplyMessage): {
    msgType: ChatOutboundMsgType;
    contentText: string;
    payloadJson: string;
} {
    let contentText = '';

    switch (reply.type) {
        case 'text':
            contentText = truncateText(reply.content.trim());
            break;
        case 'markdown':
            contentText = truncateText(reply.content.trim());
            break;
        case 'image':
            contentText = '[图片]';
            break;
        case 'voice':
            contentText = truncateText(reply.fallbackText?.trim() || '[语音]');
            break;
        case 'video':
            contentText = truncateText(reply.title?.trim() || '[视频]');
            break;
        case 'news': {
            const first = reply.articles[0];
            contentText = truncateText(first?.title?.trim() || first?.url?.trim() || '[图文]');
            break;
        }
        case 'card':
            contentText = truncateText(`[名片] ${reply.cardContent.card_nickname}`.trim());
            break;
        case 'app':
            contentText = '[应用消息]';
            break;
        case 'emoji':
            contentText = '[表情]';
            break;
        default:
            contentText = '[未知回复]';
            break;
    }

    return {
        msgType: reply.type,
        contentText,
        payloadJson: JSON.stringify(buildOutboundPayload(reply)),
    };
}

export function createOutboundMessageId(): string {
    return `bot:${crypto.randomUUID()}`;
}

export function toAiDialogLine(record: {
    actorType: ChatActorType;
    direction: 'inbound' | 'outbound';
    senderId: string;
    senderName: string;
    contentText: string;
    sessionType: 'group' | 'private';
}): {role: 'user' | 'assistant'; content: string} | null {
    if (record.actorType === 'system') return null;

    if (record.direction === 'outbound' && record.actorType === 'bot') {
        return {role: 'assistant', content: record.contentText};
    }

    if (record.direction !== 'inbound' || record.actorType !== 'member') {
        return null;
    }

    const speakerPrefix = record.sessionType === 'group'
        ? buildMemberPrefix(record.senderId, record.senderName)
        : buildPrivateUserPrefix(record.senderId, record.senderName);

    if (record.contentText.startsWith('[') && !record.contentText.includes('说：')) {
        return {role: 'user', content: `${speakerPrefix}发了${record.contentText}`};
    }
    return {role: 'user', content: `${speakerPrefix}说：${record.contentText}`};
}

export function isAiContextMsgType(msgType: ChatMsgType): boolean {
    return msgType === 'text'
        || msgType === 'image'
        || msgType === 'emoji'
        || msgType === 'voice'
        || msgType === 'video'
        || msgType === 'location'
        || msgType === 'link'
        || msgType === 'markdown'
        || msgType === 'news';
}
