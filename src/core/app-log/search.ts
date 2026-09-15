import {
    resolveHistoryWindow,
    sanitizeHistoryLimit,
    sessionIdFromScope,
} from '../chat-log/query.js';
import {formatAppLogList} from './format.js';
import {queryAppLogs} from './store.js';
import type {AppLogLevel} from './types.js';
import type {Env} from '../../types/env.js';

export type AppLogQueryArgs = {
    scope?: string;
    limit?: number;
    date?: string;
    from?: string;
    until?: string;
    hours?: number;
    level?: string;
    stage?: string;
    messageId?: string;
    keyword?: string;
    beforeId?: number;
    afterId?: number;
    platform?: string;
};

function asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export async function searchAppLogs(env: Env, args: AppLogQueryArgs): Promise<string> {
    const resolved = resolveHistoryWindow({
        date: asString(args.date) || undefined,
        from: asString(args.from) || undefined,
        until: asString(args.until) || undefined,
        hours: args.hours,
    });
    if (resolved.error) return resolved.error;

    const windowed = resolved.window.sinceUnix != null || resolved.window.untilUnix != null;
    const limit = sanitizeHistoryLimit(args.limit, windowed);
    const levelRaw = asString(args.level).toLowerCase();
    const level: AppLogLevel | undefined = levelRaw === 'error' || levelRaw === 'warn'
        ? levelRaw
        : undefined;
    const scope = asString(args.scope);
    const sessionId = scope ? sessionIdFromScope(scope) : '';
    if (scope && !sessionId) {
        return 'scope 认不出来。请从本条前缀复制 scope= 后面那一段，或不填查全部。';
    }
    try {
        const rows = await queryAppLogs(env, {
            sessionId: sessionId || undefined,
            platform: asString(args.platform) || undefined,
            level,
            stage: asString(args.stage) || undefined,
            messageId: asString(args.messageId) || undefined,
            keyword: asString(args.keyword) || undefined,
            sinceUnix: resolved.window.sinceUnix,
            untilUnix: resolved.window.untilUnix,
            beforeId: args.beforeId,
            afterId: args.afterId,
            limit,
        });
        console.info('查运行日志', {sessionId: sessionId || '*', limit, hits: rows.length});
        return formatAppLogList(rows, resolved.window.label, limit, windowed && args.beforeId == null);
    } catch (error) {
        console.error('查运行日志失败', error instanceof Error ? error.message : String(error));
        return '日志没查成，再试下';
    }
}
