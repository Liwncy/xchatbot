import {arrayBufferToBase64} from './binary.js';
import {logger} from './logger.js';

const DEFAULT_AUDIO_CONVERT_API = 'https://api.chrelyonly.cn/convert';
const FETCH_TIMEOUT_MS = 45_000;

export interface VoiceConversionInput {
    format: number;
    mediaData: string;
    durationMs: number;
    originalUrl?: string;
}

export interface VoiceConversionOptions {
    convertApiUrl?: string;
}

export interface VoiceConversionResult {
    format: number;
    mediaData: string;
    durationMs: number;
    converted: boolean;
}

type ConversionSource =
    | {audioUrl: string; base64Audio?: undefined; sourceType: 'url'}
    | {audioUrl?: undefined; base64Audio: string; sourceType: 'base64'};

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test((value ?? '').trim());
}

function normalizeBase64(value: string): string {
    const trimmed = (value ?? '').trim();
    const match = trimmed.match(/^data:[^;]+;base64,(.+)$/i);
    return match?.[1] ?? trimmed;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, {...init, signal: controller.signal});
    } finally {
        clearTimeout(timer);
    }
}

export class AudioToSilkConverter {
    private readonly apiUrl: string;

    constructor(options?: VoiceConversionOptions) {
        this.apiUrl = options?.convertApiUrl?.trim() || DEFAULT_AUDIO_CONVERT_API;
    }

    async convertToSilkBase64(source: ConversionSource): Promise<string | null> {
        const payload = source.audioUrl?.trim()
            ? {audioUrl: source.audioUrl.trim()}
            : source.base64Audio?.trim()
                ? {base64Audio: normalizeBase64(source.base64Audio)}
                : null;
        if (!payload) return null;

        try {
            const response = await fetchWithTimeout(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/octet-stream, audio/*, application/json;q=0.9, */*;q=0.8',
                },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                logger.warn('audio->silk conversion request failed', {
                    status: response.status,
                    apiUrl: this.apiUrl,
                    sourceType: source.sourceType,
                });
                return null;
            }

            const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
            if (contentType.includes('application/json')) {
                const text = (await response.text()).slice(0, 300);
                logger.warn('audio->silk converter returned json instead of stream', {
                    apiUrl: this.apiUrl,
                    contentType,
                    bodyPreview: text,
                });
                return null;
            }

            const buffer = await response.arrayBuffer();
            if (buffer.byteLength <= 0) return null;
            return arrayBufferToBase64(buffer);
        } catch (error) {
            logger.warn('audio->silk conversion exception', {
                apiUrl: this.apiUrl,
                sourceType: source.sourceType,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }
}

/**
 * Convert non-SILK audio sources into SILK payload when possible.
 *
 * Current strategy:
 * - format=4: direct pass-through
 * - others: use convert API to get SILK stream, then encode as base64
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

    const converter = new AudioToSilkConverter(options);
    const audioUrl = input.originalUrl?.trim() || (isHttpUrl(input.mediaData) ? input.mediaData.trim() : '');
    const inlineBase64 = isHttpUrl(input.mediaData) ? '' : normalizeBase64(input.mediaData);
    let silkBase64: string | null = null;

    if (inlineBase64) {
        silkBase64 = await converter.convertToSilkBase64({
            base64Audio: inlineBase64,
            sourceType: 'base64',
        });
    }

    if (!silkBase64 && audioUrl) {
        silkBase64 = await converter.convertToSilkBase64({
            audioUrl,
            sourceType: 'url',
        });
    }


    if (!silkBase64) return null;

    return {
        format: 4,
        mediaData: silkBase64,
        durationMs: input.durationMs,
        converted: true,
    };
}


