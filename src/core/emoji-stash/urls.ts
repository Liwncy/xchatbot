const SIGNED_QUERY = /[?&](?:expires|e|sign|signature)=/iu;
const SHORT_KV_HOST = /\/i\/[a-f0-9]{8,32}\b/iu;

/** 画图预签名、KV 短链、占位链会过期。微信表情 stodownload 能用很久，可以入库。 */
export function isEphemeralImageUrl(url: string): boolean {
    const trimmed = url.trim();
    if (!trimmed) return false;
    try {
        const parsed = new URL(trimmed);
        if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local')) return true;
        if (SHORT_KV_HOST.test(parsed.pathname)) return true;
        if (SIGNED_QUERY.test(parsed.search)) return true;
        return false;
    } catch {
        return true;
    }
}

export function isDurableImageUrl(url: string): boolean {
    const trimmed = url.trim();
    if (!/^https?:\/\//iu.test(trimmed)) return false;
    return !isEphemeralImageUrl(trimmed);
}

export function pickDurableImageUrl(...candidates: Array<string | null | undefined>): string {
    for (const candidate of candidates) {
        const value = candidate?.trim() ?? '';
        if (isDurableImageUrl(value)) return value;
    }
    return '';
}
