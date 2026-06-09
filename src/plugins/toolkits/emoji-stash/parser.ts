import type {IncomingMessage, WechatInboundEmoji} from '../../../types/message.js';
import {parseWechatEmojiFromPushItem} from '../../../wechat/inbound/parse-emoji.js';
import type {WechatPushItem, WechatPushMessage} from '../../../wechat/types.js';
import type {ParsedInboundEmoji} from './types.js';

function getFirstRawWechatItem(raw: unknown): WechatPushItem | null {
    const payload = raw as WechatPushMessage;
    const first = payload?.new_message?.[0];
    return first ?? null;
}

function toParsedInboundEmoji(emoji: WechatInboundEmoji): ParsedInboundEmoji {
    return {
        md5: emoji.md5,
        cdnurl: emoji.cdnurl,
        ...(emoji.size ? {size: emoji.size} : {}),
        ...(emoji.width ? {width: emoji.width} : {}),
        ...(emoji.height ? {height: emoji.height} : {}),
    };
}

/** 判断是否为微信表情消息（标准化 type 或原始 type 47）。 */
export function isWechatEmojiMessage(message: IncomingMessage): boolean {
    if (message.type === 'emoji') return true;
    const item = getFirstRawWechatItem(message.raw);
    return item?.type === 47;
}

/** 从 IncomingMessage 解析表情 md5 与 cdnurl。 */
export function parseInboundEmojiFromMessage(message: IncomingMessage): ParsedInboundEmoji | null {
    if (message.emoji?.md5 && message.emoji.cdnurl) {
        return toParsedInboundEmoji(message.emoji);
    }

    const item = getFirstRawWechatItem(message.raw);
    if (!item) return null;

    const parsed = parseWechatEmojiFromPushItem(item);
    return parsed ? toParsedInboundEmoji(parsed) : null;
}
