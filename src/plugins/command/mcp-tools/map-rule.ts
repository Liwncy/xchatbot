import {parseRepliesFromText} from '../../../core/outbound.js';
import {textReply, type HandlerResponse} from '../../../core/reply.js';
import type {McpToolResult} from '../../../mcp/client.js';

type RuleParam = {name?: string; description?: string};
type RuleMeta = {
    title?: string;
    description?: string;
    picUrl?: string;
    voiceFormat?: number;
    voiceDurationMs?: number;
    appType?: number;
};
type RuleRaw = {
    matched?: boolean;
    missingParams?: RuleParam[];
    kind?: string;
    value?: string;
    error?: string;
    meta?: RuleMeta;
};

function asRuleRaw(raw: unknown): RuleRaw | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw as RuleRaw;
}

function looksLikeJson(value: string): boolean {
    const text = value.trim();
    return text.startsWith('{') || text.startsWith('[');
}

function mapKind(kind: string | undefined, value: string, meta: RuleMeta | undefined): HandlerResponse {
    const trimmed = value.trim();
    if (/^(image|video|audio|voice|link|music|emoji|app):/iu.test(trimmed)) {
        return parseRepliesFromText(trimmed);
    }
    if (!trimmed && kind !== 'app') return textReply('这次没弄成，再试下');

    if (kind === 'image') return parseRepliesFromText(`image:${trimmed}`);
    if (kind === 'video') return parseRepliesFromText(`video:${trimmed}`);
    if (kind === 'voice') {
        const seconds = meta?.voiceDurationMs == null ? '' : String(Math.round(meta.voiceDurationMs / 1000));
        const format = meta?.voiceFormat == null ? '' : String(meta.voiceFormat);
        return parseRepliesFromText(`audio:${trimmed}|${seconds}|${format}`);
    }
    if (kind === 'link') {
        const title = meta?.title?.trim() || '看看这个';
        const desc = meta?.description?.trim() || '';
        const pic = meta?.picUrl?.trim() || '';
        return parseRepliesFromText(`link:${title}|${desc}|${trimmed}|${pic}`);
    }
    if (kind === 'app') {
        if (/^app:\d+\s+</iu.test(trimmed)) return parseRepliesFromText(trimmed);
        const appType = meta?.appType ?? 19;
        return parseRepliesFromText(`app:${appType} ${trimmed}`);
    }
    if (kind === 'raw') {
        return textReply(looksLikeJson(trimmed) ? '好了 👌' : trimmed);
    }
    return parseRepliesFromText(trimmed);
}

export function mapRuleExecute(result: McpToolResult): HandlerResponse {
    const raw = asRuleRaw(result.raw);
    if (!raw || raw.matched === false) return null;
    if (raw.missingParams?.length) {
        const need = raw.missingParams
            .map((item) => item.description?.trim() || item.name?.trim())
            .filter(Boolean)
            .join('、');
        return textReply(need ? `还差${need}，补上再发一遍` : '还缺点东西，补上再发一遍');
    }
    if (raw.error) return textReply('这次没弄成，再试下');
    return mapKind(raw.kind, raw.value ?? '', raw.meta);
}
