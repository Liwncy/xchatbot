import {logger} from '../../utils/logger';
import {arrayBufferToBase64} from '../../utils/binary';

export type SharedRequestMode = 'text' | 'base64' | 'json';

export interface TemplatedRequestSpec {
    url: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: unknown;
    mode: SharedRequestMode;
    jsonPath?: string;
}

interface LinkReplySource {
    keyword?: string | string[];
    linkTitle?: string;
    linkDescription?: string;
    linkPicUrl?: string;
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
        // 复用 JSON 字符串转义规则，支持 \n / \t / \" 等常见转义。
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
        // 兼容旧写法
        .replace(/\{#\}/g, indexText)
        // 新增更易读写法
        .replace(/\{index\}/gi, indexText)
        .replace(/\{i\}/gi, indexText)
        // 新增无花括号写法，避免与某些配置平台模板语法冲突
        .replace(/__index__/gi, indexText);

    return normalizedTemplate
        .replace(/\{([^{}]+)\}/g, (_m, key: string) => {
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

    // 截取前 N 项：take($.data, 10) / limit($.data, 10)
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

/**
 * 提取简化单一路径：
 * - `a.b[0].c` 固定索引
 * - `a.b[x].c` 随机索引
 * - `a.b[*].c` 全量数组
 * - `a.b.c` 自动对数组元素取同名字段（无需显式下标）
 */
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
                current = current;
                continue;
            }

            const idx = rawIndex === 'x'
                ? (current.length ? Math.floor(Math.random() * current.length) : -1)
                : Number(rawIndex);

            if (!Number.isInteger(idx) || idx < 0) return undefined;
            current = current[idx];
            continue;
        }

        // 自动数组映射：当当前节点是数组且访问对象字段时，逐项提取该字段。
        if (Array.isArray(current)) {
            const picked = current.flatMap((item) => {
                if (!item || typeof item !== 'object') return [];
                const value = (item as Record<string, unknown>)[token];
                if (value === undefined) return [];
                return Array.isArray(value) ? value : [value];
            });
            current = picked;
            continue;
        }

        if (typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[token];
    }

    return current;
}

/**
 * 提取扩展 JSONPath：
 * - 单路径：`$.a.b[0]`
 * - 拼接：`$.a + $.b.c`
 * - 同级多字段：`$.a,$.b.c`
 */
export function getByJsonPath(data: unknown, jsonPath: string): unknown {
    const expr = jsonPath.trim();
    if (!expr) return data;

    // `a + b + c` => 拼接字符串。
    if (expr.includes('+')) {
        const parts = splitTopLevel(expr, '+');
        return parts.map((part) => {
            const token = part.trim();
            return toPathPieceString(evalExprToken(token, data));
        }).join('');
    }

    // `a,b,c` => 同级多字段并列返回数组。
    if (expr.includes(',')) {
        const parts = splitTopLevel(expr, ',');
        return parts.map((part) => evalExprToken(part.trim(), data));
    }

    return evalExprToken(expr, data);
}

/** 去除 data-url 前缀并返回纯 base64。 */
export function normalizeBase64(value: string): string {
    const trimmed = value.trim();
    const match = trimmed.match(/^data:[^;]+;base64,(.+)$/i);
    return match?.[1] ?? trimmed;
}

/** 判断值是否为 http/https URL。 */
export function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value.trim());
}

/** 粗略判断字符串是否为 base64。 */
export function looksLikeBase64(value: string): boolean {
    const normalized = value.replace(/\s+/g, '');
    if (!normalized || normalized.length % 4 !== 0) return false;
    return /^[A-Za-z0-9+/=]+$/.test(normalized);
}

/** 单个媒体文件的大小上限（20 MB），超过此值网关大概率拒绝。 */
const MAX_MEDIA_SIZE = 20 * 1024 * 1024;

/**
 * 将返回值标准化为媒体可发送 payload（优先复用 base64，否则下载 URL 转 base64）。
 *
 * 下载时会检查文件大小，超过限制则跳过。
 */
export async function toMediaPayload(value: unknown, logPrefix: string): Promise<string | null> {
    const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
    if (!raw) return null;

    const normalized = normalizeBase64(raw);
    if (looksLikeBase64(normalized)) return normalized;

    if (isHttpUrl(raw)) {
        try {
            const res = await fetch(raw, {redirect: 'follow'});
            if (!res.ok) {
                logger.error(`${logPrefix}媒体下载失败`, {url: raw, status: res.status});
                return null;
            }

            // 检查 Content-Length，超过上限直接跳过以免浪费流量和超时
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
            logger.debug(`${logPrefix}媒体下载成功`, {
                url: raw,
                size: buffer.byteLength,
                contentType,
            });

            return arrayBufferToBase64(buffer);
        } catch (err) {
            logger.error(`${logPrefix}媒体下载异常`, {
                url: raw,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    }

    return normalized;
}

/** 按 mode 统一提取响应值。 */
export async function extractValueByMode(
    response: Response,
    mode: SharedRequestMode,
    jsonPath?: string,
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
    return getByJsonPath(payload, jsonPath);
}

/** 统一构建 link(news) 回复，支持字符串 URL 或对象结构。 */
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

/**
 * 字符串模板替换：支持 `{{var}}` 与 `__var__`。
 *
 * `__var__` 主要用于某些配置平台不允许出现 `{{` / `}}` 的场景。
 */
export function renderTemplateString(value: string, params: Record<string, string>, encode = false): string {
    const renderValue = (key: string) => {
        const raw = params[key] ?? '';
        return encode ? encodeURIComponent(raw) : raw;
    };

    return value
        .replace(/{{\s*([\w.-]+)\s*}}/g, (_m, key: string) => renderValue(key))
        .replace(/__([\w.-]+)__/g, (_m, key: string) => renderValue(key));
}

/** 深度渲染对象/数组中的模板字段。 */
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

/** 将步骤上下文合并到模板参数，供后续步骤继续渲染。 */
export function mergeTemplateParams(base: Record<string, string>, context: Record<string, unknown>): Record<string, string> {
    const merged: Record<string, string> = {...base};
    for (const [key, value] of Object.entries(context)) {
        merged[key] = toTemplateString(value);
    }
    return merged;
}

/**
 * 按模板参数渲染并执行 HTTP 请求，返回按 mode/jsonPath 提取后的值。
 */
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
        requestInit.body = typeof renderedBody === 'string'
            ? renderedBody
            : JSON.stringify(renderedBody);
        if (!requestInit.headers) requestInit.headers = {};
        if (!(requestInit.headers as Record<string, string>)['Content-Type']) {
            (requestInit.headers as Record<string, string>)['Content-Type'] = 'application/json';
        }
    }

    const renderedUrl = renderTemplateString(request.url, params, true);
    const response = await fetch(renderedUrl, requestInit);
    if (!response.ok) {
        throw new Error(`${errorPrefix}请求失败 status=${response.status} url=${renderedUrl}`);
    }

    return extractValueByMode(response, request.mode, request.jsonPath);
}

