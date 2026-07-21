import type {Env} from '../types/env.js';

export type WechatMediaTicketKind = 'image' | 'video';

export interface WechatMediaTicketRecord {
    kind: WechatMediaTicketKind;
    fileId: string;
    fileAesKey: string;
    createdAt: number;
}

const TICKET_PREFIX = 'wechat-media:ticket:';
const TICKET_TTL_SECONDS = 24 * 60 * 60;
const TICKET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TICKET_LENGTH = 10;

function buildTicketKey(ticket: string): string {
    return `${TICKET_PREFIX}${ticket}`;
}

function randomTicket(): string {
    const bytes = new Uint8Array(TICKET_LENGTH);
    crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
        out += TICKET_ALPHABET[bytes[i]! % TICKET_ALPHABET.length];
    }
    return out;
}

export async function saveWechatMediaTicket(
    env: Env,
    record: Omit<WechatMediaTicketRecord, 'createdAt'>,
): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const ticket = randomTicket();
        const key = buildTicketKey(ticket);
        const existing = await env.XBOT_KV.get(key);
        if (existing) continue;

        const saved: WechatMediaTicketRecord = {
            ...record,
            createdAt: Math.floor(Date.now() / 1000),
        };
        await env.XBOT_KV.put(key, JSON.stringify(saved), {
            expirationTtl: TICKET_TTL_SECONDS,
        });
        return ticket;
    }
    throw new Error('生成媒体短票失败');
}

export async function loadWechatMediaTicket(
    env: Env,
    ticket: string,
): Promise<WechatMediaTicketRecord | null> {
    const normalized = ticket.trim();
    if (!normalized) return null;
    const raw = await env.XBOT_KV.get(buildTicketKey(normalized));
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as WechatMediaTicketRecord;
        if (!parsed?.fileId?.trim() || !parsed?.fileAesKey?.trim()) return null;
        if (parsed.kind !== 'image' && parsed.kind !== 'video') return null;
        return {
            kind: parsed.kind,
            fileId: parsed.fileId.trim(),
            fileAesKey: parsed.fileAesKey.trim(),
            createdAt: parsed.createdAt,
        };
    } catch {
        return null;
    }
}
