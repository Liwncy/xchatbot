/** HTML 工具函数：解码实体、去标签、归一化文本 */

export function decodeHtmlEntities(input: string): string {
    return input
        .replace(/&nbsp;/gi, ' ')
        .replace(/&ensp;/gi, ' ')
        .replace(/&emsp;/gi, ' ')
        .replace(/&thinsp;/gi, ' ')
        .replace(/&#8194;/gi, ' ')
        .replace(/&#8195;/gi, ' ')
        .replace(/&#8201;/gi, ' ')
        .replace(/&#12288;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x2F;/gi, '/');
}

export function stripHtml(input: string): string {
    return decodeHtmlEntities(
        input
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<br\s*\/?\s*>/gi, '\n')
            .replace(/<[^>]+>/g, ' '),
    )
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, '\n')
        .trim();
}

export function escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 把多行/多空格内容压成单行，换行用 " / " 分隔 */
export function normalizeBasicValue(input: string): string {
    return input
        .replace(/\s*\n+\s*/g, ' / ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

