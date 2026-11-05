import type {MailboxStatus} from '../core/agent-mailbox.js';

export type HealthLevel = 'ok' | 'warn' | 'error';

export type HealthSummary = {
    level: HealthLevel;
    /** 没问题是 `healthy`，否则是问题清单，逗号分隔。 */
    summary: string;
    issues: string[];
};

/** 积压超过这个条数算偏多。 */
export const PENDING_HIGH = 20;
/** 最老的一条等了这么久还没投出去，说明 agent 一直没取走。 */
export const PENDING_STALE_MS = 2 * 60_000;
/** 同一个大脑同时挂这么多连接，多半是旧连接没关干净。 */
export const SOCKETS_HIGH = 3;

export function summarizeBrainHealth(input: {
    enabled: boolean;
    transport: string;
    mailbox: MailboxStatus | {error: string} | null;
    now: number;
}): HealthSummary {
    if (!input.enabled) return {level: 'ok', summary: 'disabled', issues: []};
    if (input.transport !== 'ws') return {level: 'ok', summary: `transport-${input.transport}`, issues: []};
    if (!input.mailbox) return {level: 'warn', summary: 'mailbox-unknown', issues: ['mailbox-unknown']};
    if ('error' in input.mailbox) return {level: 'error', summary: 'mailbox-error', issues: ['mailbox-error']};

    const mailbox = input.mailbox;
    const issues: string[] = [];
    if (!mailbox.connected) issues.push('not-connected');
    if (mailbox.pending > PENDING_HIGH) issues.push('pending-high');
    if (mailbox.pending > 0 && mailbox.oldestAt !== null && input.now - mailbox.oldestAt > PENDING_STALE_MS) {
        issues.push('pending-stale');
    }
    if (mailbox.sockets > SOCKETS_HIGH) issues.push('too-many-connections');

    let level: HealthLevel = issues.length > 0 ? 'warn' : 'ok';
    // 没连上还压着消息：消息正在等一个不在的 agent。
    if (!mailbox.connected && mailbox.pending > 0) level = 'error';
    return {level, summary: issues.length > 0 ? issues.join(', ') : 'healthy', issues};
}

const RANK: Record<HealthLevel, number> = {ok: 0, warn: 1, error: 2};

export function worstLevel(levels: HealthLevel[]): HealthLevel {
    return levels.reduce<HealthLevel>((worst, level) => (RANK[level] > RANK[worst] ? level : worst), 'ok');
}
