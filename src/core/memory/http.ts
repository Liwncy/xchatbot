import type {Env} from '../../types/env.js';
import {authorizeOpenClawRequest} from '../../plugins/agent/openclaw/auth.js';
import {consolidateDueSessions} from './consolidate.js';
import {readMemoryPrompt} from './read.js';
import {getChatSession} from './store.js';

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {'Content-Type': 'application/json'},
    });
}

export async function handleAgentMemory(request: Request, env: Env): Promise<Response> {
    if (!authorizeOpenClawRequest(request, env)) {
        return json({ok: false, error: 'unauthorized'}, 401);
    }
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/agent/memory') {
        const sessionId = url.searchParams.get('sessionId')?.trim() ?? '';
        if (!sessionId) return json({ok: false, error: 'sessionId is required'}, 400);
        const speakerId = url.searchParams.get('speakerId')?.trim() ?? '';
        // 取卡只带聊天 id，平台从聊天记录里记的那一行查
        const platform = (await getChatSession(env, sessionId))?.platform ?? 'golem';
        const view = await readMemoryPrompt(env, sessionId, speakerId, platform);
        return json({ok: true, sessionId, speakerId, ...view});
    }
    if (request.method === 'POST' && url.pathname === '/agent/memory/consolidate') {
        let sessionId = '';
        let since: number | undefined;
        let limit: number | undefined;
        let platform = '';
        let dryRun = false;
        try {
            const body = await request.json() as {
                sessionId?: string;
                since?: number;
                limit?: number;
                platform?: string;
                dryRun?: boolean;
            };
            dryRun = body.dryRun === true;
            sessionId = body.sessionId?.trim() ?? '';
            if (typeof body.since === 'number' && Number.isFinite(body.since)) since = Math.floor(body.since);
            if (typeof body.limit === 'number' && Number.isFinite(body.limit)) limit = Math.floor(body.limit);
            platform = body.platform?.trim() ?? '';
        } catch {
            return json({ok: false, error: 'body 不是 json'}, 400);
        }
        const sessions = await consolidateDueSessions(env, {sessionId, since, limit, platform, dryRun});
        return json({ok: sessions.every((session) => session.ok), sessions});
    }
    return new Response('Method Not Allowed', {status: 405});
}
