import {arrayBufferToBase64} from './binary.js';

const DEFAULT_IMAGE_FETCH_TIMEOUT_MS = 45_000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export async function fetchImageAsBase64FromUrl(
    url: string,
    timeoutMs: number = DEFAULT_IMAGE_FETCH_TIMEOUT_MS,
): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {Accept: 'image/*,*/*'},
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`图片下载失败 status=${response.status}`);
        }

        const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
        if (contentType && !contentType.includes('image/')) {
            throw new Error(`图片链接返回非图片 content-type=${contentType}`);
        }

        const buffer = await response.arrayBuffer();
        if (!buffer.byteLength) {
            throw new Error('图片链接返回空内容');
        }
        if (buffer.byteLength > MAX_IMAGE_BYTES) {
            throw new Error(`图片过大 size=${buffer.byteLength}`);
        }

        return arrayBufferToBase64(buffer);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`图片下载超时 timeoutMs=${timeoutMs}`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}
