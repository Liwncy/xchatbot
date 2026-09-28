import type {InboundAppMessage, InboundArticle} from '../../core/message.js';
import {decodeXmlDeep} from './parse-media.js';

function stripGroupPrefix(content: string): string {
    const lf = content.indexOf(':\n');
    const crlf = content.indexOf(':\r\n');
    const index = lf > 0 ? lf : crlf;
    if (index <= 0) return content;
    return content.slice(index + (lf > 0 ? 2 : 3));
}

function unwrap(value?: string): string | undefined {
    if (!value) return undefined;
    const decoded = decodeXmlDeep(value)
        .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/iu, '$1')
        .trim();
    return decoded || undefined;
}

function pickTag(xml: string, tags: string[]): string | undefined {
    for (const tag of tags) {
        const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'iu'));
        const value = unwrap(match?.[1]);
        if (value) return value;
    }
    return undefined;
}

function httpUrl(value?: string): string | undefined {
    const normalized = value?.replace(/&amp;/giu, '&').trim();
    return normalized && /^https?:\/\//iu.test(normalized) ? normalized : undefined;
}

function articleOf(xml: string): InboundArticle | null {
    const title = pickTag(xml, ['title']);
    const url = httpUrl(pickTag(xml, ['url', 'lowurl']));
    if (!title || !url) return null;
    const desc = pickTag(xml, ['digest', 'des', 'description']);
    const thumbUrl = httpUrl(pickTag(xml, ['cover', 'thumburl', 'thumb_url']));
    return {
        title,
        url,
        ...(desc ? {desc} : {}),
        ...(thumbUrl ? {thumbUrl} : {}),
    };
}

function parseArticles(xml: string): InboundArticle[] {
    const category = xml.match(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/iu)?.[1] ?? '';
    if (!category) return [];
    const items = category.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/giu) ?? [];
    return items
        .map(articleOf)
        .filter((item): item is InboundArticle => item != null);
}

export function parseWechatAppMessage(rawContent: string): InboundAppMessage | null {
    const xml = decodeXmlDeep(stripGroupPrefix(rawContent)).trim();
    const appmsg = xml.match(/<appmsg(?:\s[^>]*)?>[\s\S]*?<\/appmsg>/iu)?.[0] ?? xml;
    if (!/<(?:appmsg|mmreader|category)(?:\s|>)/iu.test(appmsg)) return null;

    const articles = parseArticles(appmsg);
    const appTypeText = pickTag(appmsg, ['type']);
    const appType = appTypeText && /^\d+$/u.test(appTypeText) ? Number(appTypeText) : undefined;
    const title = pickTag(appmsg, ['title']) ?? articles[0]?.title;
    const url = httpUrl(pickTag(appmsg, ['url', 'lowurl'])) ?? articles[0]?.url;
    const desc = pickTag(appmsg, ['des', 'digest', 'description']) ?? articles[0]?.desc;
    const thumbUrl = httpUrl(pickTag(appmsg, ['thumburl', 'thumb_url', 'cover'])) ?? articles[0]?.thumbUrl;

    if (!title && !url && articles.length === 0) return null;
    return {
        ...(appType != null ? {appType} : {}),
        ...(title ? {title} : {}),
        ...(url ? {url} : {}),
        ...(desc ? {desc} : {}),
        ...(thumbUrl ? {thumbUrl} : {}),
        ...(articles.length ? {articles} : {}),
    };
}
