import type {WechatInboundEmoji} from '../../types/message.js';
import type {WechatPushItem} from '../types.js';

function stripGroupPrefix(content: string): string {
    const separatorIndex = content.indexOf(':\n');
    if (separatorIndex <= 0) return content;
    return content.slice(separatorIndex + 2);
}

function pickXmlAttr(xml: string, attr: string): string | undefined {
    const regex = new RegExp(`${attr}="([^"]+)"`, 'i');
    const match = xml.match(regex);
    return match?.[1]?.trim() || undefined;
}

function decodeXmlUrl(value: string): string {
    return value.replace(/&amp;/g, '&');
}

/** 从微信 type 47 消息的 content XML 解析表情字段。 */
export function parseWechatEmojiFromContent(rawContent: string): WechatInboundEmoji | null {
    const xml = stripGroupPrefix(rawContent).trim();
    if (!xml.includes('<emoji')) return null;

    const md5 = pickXmlAttr(xml, 'md5');
    const cdnurlRaw = pickXmlAttr(xml, 'cdnurl');
    if (!md5 || !cdnurlRaw) return null;

    const cdnurl = decodeXmlUrl(cdnurlRaw);
    const len = Number.parseInt(pickXmlAttr(xml, 'len') ?? '', 10);
    const width = Number.parseInt(pickXmlAttr(xml, 'width') ?? '', 10);
    const height = Number.parseInt(pickXmlAttr(xml, 'height') ?? '', 10);

    return {
        md5,
        cdnurl,
        ...(Number.isFinite(len) && len > 0 ? {size: len} : {}),
        ...(Number.isFinite(width) && width > 0 ? {width} : {}),
        ...(Number.isFinite(height) && height > 0 ? {height} : {}),
    };
}

/** 从微信推送条目解析表情（type 47）。 */
export function parseWechatEmojiFromPushItem(item: WechatPushItem): WechatInboundEmoji | null {
    if (item.type !== 47) return null;
    return parseWechatEmojiFromContent(item.content?.value ?? '');
}
