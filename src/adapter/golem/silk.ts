import {encode, getDuration, isSilk, isWav} from 'silk-wasm';
import silkWasm from 'silk-wasm/lib/silk.wasm';

const SILK_FORMAT = 4;
const DEFAULT_PCM_RATE = 24000;

type ProcessVersions = {node?: unknown};

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
    for (let offset = 12; offset + 8 <= bytes.byteLength; offset += 1) {
        if (readFour(bytes, offset) !== 'data') continue;
        view.setUint32(offset + 4, bytes.byteLength - (offset + 8), true);
        break;
    }
    return bytes.buffer;
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
            // Cloudflare may freeze process.versions; encode then falls back to fetch.
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

function patchWasmFetch(): () => void {
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string'
            ? input
            : input instanceof URL
                ? input.href
                : input instanceof Request
                    ? input.url
                    : String(input);
        if (url.includes('.wasm') || url.includes('silk')) {
            return Promise.resolve(new Response(silkWasm, {
                status: 200,
                headers: {'Content-Type': 'application/wasm'},
            }));
        }
        return originalFetch(input, init);
    };
    return () => {
        globalThis.fetch = originalFetch;
    };
}

async function encodePcmOrWav(bytes: ArrayBuffer): Promise<{data: Uint8Array; duration: number}> {
    const restoreNode = hideNodeRuntime();
    const restoreFetch = patchWasmFetch();
    try {
        const repaired = repairWavSizes(bytes);
        const sampleRate = isWav(repaired) ? 0 : DEFAULT_PCM_RATE;
        return await encode(repaired, sampleRate);
    } finally {
        restoreFetch();
        restoreNode();
    }
}

export async function toGolemSilk(bytes: ArrayBuffer): Promise<{data: Uint8Array; durationMs: number}> {
    if (isSilk(bytes)) {
        const data = withTencentPrefix(new Uint8Array(bytes));
        return {data, durationMs: Math.max(1000, getDuration(data))};
    }
    const encoded = await encodePcmOrWav(bytes);
    return {
        data: withTencentPrefix(encoded.data),
        durationMs: Math.max(1000, encoded.duration),
    };
}

export async function fetchAndEncodeGolemVoice(url: string): Promise<{
    blob: Blob;
    durationMs: number;
    format: number;
}> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`download voice failed status=${response.status}`);
    }
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength) {
        throw new Error('download voice empty');
    }
    const silk = await toGolemSilk(bytes);
    return {
        blob: new Blob([new Uint8Array(silk.data)], {type: 'application/octet-stream'}),
        durationMs: silk.durationMs,
        format: SILK_FORMAT,
    };
}
