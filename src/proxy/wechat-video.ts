import type {Env} from '../types/env.js';
import {logger} from '../utils/logger.js';
import {WechatApi} from '../wechat/api/index.js';
import {loadWechatMediaTicket} from './media-ticket.js';

function detectVideoContentType(bytes: Uint8Array): string {
    if (bytes.length >= 12) {
        const box = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
        if (box === 'ftyp') return 'video/mp4';
    }
    if (
        bytes.length >= 4
        && bytes[0] === 0x1a
        && bytes[1] === 0x45
        && bytes[2] === 0xdf
        && bytes[3] === 0xa3
    ) {
        return 'video/webm';
    }
    return 'video/mp4';
}

async function resolveVideoDownloadCreds(
    requestUrl: URL,
    env: Env,
): Promise<{id: string; key: string} | Response> {
    const ticket = requestUrl.searchParams.get('t')?.trim() ?? '';
    if (ticket) {
        const record = await loadWechatMediaTicket(env, ticket);
        if (!record) {
            return new Response('Media ticket not found or expired', {status: 404});
        }
        if (record.kind !== 'video') {
            return new Response('Media ticket is not a video', {status: 400});
        }
        return {id: record.fileId, key: record.fileAesKey};
    }

    const id = requestUrl.searchParams.get('id')?.trim() ?? '';
    const key = requestUrl.searchParams.get('key')?.trim() ?? '';
    if (!id || !key) {
        return new Response('Missing t, or id/key query parameters', {status: 400});
    }
    if (id.includes('…') || id.includes('...') || key.includes('…') || key.includes('...')) {
        return new Response('id/key looks truncated; use short ticket URL (?t=...)', {status: 400});
    }
    return {id, key};
}

export async function handleWechatVideoProxy(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', {status: 405});
    }

    const resolved = await resolveVideoDownloadCreds(new URL(request.url), env);
    if (resolved instanceof Response) return resolved;
    const {id, key} = resolved;

    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim();
    if (!apiBaseUrl) {
        return new Response('WECHAT_API_BASE_URL is not configured', {status: 500});
    }

    try {
        const api = new WechatApi(apiBaseUrl);
        const raw = await api.cdnDownloadChatVideoRaw({id, key});
        if (!raw.byteLength) {
            return new Response('Empty video from WeChat CDN', {status: 502});
        }

        // 网关偶发用 JSON 报错但 status=200
        if (raw.byteLength < 256) {
            const head = new TextDecoder().decode(new Uint8Array(raw).slice(0, raw.byteLength));
            if (head.trimStart().startsWith('{') || head.trimStart().startsWith('<')) {
                logger.warn('微信视频代理收到非视频响应', {
                    idPrefix: id.slice(0, 32),
                    head: head.slice(0, 200),
                });
                return new Response(`Upstream returned non-video payload: ${head.slice(0, 300)}`, {
                    status: 502,
                });
            }
        }

        const contentType = detectVideoContentType(new Uint8Array(raw));
        const headers: Record<string, string> = {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
        };

        if (request.method === 'HEAD') {
            headers['Content-Length'] = String(raw.byteLength);
            return new Response(null, {status: 200, headers});
        }

        return new Response(raw, {status: 200, headers});
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('微信视频 GET 代理失败', {
            idPrefix: id.slice(0, 32),
            keyLength: key.length,
            error: message,
        });
        return new Response(`Failed to download video from WeChat CDN: ${message}`, {status: 502});
    }
}
