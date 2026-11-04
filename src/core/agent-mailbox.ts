import {DurableObject} from 'cloudflare:workers';
import type {Env} from '../types/env.js';
import {parseBool} from '../utils/bool.js';
import {logger} from '../utils/logger.js';

/**
 * agent 入站邮箱。一个大脑一个实例（实例名 = brain_key）。
 *
 * agent 主动连上来（WebSocket），这边把入站消息推过去，等它回 ack。
 * 没 ack 就按 5s / 15s / 45s 重发，三次都没回就丢。
 * 只存「还没确认」的消息，ack 后立刻删。
 *
 * 必须用 Hibernation API：连接空闲时实例休眠，不计时长。
 * 这里不能用 setTimeout / setInterval，重试一律走 alarm。
 */

/** 排队消息默认保留 30 分钟。每条固定，不续期。 */
export const MAILBOX_DEFAULT_TTL_MS = 30 * 60 * 1000;
const MAILBOX_MAX_TTL_MS = 24 * 60 * 60 * 1000;
/** 第 1、2、3 次发出后各等多久，再没 ack 就重发；第 3 次等完仍没 ack 就丢。 */
const RETRY_DELAYS_MS = [5_000, 15_000, 45_000] as const;
/** 离线入队时的上限，防止 agent 长时间不在线把存储撑满。 */
const MAX_PENDING = 200;
/** 同一个大脑来了新连接，旧连接用这个码关掉。 */
export const MAILBOX_REPLACED_CLOSE_CODE = 4000;
/** WebSocket.OPEN。DO 里拿不到全局常量时直接比数字。 */
const WS_OPEN = 1;

type Attachment = {
    connectedAt: number;
    helloAt?: number;
    client?: string;
    version?: string;
};

type PendingRow = {
    id: string;
    payload: string;
    attempts: number;
};

export type MailboxEnqueueOptions = {
    ttlMs?: number;
    /** agent 不在线时是否照样入队，等它上线补发。默认不入队。 */
    queueIfOffline?: boolean;
};

export type MailboxEnqueueResult = {
    accepted: boolean;
    /** 已经在队里（还没 ack），算已接收。 */
    duplicate?: boolean;
    reason?: 'offline' | 'full' | 'invalid';
    live: boolean;
};

export type MailboxStatus = {
    connected: boolean;
    sockets: number;
    connectedAt: number | null;
    helloAt: number | null;
    client: string | null;
    version: string | null;
    pending: number;
    oldestAt: number | null;
};

function clampTtl(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return MAILBOX_DEFAULT_TTL_MS;
    return Math.min(Math.floor(value), MAILBOX_MAX_TTL_MS);
}

export class AgentMailbox extends DurableObject<Env> {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
        ctx.blockConcurrencyWhile(async () => {
            ctx.storage.sql.exec(
                `CREATE TABLE IF NOT EXISTS mailbox (
                    id         TEXT PRIMARY KEY,
                    payload    TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL,
                    attempts   INTEGER NOT NULL DEFAULT 0,
                    next_at    INTEGER NOT NULL
                )`,
            );
        });
    }

    /** WebSocket 升级。鉴权由 Worker 在转发前做完。 */
    async fetch(request: Request): Promise<Response> {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
            return new Response('Expected WebSocket', {status: 426});
        }
        for (const old of this.ctx.getWebSockets()) {
            try {
                old.close(MAILBOX_REPLACED_CLOSE_CODE, 'replaced');
            } catch {
                // 旧连接已经断了
            }
        }
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({connectedAt: Date.now()} satisfies Attachment);
        return new Response(null, {status: 101, webSocket: client});
    }

    /**
     * 入队并立刻推给在线的 agent。
     * 不在线且没开离线入队时返回 `offline`，调用方自己回退。
     */
    async enqueue(
        messageId: string,
        payloadJson: string,
        options: MailboxEnqueueOptions = {},
    ): Promise<MailboxEnqueueResult> {
        const id = messageId.trim();
        if (!id || !payloadJson) return {accepted: false, reason: 'invalid', live: false};

        const live = this.liveSocket() !== null;
        if (!live && !options.queueIfOffline) return {accepted: false, reason: 'offline', live: false};

        const sql = this.ctx.storage.sql;
        const exists = sql.exec('SELECT 1 AS x FROM mailbox WHERE id = ?', id).toArray().length > 0;
        if (exists) return {accepted: true, duplicate: true, live};

        const pending = sql.exec<{n: number}>('SELECT COUNT(*) AS n FROM mailbox').one().n;
        if (pending >= MAX_PENDING) return {accepted: false, reason: 'full', live};

        const now = Date.now();
        sql.exec(
            `INSERT INTO mailbox (id, payload, created_at, expires_at, attempts, next_at)
             VALUES (?, ?, ?, ?, 0, ?)`,
            id,
            payloadJson,
            now,
            now + clampTtl(options.ttlMs),
            now,
        );

        if (live) await this.flush();
        else await this.schedule();
        return {accepted: true, live};
    }

    async status(): Promise<MailboxStatus> {
        const ws = this.liveSocket();
        const attachment = ws ? this.attachmentOf(ws) : null;
        const row = this.ctx.storage.sql
            .exec<{n: number; oldest: number | null}>(
                'SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM mailbox',
            )
            .one();
        return {
            connected: ws !== null,
            sockets: this.ctx.getWebSockets().length,
            connectedAt: attachment?.connectedAt ?? null,
            helloAt: attachment?.helloAt ?? null,
            client: attachment?.client ?? null,
            version: attachment?.version ?? null,
            pending: row.n,
            oldestAt: row.oldest,
        };
    }

    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
        if (typeof message !== 'string') return;
        let frame: {t?: unknown; id?: unknown; client?: unknown; version?: unknown};
        try {
            frame = JSON.parse(message) as typeof frame;
        } catch {
            return;
        }
        if (!frame || typeof frame !== 'object') return;

        if (frame.t === 'ack' && typeof frame.id === 'string') {
            this.ctx.storage.sql.exec('DELETE FROM mailbox WHERE id = ?', frame.id);
            await this.schedule();
            return;
        }

        if (frame.t === 'hello') {
            const attachment = this.attachmentOf(ws) ?? {connectedAt: Date.now()};
            ws.serializeAttachment({
                ...attachment,
                helloAt: Date.now(),
                client: typeof frame.client === 'string' ? frame.client.slice(0, 64) : undefined,
                version: typeof frame.version === 'string' ? frame.version.slice(0, 32) : undefined,
            } satisfies Attachment);
            await this.flush();
        }
    }

    async webSocketClose(): Promise<void> {
        await this.schedule();
    }

    async webSocketError(): Promise<void> {
        await this.schedule();
    }

    async alarm(): Promise<void> {
        await this.flush();
    }

    private attachmentOf(ws: WebSocket): Attachment | null {
        return (ws.deserializeAttachment() as Attachment | null) ?? null;
    }

    /** 最近连上、还开着的那一条。 */
    private liveSocket(): WebSocket | null {
        let best: WebSocket | null = null;
        let bestAt = -1;
        for (const ws of this.ctx.getWebSockets()) {
            if (ws.readyState !== WS_OPEN) continue;
            const at = this.attachmentOf(ws)?.connectedAt ?? 0;
            if (at >= bestAt) {
                best = ws;
                bestAt = at;
            }
        }
        return best;
    }

    /** 过期的、三次都没 ack 的，直接丢。 */
    private purge(now: number): void {
        const sql = this.ctx.storage.sql;
        const dead = sql
            .exec<{id: string}>(
                `SELECT id FROM mailbox
                 WHERE expires_at <= ? OR (attempts >= ? AND next_at <= ?)
                 LIMIT 20`,
                now,
                RETRY_DELAYS_MS.length,
                now,
            )
            .toArray();
        if (dead.length === 0) return;
        sql.exec(
            `DELETE FROM mailbox WHERE expires_at <= ? OR (attempts >= ? AND next_at <= ?)`,
            now,
            RETRY_DELAYS_MS.length,
            now,
        );
        logger.warn('邮箱里有消息没送达，已丢弃', {ids: dead.map((row) => row.id)});
    }

    /** 把到点的消息按入队顺序发给在线的 agent。 */
    private async flush(): Promise<void> {
        const now = Date.now();
        this.purge(now);

        const ws = this.liveSocket();
        if (ws) {
            const sql = this.ctx.storage.sql;
            const due = sql
                .exec<PendingRow>(
                    'SELECT id, payload, attempts FROM mailbox WHERE next_at <= ? ORDER BY rowid',
                    now,
                )
                .toArray();
            for (const row of due) {
                try {
                    ws.send(`{"t":"msg","id":${JSON.stringify(row.id)},"payload":${row.payload}}`);
                } catch {
                    break;
                }
                const attempts = row.attempts + 1;
                const delay = RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length) - 1];
                sql.exec('UPDATE mailbox SET attempts = ?, next_at = ? WHERE id = ?', attempts, now + delay, row.id);
            }
        }
        await this.schedule();
    }

    /** 下次醒来的时间：在线看重发和丢弃，不在线只看过期。 */
    private async schedule(): Promise<void> {
        const row = this.ctx.storage.sql
            .exec<{expires: number | null; next: number | null}>(
                'SELECT MIN(expires_at) AS expires, MIN(next_at) AS next FROM mailbox',
            )
            .one();
        const candidates: number[] = [];
        if (row.expires !== null) candidates.push(row.expires);
        if (row.next !== null && this.liveSocket() !== null) candidates.push(row.next);
        if (candidates.length === 0) {
            await this.ctx.storage.deleteAlarm();
            return;
        }
        await this.ctx.storage.setAlarm(Math.max(Math.min(...candidates), Date.now() + 50));
    }
}

export function mailboxStub(env: Env, brainKey: string): DurableObjectStub<AgentMailbox> | null {
    const namespace = env.AGENT_MAILBOX;
    if (!namespace) return null;
    return namespace.get(namespace.idFromName(brainKey));
}

export function mailboxOptionsFromEnv(env: Env): Required<MailboxEnqueueOptions> {
    const ttl = Number.parseInt(String(env.AGENT_WS_TTL_MS ?? ''), 10);
    return {
        ttlMs: clampTtl(Number.isFinite(ttl) ? ttl : undefined),
        queueIfOffline: parseBool(env.AGENT_WS_QUEUE_OFFLINE, false),
    };
}

/**
 * 送进邮箱。`accepted` 就别再走 HTTP，免得重复投递。
 * 任何一步出错（没绑 DO、额度用完、agent 不在线）都返回 `unavailable`，由调用方回退。
 */
export async function deliverToMailbox(
    env: Env,
    brainKey: string,
    messageId: string,
    payloadJson: string,
): Promise<'accepted' | 'unavailable'> {
    const stub = mailboxStub(env, brainKey);
    if (!stub) return 'unavailable';
    try {
        const result = await stub.enqueue(messageId, payloadJson, mailboxOptionsFromEnv(env));
        if (result.accepted) return 'accepted';
        logger.warn('邮箱没收，回退直推', {brain: brainKey, reason: result.reason});
        return 'unavailable';
    } catch (error) {
        logger.warn('邮箱不可用，回退直推', {
            brain: brainKey,
            error: error instanceof Error ? error.message : String(error),
        });
        return 'unavailable';
    }
}
