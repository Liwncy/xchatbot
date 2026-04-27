export function nowUnixSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

export function buildTraceId(prefix = 'sched'): string {
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '')
        : `${Date.now()}${Math.random().toString(16).slice(2)}`;
    return `${prefix}_${id}`;
}

export function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

export function truncateText(value: string, maxLength = 500): string {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}…`;
}

export function stringifyJson(value: unknown): string {
    return JSON.stringify(value ?? null);
}

export function parseJsonValue(text: string | null | undefined): unknown {
    if (!text?.trim()) return null;
    return JSON.parse(text);
}

export function ensurePlainObject(value: unknown, fieldName: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${fieldName} must be an object`);
    }
    return value as Record<string, unknown>;
}

export function asTrimmedString(value: unknown, fieldName: string, options?: {required?: boolean; maxLength?: number}): string {
    const required = options?.required ?? true;
    const maxLength = options?.maxLength ?? 200;
    if (value == null) {
        if (required) throw new Error(`${fieldName} is required`);
        return '';
    }
    const output = String(value).trim();
    if (!output) {
        if (required) throw new Error(`${fieldName} is required`);
        return '';
    }
    if (output.length > maxLength) {
        throw new Error(`${fieldName} must be <= ${maxLength} chars`);
    }
    return output;
}

export function asNonNegativeInteger(
    value: unknown,
    fieldName: string,
    options?: {defaultValue?: number; min?: number; max?: number},
): number {
    const min = options?.min ?? 0;
    const max = options?.max ?? Number.MAX_SAFE_INTEGER;
    const defaultValue = options?.defaultValue;
    if (value == null || value === '') {
        if (defaultValue == null) {
            throw new Error(`${fieldName} is required`);
        }
        return defaultValue;
    }
    const numeric = Number(value);
    if (!Number.isInteger(numeric)) {
        throw new Error(`${fieldName} must be an integer`);
    }
    if (numeric < min || numeric > max) {
        throw new Error(`${fieldName} must be between ${min} and ${max}`);
    }
    return numeric;
}

export function coerceUnixSeconds(value: unknown, fieldName: string): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) throw new Error(`${fieldName} is required`);
        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) {
            return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
        }
        const parsed = Date.parse(trimmed);
        if (Number.isFinite(parsed)) {
            return Math.floor(parsed / 1000);
        }
    }
    throw new Error(`${fieldName} must be a unix timestamp or ISO datetime string`);
}

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
    const headers = new Headers(init?.headers);
    headers.set('Content-Type', 'application/json');
    return new Response(JSON.stringify(body, null, 2), {
        ...init,
        headers,
    });
}

