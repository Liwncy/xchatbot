/** 将表格文本渲染为 SVG data URL，便于以图片发送。 */

function getDisplayWidth(text: string): number {
    let width = 0;
    for (const ch of text) {
        width += /[\u0000-\u00ff]/.test(ch) ? 1 : 2;
    }
    return width;
}

function clampByDisplayWidth(text: string, maxWidth: number): string {
    if (getDisplayWidth(text) <= maxWidth) return text;
    let out = '';
    for (const ch of text) {
        const next = out + ch;
        if (getDisplayWidth(next) > maxWidth - 1) break;
        out = next;
    }
    return `${out}…`;
}

function normalizeLines(lines: string[], maxChars = 72): string[] {
    return lines
        .map((line) => line.replace(/\t/g, '  ').trimEnd())
        .filter((line) => line.trim().length > 0)
        .map((line) => clampByDisplayWidth(line, maxChars));
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function bytesToBase64(bytes: Uint8Array): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i] ?? 0;
        const hasB1 = i + 1 < bytes.length;
        const hasB2 = i + 2 < bytes.length;
        const b1 = hasB1 ? bytes[i + 1] : 0;
        const b2 = hasB2 ? bytes[i + 2] : 0;
        const n = (b0 << 16) | (b1 << 8) | b2;
        out += chars[(n >> 18) & 63];
        out += chars[(n >> 12) & 63];
        out += hasB1 ? chars[(n >> 6) & 63] : '=';
        out += hasB2 ? chars[n & 63] : '=';
    }
    return out;
}

/** 生成可直接用于 Reply `mediaId` 的 SVG data URL。 */
export function renderTableSvgDataUrl(title: string, rawLines: string[]): string {
    const lines = normalizeLines(rawLines);
    const allLines = [title, ...lines];
    const maxWidth = Math.max(20, ...allLines.map((line) => getDisplayWidth(line)));

    const fontSize = 18;
    const lineHeight = 30;
    const leftPad = 24;
    const topPad = 28;

    const width = Math.min(1400, leftPad * 2 + maxWidth * 10);
    const height = topPad * 2 + (allLines.length + 1) * lineHeight;

    const textNodes = allLines
        .map((line, idx) => {
            const y = topPad + (idx + 1) * lineHeight;
            const weight = idx === 0 ? 700 : 400;
            const color = idx === 0 ? '#111827' : '#1f2937';
            return `<text x="${leftPad}" y="${y}" font-size="${fontSize}" font-family="Consolas, Menlo, Monaco, 'Courier New', monospace" font-weight="${weight}" fill="${color}">${escapeXml(line)}</text>`;
        })
        .join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="0" y="0" width="${width}" height="${height}" rx="12" ry="12" fill="#ffffff"/><rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="12" ry="12" fill="none" stroke="#e5e7eb"/>${textNodes}</svg>`;

    const base64 = bytesToBase64(new TextEncoder().encode(svg));
    return `data:image/svg+xml;base64,${base64}`;
}

/**
 * 生成可被微信网关直接抓取的 PNG URL（第三方渲染）。
 * 说明：聊天网关对 data:image/svg 兼容性较差，优先使用 http 图片地址。
 */
export function renderTableImageUrl(title: string, rawLines: string[]): string {
    const lines = normalizeLines(rawLines, 64).slice(0, 36);
    const text = [title, ...lines].join('\n');

    // image-charts 的 text chart 输出 PNG，URL 可直接给 image_url。
    const width = 1100;
    const height = Math.min(1800, 120 + (lines.length + 1) * 34);
    const params = new URLSearchParams({
        cht: 'tx',
        chs: `${width}x${height}`,
        chf: 'bg,s,FFFFFF',
        chco: '1F2937',
        chd: 'a:',
        chl: text,
    });

    return `https://image-charts.com/chart?${params.toString()}`;
}


