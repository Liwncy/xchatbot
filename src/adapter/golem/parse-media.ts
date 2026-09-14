import type {InboundMedia, MessageType} from '../../core/message.js';

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
    if (doubleMatch?.[1]?.trim()) return doubleMatch[1].trim();

    const singleQuoted = new RegExp(`${attr}\\s*=\\s*'([^']*)'`, 'i');
    const singleMatch = xml.match(singleQuoted);
    if (singleMatch?.[1]?.trim()) return singleMatch[1].trim();

    const tag = xml.match(new RegExp(`<${attr}>([\\s\\S]*?)</${attr}>`, 'i'));
    return tag?.[1]?.trim() || undefined;
}

function firstAttr(xml: string, attrs: string[]): string {
    for (const attr of attrs) {
        const value = pickXmlAttr(xml, attr);
        if (value) return value;
    }
    return '';
}

function decodeXmlUrl(value: string): string {
    return decodeHtmlEntities(value).replace(/&amp;/g, '&');
}

function looksLikeHttp(value: string): boolean {
    return /^https?:\/\//iu.test(value.trim());
}

function parseDuration(raw: string): number | undefined {
    if (!/^\d+$/u.test(raw)) return undefined;
    const n = Number(raw);
    return n > 0 ? n : undefined;
}

function locatorOf(raw: string): Pick<InboundMedia, 'url' | 'fileId'> {
    const value = decodeXmlUrl(raw).trim();
    if (!value) return {};
    if (looksLikeHttp(value)) return {url: value};
    return {fileId: value};
}

function extractEmojiXml(xml: string): string {
    const start = xml.toLowerCase().indexOf('<emoji');
    if (start < 0) return xml;
    const end = xml.indexOf('>', start);
    if (end < 0) return xml.slice(start);
    return xml.slice(start, end + 1);
}

function attachHttpThumb(media: InboundMedia, thumbRaw: string): void {
    const thumb = decodeXmlUrl(thumbRaw).trim();
    if (thumb && looksLikeHttp(thumb) && thumb !== media.url) {
        media.thumbUrl = thumb;
    }
}

export function wechatTypeToMessageType(type: number): MessageType {
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
        case 49:
            return 'link';
        default:
            return 'unknown';
    }
}

export function parseInboundMedia(type: MessageType, rawXml: string): InboundMedia | undefined {
    const xml = decodeHtmlEntities(rawXml).trim();
    if (!xml || type === 'text' || type === 'link' || type === 'unknown') return undefined;

    if (type === 'emoji') {
        const emojiXml = extractEmojiXml(xml);
        const url = firstAttr(emojiXml, ['cdnurl', 'encrypturl', 'externurl', 'thumburl', 'emoji_url']);
        const md5 = firstAttr(emojiXml, ['md5', 'androidmd5', 'externmd5', 's60v3md5', 's60v5md5']);
        if (!url && !md5) return undefined;
        return {
            ...locatorOf(url),
            ...(md5 ? {md5} : {}),
        };
    }

    if (type === 'image') {
        const locator = firstAttr(xml, ['cdnbigimgurl', 'cdnmidimgurl', 'cdnthumburl']);
        const aesKey = firstAttr(xml, ['aeskey']);
        if (!locator && !aesKey) return undefined;
        const media: InboundMedia = {
            ...locatorOf(locator),
            ...(aesKey ? {aesKey} : {}),
        };
        attachHttpThumb(media, firstAttr(xml, ['cdnthumburl']));
        return media.url || media.fileId || media.aesKey ? media : undefined;
    }

    if (type === 'video') {
        const locator = firstAttr(xml, ['cdnvideourl', 'cdndataurl', 'cdnurl']);
        const aesKey = firstAttr(xml, ['aeskey', 'cdnvideokey', 'cdndatakey', 'cdnvideosaeskey']);
        const duration = parseDuration(firstAttr(xml, ['playlength', 'duration']));
        if (!locator && !aesKey) return undefined;
        const media: InboundMedia = {
            ...locatorOf(locator),
            ...(aesKey ? {aesKey} : {}),
            ...(duration ? {duration} : {}),
        };
        attachHttpThumb(media, firstAttr(xml, ['cdnthumburl']));
        return media.url || media.fileId || media.aesKey ? media : undefined;
    }

    if (type === 'voice') {
        const locator = firstAttr(xml, ['voiceurl', 'voiceUrl']);
        const aesKey = firstAttr(xml, ['aeskey']);
        const duration = parseDuration(firstAttr(xml, ['voicelength', 'playlength', 'duration']));
        const format = firstAttr(xml, ['voiceformat']);
        if (!locator && !aesKey) return undefined;
        return {
            ...locatorOf(locator),
            ...(aesKey ? {aesKey} : {}),
            ...(duration ? {duration} : {}),
            ...(format ? {format} : {}),
        };
    }

    return undefined;
}

export function parseQuoteMedia(referType: number, referContent?: string): InboundMedia | undefined {
    if (!referContent?.trim()) return undefined;
    return parseInboundMedia(wechatTypeToMessageType(referType), referContent);
}
