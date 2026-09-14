import type {MentionRef} from '../../core/message.js';

const AT_USER_LIST = /<atuserlist(?:\s[^>]*)?>([\s\S]*?)<\/atuserlist>/giu;
const AT_DISPLAY = /[@＠]([^@＠\u2004\u2005\u2006\u2009\u200A\u200B\uFEFF\s]+)/gu;

function decodeXml(value: string): string {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

export function extractMentionIds(...sources: Array<string | undefined>): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const raw of sources) {
        if (!raw?.trim()) continue;
        const decoded = decodeXml(raw);
        for (const match of decoded.matchAll(AT_USER_LIST)) {
            const body = (match[1] ?? '').replace('<![CDATA[', '').replace(']]>', '');
            for (const part of body.split(/[\n,;，；\s]+/u)) {
                const id = part.trim();
                if (!id || id.toLowerCase() === 'notify@all' || seen.has(id)) continue;
                seen.add(id);
                ids.push(id);
            }
        }
    }
    return ids;
}

export function extractAtDisplayNames(content?: string): string[] {
    if (!content?.trim()) return [];
    const names: string[] = [];
    for (const match of content.matchAll(AT_DISPLAY)) {
        const name = match[1]?.trim() ?? '';
        if (!name || name.length > 30) continue;
        if (name === '所有人' || name.toLowerCase() === 'all' || name.toLowerCase() === 'notify@all') {
            continue;
        }
        names.push(name);
    }
    return names;
}

export function resolveMentions(
    content: string | undefined,
    ...sources: Array<string | undefined>
): MentionRef[] {
    const ids = extractMentionIds(...sources);
    if (ids.length === 0) return [];
    const names = extractAtDisplayNames(content);
    return ids.map((id, index) => {
        const name = names[index]?.trim();
        return name && name !== id ? {id, name} : {id};
    });
}
