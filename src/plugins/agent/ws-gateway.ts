import {lookupBrain} from '../../core/brain-store.js';
import {mailboxStub} from '../../core/agent-mailbox.js';
import type {Env} from '../../types/env.js';
import {authorizeOpenClawRequest} from './openclaw/auth.js';

function json(data: unknown, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {'Content-Type': 'application/json'},
    });
}

/**
 * `GET /agent/ws?brain=<brain_key>`（Upgrade: websocket）。
 * agent 通道主动连上来，入站消息从这条连接推过去。
 * 鉴权在这里做完再交给邮箱，没带对 token 不会唤醒 Durable Object。
 * Token 与 `/openclaw/outbound` 同一把，放 Authorization 头，不放 URL。
 */
export async function handleAgentWs(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET') {
        return new Response('Method Not Allowed', {status: 405});
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket', {status: 426});
    }
    if (!authorizeOpenClawRequest(request, env)) {
        return json({ok: false, error: 'unauthorized'}, 401);
    }

    const name = new URL(request.url).searchParams.get('brain')?.trim() || 'openclaw';
    const brain = await lookupBrain(env, name);
    // 第一版只有 openclaw 通道会连上来
    if (!brain || !brain.enabled || brain.kind !== 'openclaw') {
        return json({ok: false, error: 'unknown brain'}, 404);
    }

    const stub = mailboxStub(env, brain.key);
    if (!stub) return json({ok: false, error: 'mailbox is not configured'}, 503);
    return stub.fetch(request);
}
