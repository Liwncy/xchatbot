import {arrayBufferToBase64} from './binary.js';
import {logger} from './logger.js';

const DEFAULT_TOSILK_API = 'https://api.dudunas.top/api/tosilk';
const DEFAULT_TOSILK_APP_SECRET = 'a3c838e4dfbd21b3ab09e81ccd8b185d';
const FETCH_TIMEOUT_MS = 15_000;

export interface VoiceConversionInput {
    format: number;
    mediaData: string;
    durationMs: number;
    originalUrl?: string;
}

export interface VoiceConversionOptions {
    toSilkApiUrl?: string;
    toSilkAppSecret?: string;
}

export interface VoiceConversionResult {
    format: number;
    mediaData: string;
    durationMs: number;
    converted: boolean;
}

interface ToSilkApiResponse {
    code?: number;
    msg?: string;
    data?: {
        silkurl?: string;
    };
}

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test((value ?? '').trim());
}

async function fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, {method: 'GET', signal: controller.signal});
    } finally {
        clearTimeout(timer);
    }
}

export class Mp3ToSilkConverter {
    private readonly apiUrl: string;
    private readonly appSecret: string;

    constructor(options?: VoiceConversionOptions) {
        this.apiUrl = options?.toSilkApiUrl?.trim() || DEFAULT_TOSILK_API;
        this.appSecret = options?.toSilkAppSecret?.trim() || DEFAULT_TOSILK_APP_SECRET;
    }

    async convertUrl(mp3Url: string): Promise<string | null> {
        if (!isHttpUrl(mp3Url)) return null;

        const requestUrl = `${this.apiUrl}?AppSecret=${encodeURIComponent(this.appSecret)}&url=${encodeURIComponent(mp3Url)}`;
        try {
            const response = await fetchWithTimeout(requestUrl);
            if (!response.ok) {
                logger.warn('MP3->SILK conversion request failed', {status: response.status, requestUrl});
                return null;
            }

            const payload = (await response.json()) as ToSilkApiResponse;
            const silkUrl = payload?.data?.silkurl?.trim() ?? '';
            if (!silkUrl || !isHttpUrl(silkUrl)) {
                logger.warn('MP3->SILK conversion returned invalid silk url', {
                    requestUrl,
                    code: payload?.code,
                    msg: payload?.msg,
                });
                return null;
            }
            return silkUrl;
        } catch (error) {
            logger.warn('MP3->SILK conversion exception', {
                requestUrl,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }
}

async function downloadAsBase64(url: string): Promise<string | null> {
    try {
        const response = await fetchWithTimeout(url);
        if (!response.ok) {
            logger.warn('Download converted SILK failed', {status: response.status, url});
            return null;
        }

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength <= 0) return null;
        return arrayBufferToBase64(buffer);
    } catch (error) {
        logger.warn('Download converted SILK exception', {
            url,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

/**
 * Convert non-SILK audio sources into SILK payload when possible.
 *
 * Current strategy:
 * - format=4: direct pass-through
 * - format=2(MP3): use mp3 url -> silk url converter, then download silk as base64
 */
export async function normalizeVoiceForWechat(
    input: VoiceConversionInput,
    options?: VoiceConversionOptions,
): Promise<VoiceConversionResult | null> {
    if (input.format === 4) {
        return {
            format: 4,
            mediaData: input.mediaData,
            durationMs: input.durationMs,
            converted: false,
        };
    }

    if (input.format !== 2) {
        logger.warn('No voice converter registered for format', {format: input.format});
        return null;
    }

    const mp3Url = (input.originalUrl?.trim() || (isHttpUrl(input.mediaData) ? input.mediaData.trim() : ''));
    if (!mp3Url) {
        logger.warn('MP3 voice conversion requires original http url');
        return null;
    }

    const converter = new Mp3ToSilkConverter(options);
    const silkUrl = await converter.convertUrl(mp3Url);
    if (!silkUrl) return null;

    const silkBase64 = await downloadAsBase64(silkUrl);
    if (!silkBase64) return null;

    return {
        format: 4,
        mediaData: silkBase64,
        durationMs: input.durationMs,
        converted: true,
    };
}


