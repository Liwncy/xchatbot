import type {
    ApiResponse,
    CdnDownloadImageParam,
    CdnDownloadMomentsVideoParam,
    CdnDownloadVideoParam,
} from './types.js';

const BROWSER_LIKE_HEADERS: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
};

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;
type QueryInput = object;
type BinaryLike = Blob | string;
const MULTIPART_ENCODER = new TextEncoder();

export function resolveVoiceBinaryMeta(format: number): {fileName: string; mimeType: string} {
    switch (format) {
        case 0:
            return {fileName: 'voice.amr', mimeType: 'audio/amr'};
        case 1:
            return {fileName: 'voice.spx', mimeType: 'audio/x-speex'};
        case 2:
            return {fileName: 'voice.mp3', mimeType: 'audio/mpeg'};
        case 3:
            return {fileName: 'voice.wav', mimeType: 'audio/wav'};
        case 4:
            return {fileName: 'voice.silk', mimeType: 'application/octet-stream'};
        default:
            return {fileName: 'voice.dat', mimeType: 'application/octet-stream'};
    }
}

export class WechatApiClient {
    private readonly baseUrl: string;
    private readonly requestHeaders: Record<string, string>;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.requestHeaders = {
            ...BROWSER_LIKE_HEADERS,
            Referer: this.baseUrl,
        };
    }

    protected buildPath(pathTemplate: string, pathParams?: QueryParams): string {
        let path = pathTemplate;
        for (const [key, value] of Object.entries(pathParams ?? {})) {
            if (value === undefined || value === null) continue;
            path = path.replace(new RegExp(`\\{${key}\\}`, 'g'), encodeURIComponent(String(value)));
        }
        return path;
    }

    protected buildUrl(path: string, params?: QueryInput): URL {
        const url = new URL(`${this.baseUrl}${path}`);
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v === undefined || v === null) continue;
                url.searchParams.set(k, String(v));
            }
        }
        return url;
    }

    protected async requestRaw(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        path: string,
        options?: {
            query?: QueryInput;
            body?: unknown;
            headers?: Record<string, string>;
        },
    ): Promise<Response> {
        const url = this.buildUrl(path, options?.query);
        const headers: Record<string, string> = {
            ...this.requestHeaders,
            ...options?.headers,
        };

        let body: BodyInit | undefined;
        if (options && 'body' in options && options.body !== undefined) {
            const payload = options.body;
            if (
                (typeof FormData !== 'undefined' && payload instanceof FormData)
                || (typeof Blob !== 'undefined' && payload instanceof Blob)
                || (typeof URLSearchParams !== 'undefined' && payload instanceof URLSearchParams)
                || typeof payload === 'string'
            ) {
                body = payload as BodyInit;
            } else {
                headers['Content-Type'] = 'application/json';
                body = JSON.stringify(payload);
            }
        }

        return fetch(url.toString(), {
            method,
            headers,
            body,
        });
    }

    protected async parseJsonResponse<T>(path: string, res: Response): Promise<T> {
        const raw = await res.text();

        try {
            return JSON.parse(raw) as T;
        } catch {
            const compact = raw.replace(/\s+/g, ' ').trim();
            throw new Error(`WechatApi ${path} returned non-JSON response (status ${res.status}): ${compact}`);
        }
    }

    protected async getBinary(path: string, params?: QueryInput): Promise<ArrayBuffer> {
        const res = await this.requestRaw('GET', path, {query: params});
        if (!res.ok) {
            const raw = await res.text();
            const compact = raw.replace(/\s+/g, ' ').trim();
            throw new Error(`WechatApi ${path} returned status ${res.status}: ${compact}`);
        }
        return res.arrayBuffer();
    }

    protected async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
        const res = await this.requestRaw('POST', path, {body});
        return this.parseApiResponse<T>(path, res);
    }

    protected async postForm<T>(path: string, formData: FormData): Promise<ApiResponse<T>> {
        const res = await this.requestRaw('POST', path, {body: formData});
        return this.parseApiResponse<T>(path, res);
    }

    protected async postMultipartBody<T>(path: string, body: Blob, boundary: string): Promise<ApiResponse<T>> {
        const res = await this.requestRaw('POST', path, {
            body,
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
        });
        return this.parseApiResponse<T>(path, res);
    }

    protected async get<T>(path: string, params?: QueryInput): Promise<ApiResponse<T>> {
        const res = await this.requestRaw('GET', path, {query: params});
        return this.parseApiResponse<T>(path, res);
    }

    protected async postQuery<T>(path: string, params?: QueryInput): Promise<ApiResponse<T>> {
        const res = await this.requestRaw('POST', path, {query: params});
        return this.parseApiResponse<T>(path, res);
    }

    protected async put<T>(path: string, body?: unknown, params?: QueryInput): Promise<ApiResponse<T>> {
        const res = await this.requestRaw('PUT', path, {query: params, body});
        return this.parseApiResponse<T>(path, res);
    }

    protected async delete<T>(path: string, body?: unknown, params?: QueryInput): Promise<ApiResponse<T>> {
        const res = await this.requestRaw('DELETE', path, {query: params, body});
        return this.parseApiResponse<T>(path, res);
    }

    protected buildMultipartFormData(fields: Array<[string, string | number | undefined]>, appendBinary?: (formData: FormData) => void): FormData {
        const formData = new FormData();
        for (const [key, value] of fields) {
            if (value === undefined || value === null) continue;
            formData.set(key, String(value));
        }
        appendBinary?.(formData);
        return formData;
    }

    protected appendBinaryInput(
        formData: FormData,
        fieldName: string,
        input: BinaryLike | undefined,
        fileName: string,
        mimeType: string,
    ): void {
        if (input == null) return;
        if (typeof Blob !== 'undefined' && input instanceof Blob) {
            formData.set(fieldName, input, fileName);
            return;
        }
        const blob = this.base64ToBlob(String(input), mimeType);
        formData.set(fieldName, blob, fileName);
    }

    protected async buildMultipartBody(
        fields: Array<[string, string | number | undefined]>,
        binary?: {
            fieldName: string;
            input?: BinaryLike;
            fileName: string;
            mimeType: string;
        },
    ): Promise<{body: Blob; boundary: string}> {
        const boundary = `----xchatbot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const chunks: Array<Blob | Uint8Array | string> = [];

        for (const [key, value] of fields) {
            if (value === undefined || value === null) continue;
            chunks.push(MULTIPART_ENCODER.encode(`--${boundary}\r\n`));
            chunks.push(MULTIPART_ENCODER.encode(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
            chunks.push(MULTIPART_ENCODER.encode(`${String(value)}\r\n`));
        }

        if (binary?.input != null) {
            const fileBlob = typeof binary.input === 'string'
                ? this.base64ToBlob(binary.input, binary.mimeType)
                : binary.input;
            chunks.push(MULTIPART_ENCODER.encode(`--${boundary}\r\n`));
            chunks.push(MULTIPART_ENCODER.encode(
                `Content-Disposition: form-data; name="${binary.fieldName}"; filename="${binary.fileName}"\r\n`,
            ));
            chunks.push(MULTIPART_ENCODER.encode(`Content-Type: ${fileBlob.type || binary.mimeType}\r\n\r\n`));
            chunks.push(fileBlob);
            chunks.push(MULTIPART_ENCODER.encode('\r\n'));
        }

        chunks.push(MULTIPART_ENCODER.encode(`--${boundary}--\r\n`));
        return {
            body: new Blob(chunks, {type: `multipart/form-data; boundary=${boundary}`}),
            boundary,
        };
    }

    protected base64ToBlob(base64: string, mimeType: string): Blob {
        const normalized = this.normalizeBase64Input(base64);
        const bytes = this.decodeBase64(normalized.base64);
        return new Blob([bytes], {type: normalized.mimeType || mimeType});
    }

    protected normalizeBase64Input(input: string): {base64: string; mimeType?: string} {
        const trimmed = input.trim();
        const dataUrlMatch = trimmed.match(/^data:([^;,]+)?;base64,(.+)$/i);
        if (dataUrlMatch) {
            return {
                mimeType: dataUrlMatch[1]?.trim() || undefined,
                base64: dataUrlMatch[2].trim(),
            };
        }
        return {base64: trimmed};
    }

    protected decodeBase64(base64: string): Uint8Array {
        if (typeof atob === 'function') {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) {
                bytes[index] = binary.charCodeAt(index);
            }
            return bytes;
        }
        const bufferCtor = (globalThis as typeof globalThis & {Buffer?: {from(input: string, encoding: string): Uint8Array}}).Buffer;
        if (bufferCtor) {
            return Uint8Array.from(bufferCtor.from(base64, 'base64'));
        }
        throw new Error('Base64 decode unavailable in current runtime');
    }

    protected encodeBase64(buffer: ArrayBuffer): string {
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

    protected resolveImageDownloadQuery(params: CdnDownloadImageParam): {id: string; key: string} {
        return {id: params.id, key: params.key};
    }

    protected resolveVideoDownloadQuery(params: CdnDownloadVideoParam): {id: string; key: string} {
        return {id: params.id, key: params.key};
    }

    protected resolveMomentsVideoDownloadQuery(params: CdnDownloadMomentsVideoParam): {url: string; key: string} {
        return {url: params.url, key: params.key};
    }

    protected async getJson<T>(path: string, params?: QueryParams): Promise<T> {
        const res = await this.requestRaw('GET', path, {query: params});
        return this.parseJsonResponse<T>(path, res);
    }

    protected async getText(path: string, params?: QueryParams): Promise<string> {
        const res = await this.requestRaw('GET', path, {query: params});
        return res.text();
    }

    protected async parseApiResponse<T>(path: string, res: Response): Promise<ApiResponse<T>> {
        return this.parseJsonResponse<ApiResponse<T>>(path, res);
    }
}

