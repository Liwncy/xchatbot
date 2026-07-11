export interface ChatRecordChunkOptions {
    /** 单条气泡最大字符数（默认 1200） */
    maxLength?: number;
    /** 单条气泡最大行数（默认 36） */
    maxLines?: number;
}

const DEFAULT_MAX_LENGTH = 1200;
const DEFAULT_MAX_LINES = 36;

/** 长行优先在这些位置断开（越靠前越优先） */
const PREFERRED_BREAK_TOKENS = [
    ' + ',
    '"><',
    '</',
    '/>',
    '],[',
    '},{',
    '，',
    '。',
    '；',
    '、',
    ', ',
    '; ',
    ' ',
    '/',
    '&',
    '?',
    '=',
    ',',
    '.',
    ';',
    ':',
    '）',
    ')',
    ']',
    '】',
    '}',
] as const;

/**
 * 把长文本切成适合微信「聊天记录」卡片的多条气泡。
 * 优先按空行段合并；超长行按结构点断开，避免 XML/URL 乱砍。
 */
export function splitTextForChatRecord(
    content: string,
    options?: ChatRecordChunkOptions,
): string[] {
    const maxLength = Math.max(80, options?.maxLength ?? DEFAULT_MAX_LENGTH);
    const maxLines = Math.max(3, options?.maxLines ?? DEFAULT_MAX_LINES);
    const normalized = content.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    const blocks = normalized
        .split(/\n\s*\n/g)
        .map((block) => block.trim())
        .filter(Boolean);
    if (!blocks.length) return [normalized];

    const chunks: string[] = [];
    let current = '';

    const flushCurrent = (): void => {
        const trimmed = current.trim();
        if (trimmed) chunks.push(trimmed);
        current = '';
    };

    const appendBlock = (block: string): void => {
        const next = current ? `${current}\n\n${block}` : block;
        if (next.length > maxLength || lineCountOf(next) > maxLines) {
            flushCurrent();
            if (block.length > maxLength || lineCountOf(block) > maxLines) {
                splitLargeBlock(block, maxLength, maxLines).forEach((part) => chunks.push(part));
                return;
            }
        }
        current = current ? `${current}\n\n${block}` : block;
    };

    for (const block of blocks) {
        appendBlock(block);
    }
    flushCurrent();

    return chunks.length ? chunks : splitLargeBlock(normalized, maxLength, maxLines);
}

function splitLargeBlock(block: string, maxLength: number, maxLines: number): string[] {
    const lines = block.split('\n');
    const chunks: string[] = [];
    let current: string[] = [];

    const flush = (): void => {
        const text = current.join('\n').trim();
        if (text) chunks.push(text);
        current = [];
    };

    for (const line of lines) {
        const next = current.length ? [...current, line].join('\n') : line;
        if (current.length && (next.length > maxLength || current.length + 1 > maxLines)) {
            flush();
        }
        if (line.length > maxLength) {
            flush();
            chunks.push(...sliceLongLine(line, maxLength));
            continue;
        }
        current.push(line);
    }
    flush();

    return chunks.length ? chunks : [block.trim()];
}

function sliceLongLine(line: string, maxLength: number): string[] {
    const trimmed = line.trim();
    if (!trimmed) return [];
    if (trimmed.length <= maxLength) return [trimmed];

    const labelMatch = trimmed.match(/^([^：:\n]{1,24}[：:])([\s\S]+)$/u);
    const label = labelMatch?.[1] ?? '';
    const body = labelMatch?.[2] ?? trimmed;
    const continuationPrefix = label ? `${label.replace(/[：:]$/u, '')}续：` : '';

    const result: string[] = [];
    let rest = body;
    let isFirst = true;

    while (rest.length > 0) {
        const prefix = isFirst ? label : continuationPrefix;
        const budget = Math.max(40, maxLength - prefix.length);
        if (rest.length <= budget) {
            result.push(`${prefix}${rest}`.trim());
            break;
        }

        let sliceIndex = resolveLongLineSliceIndex(rest, budget);
        if (sliceIndex <= 0) sliceIndex = budget;
        const piece = rest.slice(0, sliceIndex).trim();
        if (!piece) {
            result.push(`${prefix}${rest.slice(0, budget)}`.trim());
            rest = rest.slice(budget).trim();
            isFirst = false;
            continue;
        }
        result.push(`${prefix}${piece}`.trim());
        rest = rest.slice(sliceIndex).trim();
        isFirst = false;
    }

    return result.filter(Boolean);
}

function resolveLongLineSliceIndex(text: string, maxLength: number): number {
    const minIndex = Math.floor(maxLength * 0.55);
    const window = text.slice(0, maxLength);

    for (const token of PREFERRED_BREAK_TOKENS) {
        const found = window.lastIndexOf(token);
        if (found >= minIndex) {
            return found + token.length;
        }
    }

    return maxLength;
}

function lineCountOf(content: string): number {
    return content.split('\n').length;
}
