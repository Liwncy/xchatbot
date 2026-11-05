import {listBrains} from '../core/brain-store.js';
import {mailboxOptionsFromEnv, mailboxStub, type MailboxStatus} from '../core/agent-mailbox.js';
import type {Env} from '../types/env.js';
import {authorizeAdmin} from './admin.js';
import {summarizeBrainHealth, worstLevel} from './health.js';

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {'Content-Type': 'application/json'},
    });
}

/**
 * `GET /admin/status[?brain=<brain_key>]`
 *
 * 看每个大脑的投递方式，以及 WebSocket 邮箱里 agent 连没连、队里压了几条。
 * 每个大脑带 `health`（ok / warn / error + 问题清单），顶层 `level` / `summary` 是整体结论。
 * 只查 `transport = ws` 的大脑（或 `?brain=` 点名的那个）；其余不去碰 Durable Object，
 * 免得白白唤醒、白白计请求。不返回任何 token。
 */
export async function handleAdminStatus(request: Request, env: Env): Promise<Response> {
    const unauthorized = authorizeAdmin(request, env);
    if (unauthorized) return unauthorized;
    if (request.method !== 'GET') return new Response('Method Not Allowed', {status: 405});

    const only = new URL(request.url).searchParams.get('brain')?.trim().toLowerCase() ?? '';
    const brains = (await listBrains(env)).filter((brain) => !only || brain.key.toLowerCase() === only);
    if (only && brains.length === 0) return json({error: 'unknown brain'}, 404);

    const now = Date.now();
    const items = await Promise.all(brains.map(async (brain) => {
        let mailbox: MailboxStatus | {error: string} | null = null;
        if (brain.transport === 'ws' || only) {
            const stub = mailboxStub(env, brain.key);
            if (!stub) {
                mailbox = {error: 'AGENT_MAILBOX 没绑定'};
            } else {
                try {
                    mailbox = await stub.status();
                } catch (error) {
                    mailbox = {error: error instanceof Error ? error.message : String(error)};
                }
            }
        }
        return {
            key: brain.key,
            kind: brain.kind,
            enabled: brain.enabled,
            transport: brain.transport,
            httpFallback: Boolean(brain.baseUrl && brain.token),
            mailbox,
            health: summarizeBrainHealth({
                enabled: brain.enabled,
                transport: brain.transport,
                mailbox,
                now,
            }),
        };
    }));

    const options = mailboxOptionsFromEnv(env);
    return json({
        now,
        level: worstLevel(items.map((item) => item.health.level)),
        summary: items
            .filter((item) => item.health.level !== 'ok')
            .map((item) => `${item.key}: ${item.health.summary}`)
            .join('; ') || 'healthy',
        mailboxBound: Boolean(env.AGENT_MAILBOX),
        ttlMs: options.ttlMs,
        queueIfOffline: options.queueIfOffline,
        brains: items,
    });
}
