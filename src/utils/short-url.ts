import {logger} from './logger.js';

const DEFAULT_SHORT_URL_API = 'https://api.box3.cn/v1/shorturl/generate';
const DEFAULT_SHORT_URL_PREFIX = 'https://a.box3.cn/';
const DEFAULT_TIMEOUT_MS = 10_000;

export interface CreateShortUrlOptions {
    apiUrl?: string;
    shortUrlPrefix?: string;
    timeoutMs?: number;
}

interface Box3ShortUrlResponse {
    code?: number;
    msg?: string;
    data?: {
        code?: string;
        request_id?: number;
    };
}

function isHttpUrl(value: unknown): value is string {
    return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

/**
 * 调用短链接接口生成短链。
 *
 * - 成功时返回短链 URL。
 * - 接口异常或返回不可识别内容时返回 null。
 */
export async function createShortUrl(longUrl: string, options?: CreateShortUrlOptions): Promise<string | null> {
    const normalizedLongUrl = longUrl.trim();
    if (!isHttpUrl(normalizedLongUrl)) {
        return null;
    }

    const apiUrl = options?.apiUrl?.trim() || DEFAULT_SHORT_URL_API;
    const shortUrlPrefix = options?.shortUrlPrefix?.trim() || DEFAULT_SHORT_URL_PREFIX;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'text/plain',
                Accept: 'application/json, text/plain, */*',
            },
            body: normalizedLongUrl,
        });

        if (!response.ok) {
            logger.warn('短链接接口请求失败', {
                apiUrl,
                longUrl: normalizedLongUrl,
                status: response.status,
            });
            return null;
        }

        const payload = (await response.json()) as Box3ShortUrlResponse;
        const code = payload.data?.code?.trim();
        if (!code) {
            logger.warn('短链接接口返回缺少 data.code', {
                apiUrl,
                longUrl: normalizedLongUrl,
                payload,
            });
            return null;
        }

        return new URL(code, shortUrlPrefix).toString();
    } catch (error) {
        logger.warn('短链接接口调用异常', {
            apiUrl,
            longUrl: normalizedLongUrl,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/** 生成短链，失败时回退原链接。 */
export async function createShortUrlOrOriginal(longUrl: string, options?: CreateShortUrlOptions): Promise<string> {
    return (await createShortUrl(longUrl, options)) || longUrl;
}

