import type {
    IncomingMessage,
    MessageSource,
    MessageType,
} from '../../types/message.js';
import type {WechatPushItem, WechatPushMessage} from '../types.js';
import {parseWechatEmojiFromPushItem} from './parse-emoji.js';
import {parseWechatReferMessage} from './parse-refer-msg.js';

function getWechatItemSource(item: WechatPushItem): string {
    return item.source ?? item.msg_source ?? '';
}

function getWechatItemId(item: WechatPushItem): number | undefined {
    return item.id ?? item.msg_id;
}

function getWechatItemNewId(item: WechatPushItem): number | undefined {
    return item.new_id ?? item.new_msg_id;
}

/** 将微信数字消息类型映射为标准化类型。 */
function mapWechatType(type: number): MessageType {
    switch (type) {
        case 1:
            return 'text';
        case 3:
            return 'image';
        case 47:
            return 'emoji';
        case 34:
            return 'voice';
        case 43:
            return 'video';
        case 48:
            return 'location';
        case 49:
            return 'link';
        default:
            return 'text';
    }
}

/** 根据网关字段推断消息来源。 */
function inferWechatSource(payload: WechatPushItem): MessageSource {
    const source = getWechatItemSource(payload).toLowerCase();
    const sender = payload.sender?.value ?? '';
    const receiver = payload.receiver?.value ?? '';

    if (source.includes('official')) return 'official';
    if (
        source.includes('chatroom') ||
        sender.endsWith('@chatroom') ||
        receiver.endsWith('@chatroom')
    ) {
        return 'group';
    }

    return 'private';
}

/** 将毫秒时间戳转换为标准消息模型需要的秒级时间戳。 */
function toUnixSeconds(timestamp: number): number {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return Math.floor(Date.now() / 1000);
    return timestamp > 1_000_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
}

function resolveRoomId(item: WechatPushItem): string {
    if (item.receiver?.value?.endsWith('@chatroom')) return item.receiver.value;
    if (item.sender?.value?.endsWith('@chatroom')) return item.sender.value;
    return item.receiver?.value ?? '';
}

/**
 * 群文本常见格式：`wxid_xxx:\n消息内容`。
 * 解析后用于将标准化 `from` 还原为具体群成员 ID。
 */
function parseGroupTextSender(rawContent: string): { senderId?: string; content: string } {
    const text = rawContent ?? '';
    const separatorIndex = text.indexOf(':\n');
    if (separatorIndex <= 0) {
        return {content: text};
    }

    const senderId = text.slice(0, separatorIndex).trim();
    const content = text.slice(separatorIndex + 2);
    if (!senderId) {
        return {content: text};
    }

    return {senderId, content};
}

/**
 * `push_content` 常见格式：`显示名 : 消息内容`，用于补全 senderName。
 */
function parseSenderNameFromPushContent(pushContent?: string): string | undefined {
    if (!pushContent) return undefined;

    const separatorIndex = pushContent.indexOf(' : ');
    if (separatorIndex > 0) {
        const name = pushContent.slice(0, separatorIndex).trim();
        if (name) return name;
    }
    const groupActionMatch = pushContent.match(/^(.+?)在群聊中发了/);
    if (groupActionMatch?.[1]) {
        const name = groupActionMatch[1].trim();
        if (name) return name;
    }

    return undefined;
}

function parseWechatImageMediaId(item: WechatPushItem): string | undefined {
    const buffer = item.image_buffer?.data ?? item.image_buffer?.buffer;
    if (!buffer) return undefined;

    if (typeof buffer === 'string') {
        const normalized = buffer.trim();
        return normalized || undefined;
    }

    if (Array.isArray(buffer) && buffer.length > 0) {
        return buffer.join(',');
    }

    return undefined;
}

/**
 * 将单条微信推送项解析为标准化 IncomingMessage。
 */
export function parseWechatPushItem(
    item: WechatPushItem,
    raw: unknown,
): IncomingMessage {
    const msgType = mapWechatType(item.type);
    const source = inferWechatSource(item);
    const rawContent = item.content?.value ?? item.push_content ?? '';
    const groupMeta = source === 'group'
        ? parseGroupTextSender(rawContent)
        : {content: rawContent};

    const base: Omit<IncomingMessage, 'type'> = {
        platform: 'wechat' as const,
        source,
        from: source === 'group' ? (groupMeta.senderId ?? item.sender?.value ?? '') : (item.sender?.value ?? ''),
        senderName: parseSenderNameFromPushContent(item.push_content),
        to: item.receiver?.value ?? '',
        timestamp: toUnixSeconds(item.create_time),
        messageId: String(getWechatItemId(item) ?? getWechatItemNewId(item) ?? item.create_time),
        raw,
    };

    if (source === 'group') {
        base.room = {
            id: resolveRoomId(item),
        };
    }

    if (msgType === 'text') {
        return {
            ...base,
            type: 'text',
            content: groupMeta.content,
        };
    }

    if (msgType === 'image') {
        return {
            ...base,
            type: 'image',
            mediaId: parseWechatImageMediaId(item),
        };
    }

    if (msgType === 'emoji') {
        const emoji = parseWechatEmojiFromPushItem(item);
        return {
            ...base,
            type: 'emoji',
            ...(emoji ? {emoji} : {}),
        };
    }

    if (msgType === 'voice') {
        return {...base, type: 'voice'};
    }

    if (msgType === 'video') {
        return {...base, type: 'video'};
    }

    if (msgType === 'location') {
        return {
            ...base,
            type: 'location',
            location: {
                latitude: 0,
                longitude: 0,
            },
        };
    }

    if (msgType === 'link') {
        const rawContent = item.content?.value ?? '';
        const parsedRefer = parseWechatReferMessage(rawContent);
        const message: IncomingMessage = {
            ...base,
            type: 'link',
            link: {
                title: parsedRefer?.title ?? rawContent,
                description: '',
                url: '',
            },
        };
        if (parsedRefer) {
            message.quote = {
                title: parsedRefer.title,
                referType: parsedRefer.referType,
                referContent: parsedRefer.referContent,
                ...(parsedRefer.referFrom ? {referFrom: parsedRefer.referFrom} : {}),
                ...(parsedRefer.referSenderName ? {referSenderName: parsedRefer.referSenderName} : {}),
                ...(parsedRefer.imageMeta ? {imageMeta: parsedRefer.imageMeta} : {}),
                ...(parsedRefer.emojiMeta ? {emojiMeta: parsedRefer.emojiMeta} : {}),
            };
        }
        return message;
    }

    return {...base, type: 'text', content: item.content?.value ?? item.push_content ?? ''};
}

function getWechatPushItems(payload: WechatPushMessage): WechatPushItem[] {
    if (Array.isArray(payload.new_message)) return payload.new_message;
    return [];
}

export function parseWechatMessage(payload: WechatPushMessage): IncomingMessage {
    const item = getWechatPushItems(payload)[0];
    if (!item) {
        throw new Error('No new_message in WeChat push payload');
    }

    return parseWechatPushItem(item, payload);
}

/**
 * 将微信推送消息解析为标准化消息数组。
 */
export function parseWechatMessages(payload: WechatPushMessage): IncomingMessage[] {
    const items = getWechatPushItems(payload);
    if (items.length === 0) {
        throw new Error('No new_message in WeChat push payload');
    }

    return items.map((item) => parseWechatPushItem(item, payload));
}

