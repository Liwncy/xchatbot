import type {Env} from '../../../types/env.js';
import {
    AGNES_VIDEO_TICKET_LENGTH,
    AGNES_VIDEO_TICKET_TTL_SECONDS,
} from './constants.js';
import type {AgnesVideoTicketRecord} from './types.js';

function buildTicketKey(ticket: string): string {
    return `agnes-video:ticket:${ticket}`;
}

function randomTicket(): string {
    const min = 10 ** (AGNES_VIDEO_TICKET_LENGTH - 1);
    const max = 10 ** AGNES_VIDEO_TICKET_LENGTH - 1;
    return String(Math.floor(min + Math.random() * (max - min + 1)));
}

export async function saveAgnesVideoTicket(
    env: Env,
    record: Omit<AgnesVideoTicketRecord, 'ticket' | 'createdAt'>,
): Promise<AgnesVideoTicketRecord> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const ticket = randomTicket();
        const key = buildTicketKey(ticket);
        const existing = await env.XBOT_KV.get(key);
        if (existing) continue;

        const saved: AgnesVideoTicketRecord = {
            ...record,
            ticket,
            createdAt: Math.floor(Date.now() / 1000),
        };
        await env.XBOT_KV.put(key, JSON.stringify(saved), {
            expirationTtl: AGNES_VIDEO_TICKET_TTL_SECONDS,
        });
        return saved;
    }

    throw new Error('生成绘影查询号失败，请稍后重试');
}

export async function loadAgnesVideoTicket(
    env: Env,
    ticket: string,
): Promise<AgnesVideoTicketRecord | null> {
    const raw = await env.XBOT_KV.get(buildTicketKey(ticket));
    if (!raw) return null;
    return JSON.parse(raw) as AgnesVideoTicketRecord;
}
