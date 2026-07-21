import type {Env} from '../types/env.js';
import {logger} from '../utils/logger.js';
import {WechatApi} from '../wechat/api/index.js';

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

export async function handleWechatVideoProxy(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', {status: 405});
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id')?.trim();
    const key = url.searchParams.get('key')?.trim();
    if (!id || !key) {
        return new Response('Missing id or key query parameters', {status: 400});
    }

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
        logger.error('微信视频 GET 代理失败', {
            id: id.slice(0, 32),
            error: error instanceof Error ? error.message : String(error),
        });
        return new Response('Failed to download video from WeChat CDN', {status: 502});
    }
}
