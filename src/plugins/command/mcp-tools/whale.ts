import type {Env} from '../../../types/env.js';
import {callCfTool} from '../../channel/ambient/guard.js';

export interface WhaleHit {
    url: string;
    name?: string;
    emotion?: string;
}

/** 只打外部表情工具。自动配图要和本地库掺在一起时，由调用方自己掷。 */
export async function pickWhaleSticker(env: Env, query: string): Promise<WhaleHit | null> {
    const result = await callCfTool(env, 'search_whale_sticker', {query, limit: 1}, 8_000);
    if (!result?.ok) return null;
    const raw = result.raw;
    if (!raw || typeof raw !== 'object') return null;
    const items = (raw as {items?: unknown}).items;
    const first = Array.isArray(items) ? items[0] : null;
    if (!first || typeof first !== 'object') return null;
    const row = first as {url?: unknown; name?: unknown; emotion?: unknown};
    const url = typeof row.url === 'string' ? row.url.trim() : '';
    if (!/^https:\/\//iu.test(url)) return null;
    return {
        url,
        name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : undefined,
        emotion: typeof row.emotion === 'string' && row.emotion.trim() ? row.emotion.trim() : undefined,
    };
}
