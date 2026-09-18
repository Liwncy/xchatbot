import type {IncomingMessage, MessageSource} from '../../core/message.js';
import {parseHongbaoMessage} from './parse-hongbao.js';
import {parseInboundMedia, wechatTypeToMessageType} from './parse-media.js';
import {resolveMentions} from './parse-mentions.js';
import {parseWechatReferMessage} from './parse-refer.js';
import type {WechatPushItem, WechatPushMessage} from './types.js';

export const MESSAGE_EXPIRE_SECONDS = 3 * 60;
export const GOLEM_PLATFORM = 'golem';

const SYSTEM_WXIDS = new Set([
    'weixin',
    'filehelper',
    'fmessage',
    'medianote',
    'floatbottle',
    'newsapp',
    'officialaccounts',
]);

function isSystemWxid(wxid: string): boolean {
    const id = wxid.trim();
    if (!id) return false;
    if (SYSTEM_WXIDS.has(id.toLowerCase())) return true;
    return id.startsWith('gh_');
}

function getItemSource(item: WechatPushItem): string {
    return item.source ?? item.msg_source ?? '';
}

function inferSource(item: WechatPushItem): MessageSource {
    const source = getItemSource(item).toLowerCase();
    const sender = item.sender?.value ?? '';
    const receiver = item.receiver?.value ?? '';
    if (source.includes('official') || isSystemWxid(sender)) return 'official';
    if (source.includes('chatroom') || sender.endsWith('@chatroom') || receiver.endsWith('@chatroom')) {
        return 'group';
    }
    return 'private';
}

function toUnixSeconds(timestamp: number): number {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return Math.floor(Date.now() / 1000);
    return timestamp > 1_000_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
}

function resolveRoomId(item: WechatPushItem): string {
    if (item.receiver?.value?.endsWith('@chatroom')) return item.receiver.value;
    if (item.sender?.value?.endsWith('@chatroom')) return item.sender.value;
    return item.receiver?.value ?? '';
}

function parseGroupTextSender(rawContent: string): {senderId?: string; content: string} {
    const text = rawContent ?? '';
    const newlineIndex = text.indexOf(':\n');
    const crlfIndex = text.indexOf(':\r\n');
    const separatorIndex = newlineIndex > 0 ? newlineIndex : crlfIndex;
    const separatorLength = newlineIndex > 0 ? 2 : 3;
    if (separatorIndex <= 0) return {content: text};
    const senderId = text.slice(0, separatorIndex).trim();
    const content = text.slice(separatorIndex + separatorLength);
    if (!senderId) return {content: text};
    return {senderId, content};
}

function resolveGroupFrom(item: WechatPushItem, groupMeta: {senderId?: string}): string {
    if (groupMeta.senderId?.trim()) return groupMeta.senderId.trim();
    const sender = item.sender?.value?.trim() ?? '';
    if (sender && !sender.endsWith('@chatroom')) return sender;
    return '';
}

function parsePushContentPreview(pushContent?: string): {senderName?: string; previewText?: string} {
    if (!pushContent) return {};
    const separators = [' : ', ': ', '：', ':'] as const;
    for (const separator of separators) {
        const separatorIndex = pushContent.indexOf(separator);
        if (separatorIndex <= 0) continue;
        const name = pushContent.slice(0, separatorIndex).trim();
        const previewText = pushContent.slice(separatorIndex + separator.length).trim();
        if (!name || name.includes('@chatroom') || /^wxid_/i.test(name)) continue;
        return {
            ...(name ? {senderName: name} : {}),
            ...(previewText ? {previewText} : {}),
        };
    }
    return {};
}

function parsePushItem(item: WechatPushItem, raw: unknown): IncomingMessage {
    const source = inferSource(item);
    const rawContent = item.content?.value ?? item.push_content ?? '';
    const pushPreview = parsePushContentPreview(item.push_content);
    const groupMeta = source === 'group' ? parseGroupTextSender(rawContent) : {content: rawContent};
    const msgType = wechatTypeToMessageType(item.type);

    const message: IncomingMessage = {
        platform: GOLEM_PLATFORM,
        type: msgType,
        source,
        from: source === 'group' ? resolveGroupFrom(item, groupMeta) : (item.sender?.value ?? ''),
        senderName: pushPreview.senderName,
        to: item.receiver?.value ?? '',
        timestamp: toUnixSeconds(item.create_time),
        messageId: String(item.id ?? item.msg_id ?? item.new_id ?? item.new_msg_id ?? item.create_time),
        raw,
    };

    if (source === 'group') {
        message.room = {id: resolveRoomId(item)};
    }
    if (rawContent.includes('<')) {
        message.rawXml = rawContent;
    }

    const body = source === 'group' ? groupMeta.content : rawContent;
    const mentions = resolveMentions(body, item.source, item.msg_source);
    if (mentions.length) message.mentions = mentions;

    if (msgType === 'link') {
        const hongbao = parseHongbaoMessage(body);
        if (hongbao) {
            message.type = 'hongbao';
            message.content = hongbao.title;
            message.hongbao = {nativeUrl: hongbao.nativeUrl};
            return message;
        }
        const parsedRefer = parseWechatReferMessage(body);
        if (parsedRefer) {
            message.content = parsedRefer.title.trim() || undefined;
            message.quote = parsedRefer;
            message.media = parsedRefer.media;
            return message;
        }
    }

    message.media = parseInboundMedia(msgType, body);
    message.content = body.trim()
        || pushPreview.previewText
        || undefined;
    if (message.media && (msgType === 'image' || msgType === 'emoji' || msgType === 'voice' || msgType === 'video')) {
        const preview = pushPreview.previewText?.trim();
        if (!preview || preview.includes('<') || preview.length > 80) {
            message.content = undefined;
        } else {
            message.content = preview;
        }
    }
    if (msgType === 'unknown') {
        message.type = 'text';
    }
    return message;
}

export function parseWechatMessages(payload: WechatPushMessage): IncomingMessage[] {
    const items = Array.isArray(payload.new_message) ? payload.new_message : [];
    if (items.length === 0) {
        throw new Error('No new_message in WeChat push payload');
    }
    return items.map((item) => parsePushItem(item, payload));
}

export function filterExpiredMessages(
    messages: IncomingMessage[],
    nowUnixSeconds = Math.floor(Date.now() / 1000),
): IncomingMessage[] {
    return messages.filter((message) => nowUnixSeconds - message.timestamp <= MESSAGE_EXPIRE_SECONDS);
}
