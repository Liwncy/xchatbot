import {encode, getDuration, isSilk} from './vendor/silk-glue.mjs';
import silkWasm from 'silk-wasm/lib/silk.wasm';
import type {Env} from '../../types/env.js';
import {logger} from '../logger.js';

export const WECHAT_VOICE_SILK_FORMAT = 4;
const DEFAULT_PCM_RATE = 24000;
/** 微信一条语音气泡最长 60 秒。 */
const MAX_VOICE_MS = 60_000;
const MAX_VOICE_SAMPLES = Math.floor(DEFAULT_PCM_RATE * MAX_VOICE_MS / 1000);
const DEFAULT_SILK_CONVERT_URL = 'https://api.chrelyonly.cn/convert';
const CONVERT_TIMEOUT_MS = 25_000;

export type EncodedSilk = {
    data: Uint8Array;
    durationMs: number;
};

export type EncodedSilkVoice = {
    blob: Blob;
    durationMs: number;
    format: number;
};

type ProcessVersions = {node?: unknown};

type EmscriptenProto = {
    locateFile?: (path: string, prefix?: string) => string;
    instantiateWasm?: (
        imports: WebAssembly.Imports,
        callback: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
    ) => unknown;
};

function readFour(bytes: Uint8Array, offset: number): string {
    return String.fromCharCode(
        bytes[offset] ?? 0,
        bytes[offset + 1] ?? 0,
        bytes[offset + 2] ?? 0,
        bytes[offset + 3] ?? 0,
    );
}

/** Fish WAV writes placeholder RIFF/data sizes; silk-wasm rejects those headers. */
export function repairWavSizes(input: ArrayBuffer): ArrayBuffer {
    if (input.byteLength < 44) return input;
    const bytes = new Uint8Array(input.slice(0));
    if (readFour(bytes, 0) !== 'RIFF' || readFour(bytes, 8) !== 'WAVE') return input;
    const view = new DataView(bytes.buffer);
    view.setUint32(4, bytes.byteLength - 8, true);
    let offset = 12;
    while (offset + 8 <= bytes.byteLength) {
        const size = view.getUint32(offset + 4, true);
        if (readFour(bytes, offset) === 'data') {
            view.setUint32(offset + 4, bytes.byteLength - (offset + 8), true);
            break;
        }
        const step = 8 + size + (size % 2);
        if (step <= 0) break;
        offset += step;
    }
    return bytes.buffer;
}

type WavPcm = {
    samples: Int16Array;
    channels: number;
    sampleRate: number;
};

function extractWavPcm(input: ArrayBuffer): WavPcm | null {
    const repaired = repairWavSizes(input);
    if (repaired.byteLength < 44) return null;
    const bytes = new Uint8Array(repaired);
    if (readFour(bytes, 0) !== 'RIFF' || readFour(bytes, 8) !== 'WAVE') return null;
    const view = new DataView(repaired);
    let offset = 12;
    let channels = 1;
    let sampleRate = DEFAULT_PCM_RATE;
    let bits = 16;
    let dataOff = -1;
    let dataSize = 0;
    while (offset + 8 <= bytes.byteLength) {
        const id = readFour(bytes, offset);
        let size = view.getUint32(offset + 4, true);
        const dataStart = offset + 8;
        if (dataStart + size > bytes.byteLength) size = bytes.byteLength - dataStart;
        if (id === 'fmt ' && size >= 16) {
            channels = Math.max(1, view.getUint16(dataStart + 2, true));
            sampleRate = view.getUint32(dataStart + 4, true) || DEFAULT_PCM_RATE;
            bits = view.getUint16(dataStart + 14, true);
        }
        if (id === 'data') {
            dataOff = dataStart;
            dataSize = size;
            break;
        }
        const step = 8 + size + (size % 2);
        if (step <= 0) break;
        offset += step;
    }
    if (dataOff < 0 || bits !== 16) return null;
    const frameBytes = channels * 2;
    const aligned = dataSize - (dataSize % frameBytes);
    if (aligned < frameBytes) return null;
    const copy = bytes.subarray(dataOff, dataOff + aligned);
    const samples = new Int16Array(copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength));
    return {samples, channels, sampleRate};
}

function toMono(samples: Int16Array, channels: number): Int16Array {
    if (channels <= 1) return samples;
    const frames = Math.floor(samples.length / channels);
    const out = new Int16Array(frames);
    for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += samples[i * channels + c] ?? 0;
        out[i] = Math.round(sum / channels);
    }
    return out;
}

function resampleMono(input: Int16Array, fromRate: number, toRate: number): Int16Array {
    if (fromRate === toRate || fromRate <= 0) return input;
    const outLen = Math.max(1, Math.round(input.length * toRate / fromRate));
    const out = new Int16Array(outLen);
    const ratio = fromRate / toRate;
    for (let i = 0; i < outLen; i++) {
        const src = i * ratio;
        const i0 = Math.min(input.length - 1, Math.floor(src));
        const i1 = Math.min(input.length - 1, i0 + 1);
        const frac = src - i0;
        out[i] = Math.round((input[i0] ?? 0) * (1 - frac) + (input[i1] ?? 0) * frac);
    }
    return out;
}

function pcmBytes(samples: Int16Array): ArrayBuffer {
    const copy = new Uint8Array(samples.byteLength);
    copy.set(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength));
    return copy.buffer;
}

function withTencentPrefix(data: Uint8Array): Uint8Array {
    if (data.length > 0 && data[0] === 0x02) return data;
    const prefixed = new Uint8Array(data.length + 1);
    prefixed[0] = 0x02;
    prefixed.set(data, 1);
    return prefixed;
}

function hideNodeRuntime(): () => void {
    const versions = (globalThis as {process?: {versions?: ProcessVersions}}).process?.versions;
    const original = versions?.node;
    if (versions) {
        try {
            versions.node = undefined;
        } catch {
            // Cloudflare may freeze process.versions.
        }
    }
    return () => {
        if (!versions) return;
        try {
            versions.node = original;
        } catch {
            // ignore
        }
    };
}

/**
 * Worker 禁止运行时编译 wasm 字节（wasmBinary / instantiate(ArrayBuffer) 都会炸）。
 * 用 wrangler CompiledWasm 预编译的 Module，走 emscripten instantiateWasm。
 */
function installSilkWasmLoader(): () => void {
    const proto = Object.prototype as EmscriptenProto;
    const hadLocate = Object.prototype.hasOwnProperty.call(proto, 'locateFile');
    const hadInstantiate = Object.prototype.hasOwnProperty.call(proto, 'instantiateWasm');
    const prevLocate = proto.locateFile;
    const prevInstantiate = proto.instantiateWasm;
    proto.locateFile = () => 'https://silk-wasm.local/silk.wasm';
    proto.instantiateWasm = (imports, callback) => {
        void WebAssembly.instantiate(silkWasm, imports).then((instance) => {
            callback(instance, silkWasm);
        });
    };
    return () => {
        if (hadLocate) proto.locateFile = prevLocate;
        else delete proto.locateFile;
        if (hadInstantiate) proto.instantiateWasm = prevInstantiate;
        else delete proto.instantiateWasm;
    };
}

function splitMono(samples: Int16Array): Int16Array[] {
    if (samples.length <= MAX_VOICE_SAMPLES) return [samples];
    const chunks: Int16Array[] = [];
    for (let offset = 0; offset < samples.length; offset += MAX_VOICE_SAMPLES) {
        chunks.push(samples.slice(offset, Math.min(samples.length, offset + MAX_VOICE_SAMPLES)));
    }
    return chunks;
}

function asSilkPart(data: Uint8Array, durationMs: number): EncodedSilk {
    const prefixed = withTencentPrefix(data);
    return {data: prefixed, durationMs: Math.max(1000, getDuration(prefixed) || durationMs)};
}

function silkConvertEndpoint(env?: Env): string | null {
    const raw = env?.SILK_CONVERT_URL?.trim();
    if (raw && ['0', 'false', 'off', 'no', '关'].includes(raw.toLowerCase())) return null;
    return raw || DEFAULT_SILK_CONVERT_URL;
}

function looksLikeHttp(value: string): boolean {
    const lower = value.trim().toLowerCase();
    return lower.startsWith('http://') || lower.startsWith('https://');
}

function pickConvertUrl(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';
    const rec = payload as Record<string, unknown>;
    const nested = rec.data && typeof rec.data === 'object' && !Array.isArray(rec.data)
        ? rec.data as Record<string, unknown>
        : undefined;
    for (const value of [rec.silkUrl, rec.silk_url, rec.url, rec.audioUrl, nested?.silkUrl, nested?.silk_url, nested?.url]) {
        if (typeof value === 'string' && looksLikeHttp(value)) return value.trim();
    }
    return '';
}

async function bytesFromConvertResponse(response: Response): Promise<Uint8Array | null> {
    const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || '';
    if (type.includes('json')) {
        const payload = await response.json();
        const silkUrl = pickConvertUrl(payload);
        if (!silkUrl) return null;
        const file = await fetch(silkUrl);
        if (!file.ok) return null;
        const bytes = new Uint8Array(await file.arrayBuffer());
        return bytes.byteLength ? bytes : null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength ? bytes : null;
}

async function convertViaRemote(audioUrl: string, convertUrl: string): Promise<EncodedSilk | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONVERT_TIMEOUT_MS);
    try {
        const response = await fetch(convertUrl, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({audioUrl}),
            signal: controller.signal,
        });
        if (!response.ok) {
            logger.warn('远程转 silk 失败', {status: response.status, convertUrl, audioUrl});
            return null;
        }
        const bytes = await bytesFromConvertResponse(response);
        if (!bytes || !isSilk(bytes)) {
            logger.warn('远程转 silk 不是 silk', {bytes: bytes?.byteLength ?? 0, convertUrl, audioUrl});
            return null;
        }
        return asSilkPart(bytes, 0);
    } catch (error) {
        logger.warn('远程转 silk 异常', {
            convertUrl,
            audioUrl,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function toVoiceParts(parts: EncodedSilk[]): EncodedSilkVoice[] {
    return parts.map((part) => ({
        blob: new Blob([new Uint8Array(part.data)], {type: 'application/octet-stream'}),
        durationMs: part.durationMs,
        format: WECHAT_VOICE_SILK_FORMAT,
    }));
}

async function encodeMonoChunks(mono: Int16Array): Promise<EncodedSilk[]> {
    const parts: EncodedSilk[] = [];
    for (const chunk of splitMono(mono)) {
        const encoded = await encode(pcmBytes(chunk), DEFAULT_PCM_RATE);
        const fromPcm = Math.round((chunk.length / DEFAULT_PCM_RATE) * 1000);
        parts.push(asSilkPart(encoded.data, Math.max(encoded.duration, fromPcm)));
    }
    return parts;
}

/** 本地 wasm 转 SILK。已是 SILK 则原样加上腾讯头。 */
export async function encodeAudioBytesToSilk(bytes: ArrayBuffer): Promise<EncodedSilk[]> {
    const restoreNode = hideNodeRuntime();
    const restoreLoader = installSilkWasmLoader();
    try {
        if (isSilk(bytes)) {
            return [asSilkPart(new Uint8Array(bytes), 0)];
        }
        const wav = extractWavPcm(bytes);
        if (wav) {
            const mono = resampleMono(toMono(wav.samples, wav.channels), wav.sampleRate, DEFAULT_PCM_RATE);
            return encodeMonoChunks(mono);
        }
        const repaired = repairWavSizes(bytes);
        const encoded = readFour(new Uint8Array(repaired), 0) === 'RIFF'
            ? await encode(repaired, 0)
            : await encode(bytes, DEFAULT_PCM_RATE);
        return [asSilkPart(encoded.data, encoded.duration)];
    } finally {
        restoreLoader();
        restoreNode();
    }
}

/**
 * 音频 URL → 微信 SILK。优先远程转换接口，接口报错或不是 SILK 再走本地 wasm。
 * 超过 60 秒时本地路径会按气泡上限切开。
 */
export async function encodeAudioUrlToSilk(url: string, env?: Env): Promise<EncodedSilkVoice[]> {
    const convertUrl = silkConvertEndpoint(env);
    if (convertUrl) {
        const remote = await convertViaRemote(url, convertUrl);
        if (remote) {
            logger.warn('语音已转 silk', {
                via: 'remote',
                url,
                silkBytes: remote.data.byteLength,
                durationMs: remote.durationMs,
            });
            return toVoiceParts([remote]);
        }
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`download voice failed status=${response.status} url=${url}`);
    }
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength) {
        throw new Error(`download voice empty url=${url}`);
    }
    try {
        const parts = await encodeAudioBytesToSilk(bytes);
        logger.warn('语音已转 silk', {
            via: 'local',
            url,
            wavBytes: bytes.byteLength,
            chunks: parts.map((part) => ({bytes: part.data.byteLength, durationMs: part.durationMs})),
        });
        return toVoiceParts(parts);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`silk encode failed bytes=${bytes.byteLength} url=${url} reason=${reason}`);
    }
}
