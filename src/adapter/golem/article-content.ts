import type {ArticleContentItem, ArticleTextItem} from '../../core/message.js';

const BLOCK_TAGS = new Set([
    'address', 'article', 'blockquote', 'div', 'figcaption', 'h1', 'h2', 'h3',
    'h4', 'h5', 'h6', 'li', 'p', 'pre', 'section', 'table', 'td', 'th', 'tr',
]);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const SKIPPED_TAGS = new Set(['noscript', 'script', 'style', 'svg']);
const MAX_ITEMS = 200;
const MAX_TEXT_ITEM_CHARS = 4_000;

export interface WechatArticlePage {
    contentItems: ArticleContentItem[];
    authorName?: string;
    authorAvatarUrl?: string;
}

function decodeHtml(value: string): string {
    return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);?/giu, (whole, entity: string) => {
        const lower = entity.toLowerCase();
        if (lower.startsWith('#x')) {
            const code = Number.parseInt(lower.slice(2), 16);
            return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
        }
        if (lower.startsWith('#')) {
            const code = Number.parseInt(lower.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
        }
        return {
            amp: '&',
            apos: "'",
            gt: '>',
            lt: '<',
            nbsp: ' ',
            quot: '"',
        }[lower] ?? whole;
    });
}

function decodeJsString(value: string): string {
    return decodeHtml(value
        .replace(/\\u([\da-f]{4})/giu, (_whole, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
        .replace(/\\x([\da-f]{2})/giu, (_whole, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
        .replace(/\\\//gu, '/')
        .replace(/\\"/gu, '"')
        .replace(/\\'/gu, "'")
        .replace(/\\n|\\r|\\t/gu, ' '))
        .replace(/\s+/gu, ' ')
        .trim();
}

function elementTextById(html: string, id: string): string | undefined {
    const pattern = new RegExp(
        `<([a-z][\\w:-]*)\\b[^>]*\\bid\\s*=\\s*(?:"${id}"|'${id}'|${id}\\b)[^>]*>([\\s\\S]*?)<\\/\\1>`,
        'iu',
    );
    const value = decodeHtml(pattern.exec(html)?.[2]?.replace(/<[^>]+>/gu, ' ') ?? '')
        .replace(/\s+/gu, ' ')
        .trim();
    return value || undefined;
}

function jsVariable(html: string, names: string[]): string | undefined {
    for (const name of names) {
        const pattern = new RegExp(
            `(?:var\\s+)?${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`,
            'iu',
        );
        const raw = pattern.exec(html)?.[1];
        if (!raw) continue;
        const value = decodeJsString(raw.slice(1, -1));
        if (value) return value;
    }
    return undefined;
}

function articleAuthor(html: string, articleUrl: string): Pick<WechatArticlePage, 'authorName' | 'authorAvatarUrl'> {
    const authorName = elementTextById(html, 'js_author_name')
        ?? elementTextById(html, 'js_name')
        ?? jsVariable(html, ['nickname']);
    const avatarRaw = jsVariable(html, ['round_head_img', 'hd_head_img', 'head_img']);
    const authorAvatarUrl = absoluteHttpUrl(avatarRaw, articleUrl);
    return {
        ...(authorName ? {authorName} : {}),
        ...(authorAvatarUrl ? {authorAvatarUrl} : {}),
    };
}

function attributesOf(tag: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const body = tag.replace(/^<\/?\s*[\w:-]+/u, '').replace(/\/?>$/u, '');
    const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(body)) != null) {
        attributes[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
    }
    return attributes;
}

function articleBody(html: string): string | null {
    const openingPattern = /<([a-z][\w:-]*)\b[^>]*\bid\s*=\s*(?:"js_content"|'js_content'|js_content\b)[^>]*>/giu;
    const opening = openingPattern.exec(html);
    if (!opening) return null;
    const tagName = opening[1].toLowerCase();
    const contentStart = opening.index + opening[0].length;
    const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'giu');
    tagPattern.lastIndex = contentStart;
    let depth = 1;
    let match: RegExpExecArray | null;
    while ((match = tagPattern.exec(html)) != null) {
        depth += /^<\//u.test(match[0]) ? -1 : 1;
        if (depth === 0) return html.slice(contentStart, match.index);
    }
    return html.slice(contentStart);
}

function absoluteHttpUrl(raw: string | undefined, baseUrl: string): string | undefined {
    const value = raw?.trim();
    if (!value || value === 'undefined' || value.startsWith('data:')) return undefined;
    try {
        const url = new URL(value.startsWith('//') ? `https:${value}` : value, baseUrl);
        return /^https?:$/u.test(url.protocol) ? url.toString() : undefined;
    } catch {
        return undefined;
    }
}

function numericDimension(attrs: Record<string, string>, names: string[]): number | undefined {
    for (const name of names) {
        const value = attrs[name]?.trim();
        if (!value) continue;
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return undefined;
}

function styleDimension(style: string | undefined, name: 'width' | 'height'): number | undefined {
    const match = style?.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, 'iu'));
    const parsed = match?.[1] ? Number.parseFloat(match[1]) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isArticleImage(url: string, attrs: Record<string, string>): boolean {
    const parsed = new URL(url);
    if (['wx.qlogo.cn', 'mmbiz.qlogo.cn', 'res.wx.qq.com'].includes(parsed.hostname.toLowerCase())) return false;

    const markers = [
        attrs.id,
        attrs.class,
        attrs.alt,
        attrs.role,
        parsed.pathname,
    ].filter(Boolean).join(' ');
    if (/(?:^|[_\-\s/])(avatar|emoji|icon|logo|profile|qrcode|qr_code)(?:[_\-\s/.]|$)/iu.test(markers)) {
        return false;
    }

    const width = numericDimension(attrs, ['data-w', 'data-width', 'width'])
        ?? styleDimension(attrs.style, 'width');
    const ratio = Number.parseFloat(attrs['data-ratio'] ?? '');
    const height = numericDimension(attrs, ['data-h', 'data-height', 'height'])
        ?? styleDimension(attrs.style, 'height')
        ?? (width && Number.isFinite(ratio) && ratio > 0 ? width * ratio : undefined);
    return !((width != null && width <= 96) || (height != null && height <= 48));
}

function appendText(current: string, raw: string): string {
    const text = decodeHtml(raw).replace(/\u00a0/gu, ' ').replace(/\s+/gu, ' ').trim();
    if (!text) return current;
    if (!current) return text;
    const needsSpace = /[a-z\d]$/iu.test(current) && /^[a-z\d]/iu.test(text);
    return `${current}${needsSpace ? ' ' : ''}${text}`;
}

function textStyleOf(tagName: string): ArticleTextItem['style'] | undefined {
    if (/^h[1-6]$/u.test(tagName)) return 'heading';
    if (tagName === 'li') return 'list';
    if (tagName === 'blockquote') return 'quote';
    if (tagName === 'pre') return 'code';
    if (tagName === 'p') return 'paragraph';
    return undefined;
}

function isSourceAttribution(content: string): boolean {
    return /^(?:以下)?文章来源于/u.test(content)
        || /^本文(?:转载|转自|来源于?)[：:]/u.test(content)
        || /^(?:原文)?来源[：:]/u.test(content);
}

export function parseWechatArticleContent(html: string, articleUrl: string): ArticleContentItem[] {
    const body = articleBody(html);
    if (!body) return [];

    const items: ArticleContentItem[] = [];
    let text = '';
    let textStyle: ArticleTextItem['style'] = 'paragraph';
    let ignoredDepth = 0;
    const flushText = () => {
        const content = text.trim();
        text = '';
        if (!content || isSourceAttribution(content) || items.length >= MAX_ITEMS) return;
        for (let start = 0; start < content.length && items.length < MAX_ITEMS; start += MAX_TEXT_ITEM_CHARS) {
            items.push({
                type: 'text',
                content: content.slice(start, start + MAX_TEXT_ITEM_CHARS),
                ...(textStyle !== 'paragraph' ? {style: textStyle} : {}),
            });
        }
    };

    const tokens = body.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+/giu) ?? [];
    for (const token of tokens) {
        if (items.length >= MAX_ITEMS) break;
        if (!token.startsWith('<')) {
            if (ignoredDepth === 0) text = appendText(text, token);
            continue;
        }
        if (/^<!--|^<!/u.test(token)) continue;

        const tagMatch = token.match(/^<\s*(\/?)\s*([a-z][\w:-]*)/iu);
        if (!tagMatch) continue;
        const closing = Boolean(tagMatch[1]);
        const tagName = tagMatch[2].toLowerCase();
        const selfClosing = /\/\s*>$/u.test(token) || VOID_TAGS.has(tagName);

        if (ignoredDepth > 0) {
            if (closing) ignoredDepth -= 1;
            else if (!selfClosing) ignoredDepth += 1;
            continue;
        }
        if (!closing && SKIPPED_TAGS.has(tagName)) {
            if (!selfClosing) ignoredDepth = 1;
            continue;
        }
        if (!closing && tagName === 'img') {
            flushText();
            const attrs = attributesOf(token);
            const url = absoluteHttpUrl(
                attrs['data-src'] ?? attrs['data-original'] ?? attrs['data-backsrc'] ?? attrs.src,
                articleUrl,
            );
            if (url && isArticleImage(url, attrs)) {
                items.push({
                    type: 'image',
                    url,
                    ...(attrs.alt?.trim() ? {alt: attrs.alt.trim()} : {}),
                });
            }
            continue;
        }
        if (!closing && (tagName === 'br' || tagName === 'hr')) {
            flushText();
            continue;
        }
        if (BLOCK_TAGS.has(tagName)) {
            flushText();
            textStyle = closing ? 'paragraph' : (textStyleOf(tagName) ?? textStyle);
        }
    }
    flushText();
    return items;
}

export function parseWechatArticlePage(html: string, articleUrl: string): WechatArticlePage {
    return {
        contentItems: parseWechatArticleContent(html, articleUrl),
        ...articleAuthor(html, articleUrl),
    };
}

export async function fetchWechatArticlePage(articleUrl: string): Promise<WechatArticlePage> {
    const url = new URL(articleUrl);
    if (!/^https?:$/u.test(url.protocol) || url.hostname !== 'mp.weixin.qq.com') return {contentItems: []};
    url.protocol = 'https:';
    const response = await fetch(url.toString(), {
        headers: {
            'Accept': 'text/html,application/xhtml+xml',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        },
        redirect: 'follow',
    });
    if (!response.ok) throw new Error(`article fetch failed: ${response.status}`);
    return parseWechatArticlePage(await response.text(), url.toString());
}
