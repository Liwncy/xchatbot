import type {WechatInboundEmoji} from '../../types/message.js';
import type {WechatPushItem} from '../types.js';

function stripGroupPrefix(content: string): string {
    const match = content.match(/^[^:\n\r]{1,80}:\r?\n([\s\S]*)$/);
    if (match?.[1] != null) return match[1];
    return content;
}

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

function pickXmlAttr(xml: string, attr: string): string | undefined {
    const doubleQuoted = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, 'i');
    const doubleMatch = xml.match(doubleQuoted);
    if (doubleMatch?.[1] != null) {
        const value = doubleMatch[1].trim();
        return value || undefined;
    }

    const singleQuoted = new RegExp(`${attr}\\s*=\\s*'([^']*)'`, 'i');
    const singleMatch = xml.match(singleQuoted);
    if (singleMatch?.[1] != null) {
        const value = singleMatch[1].trim();
        return value || undefined;
    }

    return undefined;
}

function decodeXmlUrl(value: string): string {
    return decodeHtmlEntities(value).replace(/&amp;/g, '&');
}

function pickFirstAttr(xml: string, attrs: string[]): string {
    for (const attr of attrs) {
        const value = pickXmlAttr(xml, attr);
        if (value) return value;
    }
    return '';
}

/** 从微信 type 47 消息的 content XML 解析表情字段。 */
export function parseWechatEmojiFromContent(rawContent: string): WechatInboundEmoji | null {
    const xml = decodeHtmlEntities(stripGroupPrefix(rawContent)).trim();
    if (!xml.includes('<emoji')) return null;

    // 自定义表情常见 cdnurl；部分包只有 encrypturl / externurl / thumburl
    const cdnurlRaw = pickFirstAttr(xml, ['cdnurl', 'encrypturl', 'externurl', 'thumburl']);
    const md5 = pickFirstAttr(xml, ['md5', 'androidmd5', 'externmd5', 's60v3md5', 's60v5md5']);
    if (!cdnurlRaw && !md5) return null;

    const cdnurl = cdnurlRaw ? decodeXmlUrl(cdnurlRaw) : '';
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
