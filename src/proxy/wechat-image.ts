import type {Env} from '../types/env.js';
import {logger} from '../utils/logger.js';
import {WechatApi} from '../wechat/api/index.js';

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

export async function handleWechatImageProxy(request: Request, env: Env): Promise<Response> {
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
        const raw = await api.cdnDownloadImageRaw({id, key});
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
        logger.error('微信图片 GET 代理失败', {
            id: id.slice(0, 32),
            error: error instanceof Error ? error.message : String(error),
        });
        return new Response('Failed to download image from WeChat CDN', {status: 502});
    }
}
