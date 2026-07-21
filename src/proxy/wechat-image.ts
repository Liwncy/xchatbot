import type {Env} from '../types/env.js';
import {logger} from '../utils/logger.js';
import {WechatApi} from '../wechat/api/index.js';
import {loadWechatMediaTicket} from './media-ticket.js';

function detectImageContentType(bytes: Uint8Array): string {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return 'image/jpeg';
    }
    if (
        bytes.length >= 8
        && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
        && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    ) {
        return 'image/png';
    }
    if (
        bytes.length >= 6
        && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38
        && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
    ) {
        return 'image/gif';
    }
    if (
        bytes.length >= 12
        && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
        return 'image/webp';
    }
    return 'application/octet-stream';
}

async function resolveImageDownloadCreds(
    requestUrl: URL,
    env: Env,
): Promise<{id: string; key: string; kind: 'image' | 'video-cover'} | Response> {
    const ticket = requestUrl.searchParams.get('t')?.trim() ?? '';
    if (ticket) {
        const record = await loadWechatMediaTicket(env, ticket);
        if (!record) {
            return new Response('Media ticket not found or expired', {status: 404});
        }
        if (record.kind !== 'image' && record.kind !== 'video-cover') {
            return new Response('Media ticket is not an image/cover', {status: 400});
        }
        return {id: record.fileId, key: record.fileAesKey, kind: record.kind};
    }

    const id = requestUrl.searchParams.get('id')?.trim() ?? '';
    const key = requestUrl.searchParams.get('key')?.trim() ?? '';
    if (!id || !key) {
        return new Response('Missing t, or id/key query parameters', {status: 400});
    }
    const asCover = requestUrl.searchParams.get('cover')?.trim() === '1';
    return {id, key, kind: asCover ? 'video-cover' : 'image'};
}

export async function handleWechatImageProxy(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', {status: 405});
    }

    const resolved = await resolveImageDownloadCreds(new URL(request.url), env);
    if (resolved instanceof Response) return resolved;
    const {id, key, kind} = resolved;

    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim();
    if (!apiBaseUrl) {
        return new Response('WECHAT_API_BASE_URL is not configured', {status: 500});
    }

    try {
        const api = new WechatApi(apiBaseUrl);
        const raw = kind === 'video-cover'
            ? await api.cdnDownloadVideoCoverRaw({id, key})
            : await api.cdnDownloadImageRaw({id, key});
        if (!raw.byteLength) {
            return new Response('Empty image from WeChat CDN', {status: 502});
        }

        const contentType = detectImageContentType(new Uint8Array(raw));
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
        logger.error('微信图片 GET 代理失败', {
            idPrefix: id.slice(0, 32),
            error: message,
        });
        return new Response(`Failed to download image from WeChat CDN: ${message}`, {status: 502});
    }
}
