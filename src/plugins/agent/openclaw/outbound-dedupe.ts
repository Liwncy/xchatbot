/**
 * 出站去重：OpenClaw 侧会对失败、超时的出站重试，网络抖动时「已发出但响应丢了」会变成发两遍。
 * 同一个 outboundId 只允许一次真正发送：
 *   - 发送中：再来的请求拿到 busy，由对端稍后重试；
 *   - 已发出：直接回 duplicate，不再发；
 *   - 发送失败：清掉标记，重试可以重新发。
 * 用 Cache API 做标记（免费、不占 KV 写额度），只在同一机房内生效，足够覆盖几分钟内的重试。
 */

const SENDING_TTL_SECONDS = 150;
const DONE_TTL_SECONDS = 600;

type DedupeState = 'sending' | 'done';

export type OutboundClaim =
    | {kind: 'claimed'}
    | {kind: 'busy'}
    | {kind: 'duplicate'; sentCount: number};

function cacheKey(outboundId: string): Request {
    return new Request(`https://outbound-dedupe.invalid/openclaw/${encodeURIComponent(outboundId)}`);
}

function marker(state: DedupeState, sentCount: number, ttlSeconds: number): Response {
    return new Response(JSON.stringify({state, sentCount}), {
        headers: {'Cache-Control': `max-age=${ttlSeconds}`, 'Content-Type': 'application/json'},
    });
}

function readCache(): Cache | null {
    try {
        return typeof caches === 'undefined' ? null : (caches as unknown as {default?: Cache}).default ?? null;
    } catch {
        return null;
    }
}

/** 没有 outboundId 或缓存不可用时一律放行，行为和以前一样。 */
export async function claimOutbound(outboundId: string): Promise<OutboundClaim> {
    const cache = readCache();
    if (!outboundId || !cache) return {kind: 'claimed'};
    try {
        const key = cacheKey(outboundId);
        const hit = await cache.match(key);
        if (hit) {
            const body = await hit.json() as {state?: DedupeState; sentCount?: number};
            if (body.state === 'done') return {kind: 'duplicate', sentCount: body.sentCount ?? 0};
            return {kind: 'busy'};
        }
        await cache.put(key, marker('sending', 0, SENDING_TTL_SECONDS));
    } catch {
        return {kind: 'claimed'};
    }
    return {kind: 'claimed'};
}

export async function finishOutbound(outboundId: string, sentCount: number): Promise<void> {
    const cache = readCache();
    if (!outboundId || !cache) return;
    try {
        await cache.put(cacheKey(outboundId), marker('done', sentCount, DONE_TTL_SECONDS));
    } catch {
        // 标记写不进去只意味着重试时可能重发，不影响本次结果。
    }
}

export async function releaseOutbound(outboundId: string): Promise<void> {
    const cache = readCache();
    if (!outboundId || !cache) return;
    try {
        await cache.delete(cacheKey(outboundId));
    } catch {
        // 同上。
    }
}
