import {logger} from './logger.js';

const DEFAULT_AUDIO_CONVERT_API = 'https://api.chrelyonly.cn/convert';
const FETCH_TIMEOUT_MS = 45_000;
const SILK_HEADER = '#!SILK_V3';

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
    mediaBlob?: Blob;
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

function estimateBase64Bytes(value?: string): number {
    const normalized = normalizeBase64(value ?? '');
    if (!normalized) return 0;
    const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function findAsciiHeaderOffset(bytes: Uint8Array, header: string, maxScanBytes = 16): number {
    if (bytes.length < header.length) return -1;
    const upperBound = Math.min(maxScanBytes, bytes.length - header.length);
    for (let offset = 0; offset <= upperBound; offset += 1) {
        let matched = true;
        for (let index = 0; index < header.length; index += 1) {
            if (bytes[offset + index] !== header.charCodeAt(index)) {
                matched = false;
                break;
            }
        }
        if (matched) return offset;
    }
    return -1;
}

function inspectSilkArrayBuffer(buffer: ArrayBuffer): {byteLength: number; headerOffset: number} {
    const bytes = new Uint8Array(buffer);
    const headerOffset = findAsciiHeaderOffset(bytes, SILK_HEADER);
    return {
        byteLength: buffer.byteLength,
        headerOffset,
    };
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

    async convertToSilk(source: ConversionSource): Promise<{base64: string; blob: Blob} | null> {
        const payload = source.audioUrl?.trim()
            ? {audioUrl: source.audioUrl.trim()}
            : source.base64Audio?.trim()
                ? {base64Audio: normalizeBase64(source.base64Audio)}
                : null;
        if (!payload) return null;
        const hasAudioUrl = 'audioUrl' in payload;
        const base64Audio = ('base64Audio' in payload ? payload.base64Audio : '') ?? '';

        logger.info('audio->silk conversion request start', {
            apiUrl: this.apiUrl,
            sourceType: source.sourceType,
            hasAudioUrl,
            audioUrl: hasAudioUrl ? payload.audioUrl : undefined,
            base64Length: base64Audio.length,
            estimatedBytes: estimateBase64Bytes(base64Audio),
        });

        try {
            const response = await fetchWithTimeout(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/octet-stream, audio/*, application/json;q=0.9, */*;q=0.8',
                },
                body: JSON.stringify(payload),
            });
            logger.info('audio->silk conversion response received', {
                apiUrl: this.apiUrl,
                sourceType: source.sourceType,
                status: response.status,
                contentType: response.headers.get('content-type') ?? '',
                contentLength: response.headers.get('content-length') ?? '',
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

            const rawBuffer = await response.arrayBuffer();
            const inspectedBuffer = inspectSilkArrayBuffer(rawBuffer);
            logger.info('audio->silk conversion stream parsed', {
                apiUrl: this.apiUrl,
                sourceType: source.sourceType,
                byteLength: inspectedBuffer.byteLength,
                silkHeaderOffset: inspectedBuffer.headerOffset,
            });
            if (inspectedBuffer.headerOffset > 0) {
                logger.warn('audio->silk conversion stream had unexpected leading bytes', {
                    apiUrl: this.apiUrl,
                    sourceType: source.sourceType,
                    strippedLeadingBytes: inspectedBuffer.headerOffset,
                    preservedRawStream: true,
                });
            }
            if (rawBuffer.byteLength <= 0) return null;
            const blob = new Blob([rawBuffer], {type: 'application/octet-stream'});
            return {
                base64: await responseCloneToBase64(blob),
                blob,
            };
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

async function responseCloneToBase64(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (typeof btoa === 'function') {
        let binary = '';
        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }
        return btoa(binary);
    }
    const bufferCtor = (globalThis as typeof globalThis & {Buffer?: {from(input: Uint8Array): {toString(encoding: string): string}}}).Buffer;
    if (bufferCtor) {
        return bufferCtor.from(bytes).toString('base64');
    }
    throw new Error('Base64 encode unavailable in current runtime');
}

/**
 * Convert non-SILK audio sources into SILK payload when possible.
 *
 * Current strategy:
 * - format=4: direct pass-through
 * - others: use convert API to get SILK stream, preferring source URL when available
 */
export async function normalizeVoiceForWechat(
    input: VoiceConversionInput,
    options?: VoiceConversionOptions,
): Promise<VoiceConversionResult | null> {
    logger.info('normalizeVoiceForWechat start', {
        requestedFormat: input.format,
        durationMs: input.durationMs,
        mediaIsUrl: isHttpUrl(input.mediaData),
        mediaBase64Length: isHttpUrl(input.mediaData) ? 0 : normalizeBase64(input.mediaData).length,
        mediaEstimatedBytes: isHttpUrl(input.mediaData) ? 0 : estimateBase64Bytes(input.mediaData),
        hasOriginalUrl: Boolean(input.originalUrl?.trim()),
        originalUrl: input.originalUrl?.trim() || undefined,
    });
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
    let silkResult: {base64: string; blob: Blob} | null = null;

    if (audioUrl) {
        silkResult = await converter.convertToSilk({
            audioUrl,
            sourceType: 'url',
        });
    }

    if (!silkResult && inlineBase64) {
        silkResult = await converter.convertToSilk({
            base64Audio: inlineBase64,
            sourceType: 'base64',
        });
    }


    if (!silkResult) {
        logger.warn('normalizeVoiceForWechat failed', {
            requestedFormat: input.format,
            triedBase64: Boolean(inlineBase64),
            triedUrl: Boolean(audioUrl),
        });
        return null;
    }

    logger.info('normalizeVoiceForWechat success', {
        requestedFormat: input.format,
        outputFormat: 4,
        outputBase64Length: silkResult.base64.length,
        outputEstimatedBytes: estimateBase64Bytes(silkResult.base64),
    });

    return {
        format: 4,
        mediaData: silkResult.base64,
        mediaBlob: silkResult.blob,
        durationMs: input.durationMs,
        converted: true,
    };
}


