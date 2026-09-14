import type {Env} from '../../types/env.js';
import {isHandledReply, toReplyArray} from '../../core/reply.js';
import {runPipeline} from '../../core/pipeline.js';
import {ensurePluginsRegistered} from '../../plugins/register.js';
import {parseBool} from '../../utils/bool.js';
import {recordInboundChatMessage, recordOutboundChatMessage} from '../../core/chat-log/index.js';
import {getAdapter} from '../index.js';
import {parseWebMessage} from './parse.js';
import {renderWebPage} from './page.js';
import type {WebInboundBody} from './types.js';

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {'Content-Type': 'application/json'},
    });
}

function html(body: string, status = 200): Response {
    return new Response(body, {
        status,
        headers: {'Content-Type': 'text/html; charset=utf-8'},
    });
}

function isEnabled(env: Env): boolean {
    return parseBool(env.WEB_ADAPTER_ENABLED, false);
}

function authorize(request: Request, env: Env): boolean {
    const token = env.WEB_ADAPTER_TOKEN?.trim() ?? '';
    if (!token) return true;
    const header = request.headers.get('authorization') ?? '';
    if (header === `Bearer ${token}`) return true;
    return (request.headers.get('x-web-token') ?? '') === token;
}

export async function handleWebAdapter(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
): Promise<Response> {
    if (!isEnabled(env)) {
        return new Response('Not Found', {status: 404});
    }

    const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'GET' && pathname === '/adapter/web') {
        return html(renderWebPage({tokenRequired: Boolean(env.WEB_ADAPTER_TOKEN?.trim())}));
    }

    if (request.method !== 'POST' || pathname !== '/adapter/web/message') {
        return new Response('Not Found', {status: 404});
    }

    if (!authorize(request, env)) {
        return json({error: 'Unauthorized'}, 401);
    }

    ensurePluginsRegistered();

    let body: WebInboundBody;
    try {
        body = await request.json() as WebInboundBody;
    } catch {
        return json({error: 'Invalid JSON'}, 400);
    }

    let message;
    try {
        message = parseWebMessage(body);
    } catch (error) {
        return json({error: error instanceof Error ? error.message : 'invalid payload'}, 400);
    }

    await recordInboundChatMessage(env, message);

    const response = await runPipeline(message, {
        env,
        requestId: message.messageId,
        waitUntil: (promise) => ctx.waitUntil(promise),
        adapter: getAdapter(message.platform),
    });

    const replies = toReplyArray(response);
    for (const [index, reply] of replies.entries()) {
        await recordOutboundChatMessage(env, message, reply, {
            causedByMessageId: message.messageId,
            replyIndex: index,
            replyStatus: 'sent',
        });
    }

    return json({
        ok: true,
        handled: isHandledReply(response),
        replies,
    });
}
