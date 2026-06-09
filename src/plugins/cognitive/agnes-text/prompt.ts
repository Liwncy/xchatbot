export function extractPromptAfterKeyword(content: string, keywords: readonly string[]): string {
    const trimmed = content.trim();
    for (const keyword of keywords) {
        if (!trimmed.startsWith(keyword)) continue;
        return trimmed
            .slice(keyword.length)
            .replace(/^[\s,，。.!！:：;；、~-]+/, '')
            .trim();
    }
    return '';
}

export function extractPromptFromQuoteTitle(title: string, keywords: readonly string[]): string {
    const sorted = [...keywords].sort((a, b) => b.length - a.length);
    for (const keyword of sorted) {
        const index = title.indexOf(keyword);
        if (index < 0) continue;
        return title
            .slice(index + keyword.length)
            .replace(/^[\s,，。.!！:：;；、~-]+/, '')
            .trim();
    }
    return '';
}

export function buildQuotedTextPrompt(referContent: string, titleExtra: string): string {
    const base = referContent.trim();
    const extra = titleExtra.trim();
    if (!base) return extra;
    if (!extra) return base;
    return `${base}\n${extra}`;
}
