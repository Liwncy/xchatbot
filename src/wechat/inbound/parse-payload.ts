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
    const newlineIndex = text.indexOf(':\n');
    const crlfIndex = text.indexOf(':\r\n');
    const separatorIndex = newlineIndex > 0 ? newlineIndex : crlfIndex;
    const separatorLength = newlineIndex > 0 ? 2 : 3;

    if (separatorIndex <= 0) {
        return {content: text};
    }

    const senderId = text.slice(0, separatorIndex).trim();
    const content = text.slice(separatorIndex + separatorLength);
    if (!senderId) {
        return {content: text};
    }

    return {senderId, content};
}

function resolveGroupMessageFrom(
    item: WechatPushItem,
    groupMeta: {senderId?: string},
): string {
    if (groupMeta.senderId?.trim()) return groupMeta.senderId.trim();
    const sender = item.sender?.value?.trim() ?? '';
    if (sender && !sender.endsWith('@chatroom')) return sender;
    return '';
}

/** 客户端解不出正文时的占位文案（常见于引用/新类型消息）。 */
const UNSUPPORTED_CONTENT_MARKERS = [
    '无法显示此消息，你目前使用的微信版本暂时不支持此类型的信息。',
    '无法显示此消息',
] as const;

function isUnsupportedClientContent(content: string): boolean {
    const text = content.trim();
    if (!text) return false;
    return UNSUPPORTED_CONTENT_MARKERS.some((marker) => text === marker || text.includes(marker));
}

/**
 * `push_content` 常见格式：`显示名 : 消息内容`。
 * 用于补全 senderName，并在正文不可用时回退取预览文案。
 */
function parsePushContentPreview(pushContent?: string): {senderName?: string; previewText?: string} {
    if (!pushContent) return {};

    const separatorIndex = pushContent.indexOf(' : ');
    if (separatorIndex > 0) {
        const name = pushContent.slice(0, separatorIndex).trim();
        const previewText = pushContent.slice(separatorIndex + 3).trim();
        return {
            ...(name ? {senderName: name} : {}),
            ...(previewText ? {previewText} : {}),
        };
    }

    const groupActionMatch = pushContent.match(/^(.+?)在群聊中发了/);
    if (groupActionMatch?.[1]) {
        const name = groupActionMatch[1].trim();
        if (name) return {senderName: name};
    }

    const trimmed = pushContent.trim();
    return trimmed ? {previewText: trimmed} : {};
}

function resolveTextContent(
    parsedContent: string,
    pushPreview?: {previewText?: string},
): string {
    if (!isUnsupportedClientContent(parsedContent)) {
        return parsedContent;
    }
    const fallback = pushPreview?.previewText?.trim();
    return fallback || parsedContent;
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

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function pickXmlAttr(xml: string, attr: string): string | undefined {
    const regex = new RegExp(`${attr}="([^"]+)"`, 'i');
    const match = xml.match(regex);
    return match?.[1]?.trim() || undefined;
}

function pickXmlAttrInt(xml: string, attr: string): number | undefined {
    const raw = pickXmlAttr(xml, attr);
    if (!raw) return undefined;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function buildImageMediaHint(mediaId?: string): IncomingMessage['mediaHint'] | undefined {
    const normalized = mediaId?.trim();
    if (!normalized) return undefined;
    return {
        mediaId: normalized,
        originalUrl: normalized,
    };
}

function buildEmojiMediaHint(
    emoji?: IncomingMessage['emoji'],
): IncomingMessage['mediaHint'] | undefined {
    if (!emoji) return undefined;
    const mediaHint: NonNullable<IncomingMessage['mediaHint']> = {};
    if (emoji.md5.trim()) mediaHint.md5 = emoji.md5.trim();
    if (emoji.cdnurl.trim()) mediaHint.emojiUrl = emoji.cdnurl.trim();
    return Object.keys(mediaHint).length > 0 ? mediaHint : undefined;
}

function parseWechatVoiceMediaHint(rawContent: string): IncomingMessage['mediaHint'] | undefined {
    const xml = rawContent.trim();
    if (!xml.includes('<voicemsg') && !xml.includes('<voice')) return undefined;

    const voiceUrl = decodeHtmlEntities(pickXmlAttr(xml, 'voiceurl') ?? '').trim();
    const duration =
        pickXmlAttrInt(xml, 'voicelength') ??
        pickXmlAttrInt(xml, 'playlength') ??
        pickXmlAttrInt(xml, 'duration');
    const format = pickXmlAttrInt(xml, 'voiceformat');

    const mediaHint: NonNullable<IncomingMessage['mediaHint']> = {};
    if (voiceUrl) {
        mediaHint.originalUrl = voiceUrl;
        mediaHint.mediaId = voiceUrl;
    }
    if (Number.isFinite(duration) && duration! > 0) mediaHint.duration = duration;
    if (Number.isFinite(format)) mediaHint.format = format;
    return Object.keys(mediaHint).length > 0 ? mediaHint : undefined;
}

function parseWechatVideoMediaHint(rawContent: string): IncomingMessage['mediaHint'] | undefined {
    const xml = rawContent.trim();
    if (!xml.includes('<videomsg') && !xml.includes('<video')) return undefined;

    const videoUrl = decodeHtmlEntities(
        pickXmlAttr(xml, 'cdnvideourl')
        || pickXmlAttr(xml, 'cdndataurl')
        || pickXmlAttr(xml, 'cdnurl')
        || '',
    ).trim();
    const thumbUrl = decodeHtmlEntities(pickXmlAttr(xml, 'cdnthumburl') ?? '').trim();
    const duration =
        pickXmlAttrInt(xml, 'playlength') ??
        pickXmlAttrInt(xml, 'duration');

    const mediaHint: NonNullable<IncomingMessage['mediaHint']> = {};
    if (videoUrl) {
        mediaHint.originalUrl = videoUrl;
        mediaHint.mediaId = videoUrl;
    }
    if (thumbUrl) mediaHint.thumbUrl = thumbUrl;
    if (Number.isFinite(duration) && duration! > 0) mediaHint.duration = duration;
    return Object.keys(mediaHint).length > 0 ? mediaHint : undefined;
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
    const pushPreview = parsePushContentPreview(item.push_content);
    const groupMeta = source === 'group'
        ? parseGroupTextSender(rawContent)
        : {content: rawContent};

    const base: Omit<IncomingMessage, 'type'> = {
        platform: 'wechat' as const,
        source,
        from: source === 'group' ? resolveGroupMessageFrom(item, groupMeta) : (item.sender?.value ?? ''),
        senderName: pushPreview.senderName,
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
            content: resolveTextContent(groupMeta.content, pushPreview),
        };
    }

    if (msgType === 'image') {
        const mediaId = parseWechatImageMediaId(item);
        return {
            ...base,
            type: 'image',
            ...(mediaId ? {mediaId} : {}),
            ...(buildImageMediaHint(mediaId) ? {mediaHint: buildImageMediaHint(mediaId)} : {}),
        };
    }

    if (msgType === 'emoji') {
        const emoji = parseWechatEmojiFromPushItem(item);
        const mediaHint = buildEmojiMediaHint(emoji ?? undefined);
        return {
            ...base,
            type: 'emoji',
            ...(emoji ? {emoji} : {}),
            ...(mediaHint ? {mediaHint} : {}),
        };
    }

    if (msgType === 'voice') {
        const mediaHint = parseWechatVoiceMediaHint(item.content?.value ?? '');
        return {
            ...base,
            type: 'voice',
            ...(mediaHint?.mediaId ? {mediaId: mediaHint.mediaId} : {}),
            ...(mediaHint ? {mediaHint} : {}),
        };
    }

    if (msgType === 'video') {
        const mediaHint = parseWechatVideoMediaHint(item.content?.value ?? '');
        return {
            ...base,
            type: 'video',
            ...(mediaHint?.mediaId ? {mediaId: mediaHint.mediaId} : {}),
            ...(mediaHint ? {mediaHint} : {}),
        };
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
                ...(parsedRefer.videoMeta ? {videoMeta: parsedRefer.videoMeta} : {}),
                ...(parsedRefer.voiceMeta ? {voiceMeta: parsedRefer.voiceMeta} : {}),
                ...(parsedRefer.emojiMeta ? {emojiMeta: parsedRefer.emojiMeta} : {}),
                ...(parsedRefer.mediaHint ? {mediaHint: parsedRefer.mediaHint} : {}),
                ...(parsedRefer.referMessageId ? {referMessageId: parsedRefer.referMessageId} : {}),
            };
        }
        return message;
    }

    return {
        ...base,
        type: 'text',
        content: resolveTextContent(
            source === 'group' ? groupMeta.content : (item.content?.value ?? ''),
            pushPreview,
        ),
    };
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

