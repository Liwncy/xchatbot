import {getLogContext} from '../core/app-log/context.js';
import {recordAppLog} from '../core/app-log/store.js';
import type {AppLogLevel} from '../core/app-log/types.js';

const SECRET_KEY = /token|secret|authorization|password|apikey|api_key/iu;

function redactValue(value: unknown, key?: string): unknown {
    if (key && SECRET_KEY.test(key)) return '[redacted]';
    if (Array.isArray(value)) return value.map((item) => redactValue(item));
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [nextKey, next] of Object.entries(value as Record<string, unknown>)) {
            out[nextKey] = redactValue(next, nextKey);
        }
        return out;
    }
    return value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
}

function pickString(record: Record<string, unknown> | undefined, key: string): string {
    const value = record?.[key];
    return typeof value === 'string' ? value : '';
}

function persist(level: AppLogLevel, summary: string, args: unknown[]): void {
    const ctx = getLogContext();
    if (!ctx) return;
    const extra = asRecord(args[0]);
    const rest = extra ? args.slice(1) : args;
    const payload = extra
        ? redactValue({...extra, ...(rest.length ? {extra: rest} : {})})
        : (rest.length ? redactValue(rest) : undefined);
    const detail = payload === undefined ? '' : JSON.stringify(payload);
    const write = recordAppLog(ctx.env, {
        level,
        summary,
        detail,
        stage: pickString(extra, 'stage'),
        platform: pickString(extra, 'platform'),
        sessionId: pickString(extra, 'sessionId') || pickString(extra, 'roomId'),
        messageId: pickString(extra, 'messageId'),
        pluginName: pickString(extra, 'pluginName') || pickString(extra, 'name'),
    });
    if (ctx.waitUntil) ctx.waitUntil(write);
    else void write;
}

export const logger = {
    debug(message: string, ...args: unknown[]): void {
        console.debug(message, ...args);
    },
    info(message: string, ...args: unknown[]): void {
        console.info(message, ...args);
    },
    warn(message: string, ...args: unknown[]): void {
        console.warn(message, ...args);
        persist('warn', message, args);
    },
    error(message: string, ...args: unknown[]): void {
        console.error(message, ...args);
        persist('error', message, args);
    },
};
