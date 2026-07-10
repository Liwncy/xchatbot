import {logger} from '../../utils/logger';
import {arrayBufferToBase64} from '../../utils/binary';
import {parseMp4DurationSeconds} from '../../utils/video-duration';

export type SharedRequestMode = 'text' | 'base64' | 'json';

export interface TemplatedRequestSpec {
    url: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: unknown;
    mode: SharedRequestMode;
    jsonPath?: string;
    /** 单次请求超时（毫秒）；未设置时默认 15s。 */
    timeoutMs?: number;
}

interface LinkReplySource {
    keyword?: string | string[];
    linkTitle?: string;
    linkDescription?: string;
    linkPicUrl?: string;
}

export type MediaPayloadKind = 'image' | 'video' | 'audio';

export interface MediaPayloadOptions {
    expectedKind?: MediaPayloadKind;
}

export interface MediaPayloadResult {
    payload: string;
    durationSeconds?: number;
    contentType?: string;
    actualKind?: MediaPayloadKind | null;
    size?: number;
}

function toTemplateString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value === undefined || value === null) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return '';
    }
}

function firstKeywordText(keyword?: string | string[]): string {
    if (Array.isArray(keyword)) {
        return keyword.find((k) => k && k.trim())?.trim() ?? '链接消息';
    }
    return keyword?.trim() || '链接消息';
}

function toPathPieceString(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return '';
    }
}

function splitTopLevel(expr: string, separator: '+' | ','): string[] {
    const parts: string[] = [];
    let current = '';
    let quote: string | null = null;
    let depth = 0;

    for (let i = 0; i < expr.length; i += 1) {
        const ch = expr[i];

        if (quote) {
            if (ch === quote && expr[i - 1] !== '\\') quote = null;
            current += ch;
            continue;
        }

        if (ch === '"' || ch === "'") {
            quote = ch;
            current += ch;
            continue;
        }

        if (ch === '(') {
            depth += 1;
            current += ch;
            continue;
        }

        if (ch === ')') {
            if (depth > 0) depth -= 1;
            current += ch;
            continue;
        }

        if (ch === separator && depth === 0) {
            const trimmed = current.trim();
            if (trimmed) parts.push(trimmed);
            current = '';
            continue;
        }

        current += ch;
    }

    const tail = current.trim();
    if (tail) parts.push(tail);
    return parts;
}

function unquoteToken(token: string): string | null {
    const quoted = token.match(/^(['"])(.*)\1$/);
    if (!quoted) return null;

    const quote = quoted[1];
    const content = quoted[2];
    try {
        const normalized = quote === '"'
            ? `"${content}"`
            : `"${content.replace(/"/g, '\\"')}"`;
        return JSON.parse(normalized) as string;
    } catch {
        return content;
    }
}

function toArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    return value === undefined || value === null ? [] : [value];
}

function renderArrayItemTemplate(template: string, item: unknown, index: number): string {
    if (!item || typeof item !== 'object') return template;
    const obj = item as Record<string, unknown>;
    const indexText = String(index + 1);
    const normalizedTemplate = template
        .replace(/\{#}/g, indexText)
        .replace(/\{index}/gi, indexText)
        .replace(/\{i}/gi, indexText)
        .replace(/__index__/gi, indexText);

    return normalizedTemplate
        .replace(/\{([^{}]+)}/g, (_m, key: string) => {
            const value = getBySinglePath(obj, key.trim());
            return toPathPieceString(value);
        });
}

function evalPathToken(token: string, data: unknown): unknown {
    const literal = unquoteToken(token);
    if (literal !== null) return literal;

    const trimmed = token.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;

    return getBySinglePath(data, token);
}

function evalFunctionToken(token: string, data: unknown): unknown {
    const callMatch = token.match(/^([a-zA-Z_][\w]*)\((.*)\)$/);
    if (!callMatch) return undefined;

    const fnName = callMatch[1].toLowerCase();
    const argTokens = splitTopLevel(callMatch[2], ',');

    if (fnName === 'lines') {
        if (argTokens.length < 2) return '';
        const source = toArray(evalExprToken(argTokens[0], data));
        const template = toPathPieceString(evalExprToken(argTokens[1], data));
        const separator = argTokens[2] ? toPathPieceString(evalExprToken(argTokens[2], data)) : '\n';
        return source
            .map((item, idx) => renderArrayItemTemplate(template, item, idx))
            .join(separator);
    }

    if (fnName === 'join') {
        if (argTokens.length < 1) return '';
        const source = toArray(evalExprToken(argTokens[0], data)).map((v) => toPathPieceString(v));
        const separator = argTokens[1] ? toPathPieceString(evalExprToken(argTokens[1], data)) : '';
        return source.join(separator);
    }

    if (fnName === 'pick' || fnName === 'find') {
        if (argTokens.length < 3) return null;
        const source = toArray(evalExprToken(argTokens[0], data));
        const field = toPathPieceString(evalExprToken(argTokens[1], data)).trim();
        const expected = toPathPieceString(evalExprToken(argTokens[2], data)).trim();
        if (!field) return null;

        return source.find((item) => {
            if (!item || typeof item !== 'object') return false;
            const actual = toPathPieceString((item as Record<string, unknown>)[field]).trim();
            return actual === expected;
        }) ?? null;
    }

    if (fnName === 'get' || fnName === 'prop') {
        if (argTokens.length < 2) return undefined;
        const target = evalExprToken(argTokens[0], data);
        const field = toPathPieceString(evalExprToken(argTokens[1], data)).trim();
        if (!field || !target || typeof target !== 'object') return undefined;
        return (target as Record<string, unknown>)[field];
    }

    if (fnName === 'page') {
        if (argTokens.length < 1) return [];
        const source = toArray(evalExprToken(argTokens[0], data));
        const rawPage = argTokens[1] ? Number(evalExprToken(argTokens[1], data)) : 1;
        const rawSize = argTokens[2] ? Number(evalExprToken(argTokens[2], data)) : 10;

        const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
        const size = Number.isFinite(rawSize) ? Math.max(1, Math.floor(rawSize)) : 10;
        const start = (page - 1) * size;
        return source.slice(start, start + size);
    }

    if (fnName === 'take' || fnName === 'limit') {
        if (argTokens.length < 1) return [];
        const source = toArray(evalExprToken(argTokens[0], data));
        const rawCount = argTokens[1] ? evalExprToken(argTokens[1], data) : source.length;
        const count = Number(rawCount);
        if (!Number.isFinite(count)) return source;
        return source.slice(0, Math.max(0, Math.floor(count)));
    }

    return undefined;
}

function evalExprToken(token: string, data: unknown): unknown {
    const fnResult = evalFunctionToken(token, data);
    if (fnResult !== undefined) return fnResult;
    return evalPathToken(token, data);
}

function getBySinglePath(data: unknown, path: string): unknown {
    const normalized = path.replace(/^\$\.?/, '');
    if (!normalized) return data;

    const tokens = normalized.match(/[^.[\]]+|\[(\d+|x|\*)]/gi) ?? [];
    let current: unknown = data;

    for (const token of tokens) {
        if (current == null) return undefined;

        if (token.startsWith('[') && token.endsWith(']')) {
            if (!Array.isArray(current)) return undefined;
            const rawIndex = token.slice(1, -1).toLowerCase();

            if (rawIndex === '*') {
                continue;
            }

            const idx = rawIndex === 'x'
                ? (current.length ? Math.floor(Math.random() * current.length) : -1)
                : Number(rawIndex);

            if (!Number.isInteger(idx) || idx < 0) return undefined;
            current = current[idx];
            continue;
        }

        if (Array.isArray(current)) {
            current = current.flatMap((item) => {
                if (!item || typeof item !== 'object') return [];
                const value = (item as Record<string, unknown>)[token];
                if (value === undefined) return [];
                return Array.isArray(value) ? value : [value];
            });
            continue;
        }

        if (typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[token];
    }

    return current;
}

export function getByJsonPath(data: unknown, jsonPath: string): unknown {
    const expr = jsonPath.trim();
    if (!expr) return data;

    if (expr.includes('+')) {
        const parts = splitTopLevel(expr, '+');
        return parts.map((part) => {
            const token = part.trim();
            return toPathPieceString(evalExprToken(token, data));
        }).join('');
    }

    if (expr.includes(',')) {
        const parts = splitTopLevel(expr, ',');
        return parts.map((part) => evalExprToken(part.trim(), data));
    }

    return evalExprToken(expr, data);
}

export function normalizeBase64(value: string): string {
    const trimmed = value.trim();
    const match = trimmed.match(/^data:[^;]+;base64,(.+)$/i);
    return match?.[1] ?? trimmed;
}

export function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value.trim());
}

export function looksLikeBase64(value: string): boolean {
    const normalized = value.replace(/\s+/g, '');
    if (!normalized || normalized.length % 4 !== 0) return false;
    return /^[A-Za-z0-9+/=]+$/.test(normalized);
}

const MAX_MEDIA_SIZE = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const MIN_FETCH_TIMEOUT_MS = 1_000;
const MAX_FETCH_TIMEOUT_MS = 120_000;

function resolveFetchTimeoutMs(timeoutMs?: number): number {
    if (timeoutMs == null || !Number.isFinite(timeoutMs)) return FETCH_TIMEOUT_MS;
    return Math.min(MAX_FETCH_TIMEOUT_MS, Math.max(MIN_FETCH_TIMEOUT_MS, Math.floor(timeoutMs)));
}

function decodeBase64Head(base64: string, maxBytes = 64): Uint8Array | null {
    try {
        const normalized = normalizeBase64(base64).replace(/\s+/g, '');
        if (!normalized) return null;
        const approxChars = Math.ceil(maxBytes / 3) * 4;
        const chunk = normalized.slice(0, approxChars);
        const binary = atob(chunk);
        const length = Math.min(binary.length, maxBytes);
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    } catch {
        return null;
    }
}

function bytesAscii(bytes: Uint8Array, start: number, end: number): string {
    return Array.from(bytes.slice(start, end)).map((b) => String.fromCharCode(b)).join('');
}

function inferMediaKindFromBytes(bytes: Uint8Array | null): MediaPayloadKind | null {
    if (!bytes || bytes.length < 4) return null;

    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image';
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image';
    if (bytesAscii(bytes, 0, 4) === 'GIF8') return 'image';
    if (bytesAscii(bytes, 0, 4) === 'RIFF' && bytesAscii(bytes, 8, 12) === 'WEBP') return 'image';
    if (bytesAscii(bytes, 4, 8) === 'ftyp') return 'video';
    if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) return 'video';
    if (bytesAscii(bytes, 0, 4) === 'RIFF' && bytesAscii(bytes, 8, 12) === 'WAVE') return 'audio';
    if (bytesAscii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0)) return 'audio';
    if (bytesAscii(bytes, 0, 4) === '#!AM') return 'audio';
    if (bytesAscii(bytes, 0, 4) === 'OggS') return 'audio';

    return null;
}

function inferMediaKindFromContentType(contentType: string): MediaPayloadKind | null {
    const normalized = contentType.toLowerCase().trim();
    if (!normalized) return null;
    if (normalized.startsWith('image/')) return 'image';
    if (normalized.startsWith('video/') || normalized.includes('application/mp4') || normalized.includes('quicktime')) {
        return 'video';
    }
    if (normalized.startsWith('audio/')) return 'audio';
    return null;
}

function validateMediaKind(
    expectedKind: MediaPayloadKind | undefined,
    contentType: string,
    bytes: Uint8Array | null,
): {ok: boolean; actualKind: MediaPayloadKind | null; via: 'content-type' | 'signature' | 'unknown'} {
    if (!expectedKind) return {ok: true, actualKind: null, via: 'unknown'};

    const fromContentType = inferMediaKindFromContentType(contentType);
    if (fromContentType) {
        return {ok: fromContentType === expectedKind, actualKind: fromContentType, via: 'content-type'};
    }

    const fromBytes = inferMediaKindFromBytes(bytes);
    if (fromBytes) {
        return {ok: fromBytes === expectedKind, actualKind: fromBytes, via: 'signature'};
    }

    return {ok: false, actualKind: null, via: 'unknown'};
}

export async function toMediaPayloadResult(
    value: unknown,
    logPrefix: string,
    options?: MediaPayloadOptions,
): Promise<MediaPayloadResult | null> {
    const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
    if (!raw) return null;

    const normalized = normalizeBase64(raw);
    if (looksLikeBase64(normalized)) {
        const headBytes = decodeBase64Head(normalized);
        const validation = validateMediaKind(options?.expectedKind, '', headBytes);
        if (!validation.ok) {
            logger.warn(`${logPrefix}base64 媒体类型不匹配，已拒绝发送`, {
                expectedKind: options?.expectedKind,
                detectedKind: validation.actualKind,
                detectedBy: validation.via,
                base64Head: normalized.slice(0, 24),
            });
            return null;
        }
        return {
            payload: normalized,
            actualKind: validation.actualKind,
        };
    }

    if (isHttpUrl(raw)) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const res = await fetch(raw, {redirect: 'follow', signal: controller.signal});
            clearTimeout(timer);
            if (!res.ok) {
                logger.error(`${logPrefix}媒体下载失败`, {url: raw, status: res.status});
                return null;
            }

            const contentLength = Number(res.headers.get('content-length') ?? '0');
            if (contentLength > MAX_MEDIA_SIZE) {
                logger.warn(`${logPrefix}媒体文件过大，跳过下载`, {
                    url: raw,
                    size: contentLength,
                    limit: MAX_MEDIA_SIZE,
                });
                return null;
            }

            const buffer = await res.arrayBuffer();
            if (buffer.byteLength > MAX_MEDIA_SIZE) {
                logger.warn(`${logPrefix}媒体文件过大，跳过`, {
                    url: raw,
                    size: buffer.byteLength,
                    limit: MAX_MEDIA_SIZE,
                });
                return null;
            }

            if (buffer.byteLength === 0) {
                logger.warn(`${logPrefix}媒体下载到空内容`, {url: raw});
                return null;
            }

            const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
            const headBytes = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 64)));
            const validation = validateMediaKind(options?.expectedKind, contentType, headBytes);
            const durationSeconds = validation.actualKind === 'video' ? parseMp4DurationSeconds(buffer) : undefined;
            if (!validation.ok) {
                logger.warn(`${logPrefix}媒体类型不匹配，已拒绝发送`, {
                    url: raw,
                    expectedKind: options?.expectedKind,
                    detectedKind: validation.actualKind,
                    detectedBy: validation.via,
                    contentType,
                    size: buffer.byteLength,
                });
                return null;
            }
            logger.debug(`${logPrefix}媒体下载成功`, {
                url: raw,
                size: buffer.byteLength,
                contentType,
                detectedKind: validation.actualKind,
                detectedBy: validation.via,
                durationSeconds,
            });

            return {
                payload: arrayBufferToBase64(buffer),
                durationSeconds,
                contentType,
                actualKind: validation.actualKind,
                size: buffer.byteLength,
            };
        } catch (err) {
            clearTimeout(timer);
            const isTimeout = err instanceof Error && err.name === 'AbortError';
            logger.error(`${logPrefix}媒体下载异常`, {
                url: raw,
                error: isTimeout ? `超时（>${FETCH_TIMEOUT_MS}ms）` : (err instanceof Error ? err.message : String(err)),
            });
            return null;
        }
    }

    return {
        payload: normalized,
    };
}

export async function toMediaPayload(value: unknown, logPrefix: string, options?: MediaPayloadOptions): Promise<string | null> {
    const result = await toMediaPayloadResult(value, logPrefix, options);
    return result?.payload ?? null;
}

export async function extractValueByMode(
    response: Response,
    mode: SharedRequestMode,
    jsonPath?: string,
    templateParams?: Record<string, string>,
): Promise<unknown> {
    if (mode === 'text') return response.text();

    if (mode === 'base64') {
        const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
        if (contentType.includes('application/json') || contentType.startsWith('text/')) {
            return normalizeBase64(await response.text());
        }
        return arrayBufferToBase64(await response.arrayBuffer());
    }

    const payload = (await response.json()) as unknown;
    if (!jsonPath) return payload;

    if (payload && typeof payload === 'object') {
        (payload as Record<string, unknown>).__params = templateParams ?? {};
        return getByJsonPath(payload, jsonPath);
    }

    return getByJsonPath({value: payload, __params: templateParams ?? {}}, jsonPath);
}

export function toLinkReply(source: LinkReplySource, value: unknown) {
    const keywordText = firstKeywordText(source.keyword);
    const defaultTitle = source.linkTitle?.trim() || keywordText;
    const defaultDescription = source.linkDescription?.trim() || `${keywordText}的链接`;

    if (typeof value === 'string') {
        const url = value.trim();
        if (!url) return null;
        return {
            type: 'news' as const,
            articles: [
                {
                    title: defaultTitle,
                    description: defaultDescription,
                    url,
                    picUrl: source.linkPicUrl ?? '',
                },
            ],
        };
    }

    if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const url = typeof obj.url === 'string' ? obj.url.trim() : '';
        if (!url) return null;
        return {
            type: 'news' as const,
            articles: [
                {
                    title: (typeof obj.title === 'string' && obj.title.trim()) || defaultTitle,
                    description:
                        (typeof obj.description === 'string' && obj.description.trim()) || defaultDescription,
                    url,
                    picUrl: (typeof obj.picUrl === 'string' && obj.picUrl.trim()) || source.linkPicUrl || '',
                },
            ],
        };
    }

    return null;
}

export function renderTemplateString(value: string, params: Record<string, string>, encode = false): string {
    const renderValue = (key: string) => {
        const raw = params[key] ?? '';
        return encode ? encodeURIComponent(raw) : raw;
    };

    return value
        .replace(/{{\s*([\w.-]+)\s*}}/g, (_m, key: string) => renderValue(key))
        .replace(/__([\w.-]+)__/g, (_m, key: string) => renderValue(key));
}

export function renderTemplateValue(value: unknown, params: Record<string, string>, encodeUrl = false): unknown {
    if (typeof value === 'string') return renderTemplateString(value, params, encodeUrl);
    if (Array.isArray(value)) return value.map((v) => renderTemplateValue(v, params, false));

    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = renderTemplateValue(v, params, false);
        }
        return out;
    }

    return value;
}

export function mergeTemplateParams(base: Record<string, string>, context: Record<string, unknown>): Record<string, string> {
    const merged: Record<string, string> = {...base};
    for (const [key, value] of Object.entries(context)) {
        merged[key] = toTemplateString(value);
    }
    return merged;
}

export async function fetchTemplatedValue(
    request: TemplatedRequestSpec,
    params: Record<string, string>,
    errorPrefix: string,
): Promise<unknown> {
    const method = request.method ?? 'GET';
    const headers = request.headers
        ? (renderTemplateValue(request.headers, params, false) as Record<string, string>)
        : undefined;

    const requestInit: RequestInit = {method, headers};
    if (method === 'POST' && request.body !== undefined) {
        const renderedBody = renderTemplateValue(request.body, params, false);
        const isStringBody = typeof renderedBody === 'string';
        requestInit.body = typeof renderedBody === 'string'
            ? renderedBody
            : JSON.stringify(renderedBody);
        if (!requestInit.headers) requestInit.headers = {};
        if (!isStringBody && !(requestInit.headers as Record<string, string>)['Content-Type']) {
            (requestInit.headers as Record<string, string>)['Content-Type'] = 'application/json';
        }
    }

    const renderedUrl = renderTemplateString(request.url, params, true);
    const timeoutMs = resolveFetchTimeoutMs(request.timeoutMs);

    logger.debug(`${errorPrefix}发起请求`, {
        targetUrl: renderedUrl,
        finalUrl: renderedUrl,
        timeoutMs,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    requestInit.signal = controller.signal;

    let response: Response;
    try {
        response = await fetch(renderedUrl, requestInit);
    } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === 'AbortError') {
            throw new Error(`${errorPrefix}请求超时（>${timeoutMs}ms） url=${renderedUrl}`);
        }
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`${errorPrefix}网络请求异常 url=${renderedUrl} reason=${msg}`);
    } finally {
        clearTimeout(timer);
    }

    if (!response.ok) {
        let body = '';
        try {
            body = (await response.text()).slice(0, 500);
        } catch {
            // 忽略读取失败
        }
        throw new Error(`${errorPrefix}请求失败 status=${response.status} url=${renderedUrl} body=${body}`);
    }

    try {
        return await extractValueByMode(response, request.mode, request.jsonPath, params);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`${errorPrefix}响应解析失败 url=${renderedUrl} reason=${msg}`);
    }
}


