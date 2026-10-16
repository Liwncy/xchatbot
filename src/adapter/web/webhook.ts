import type {Env} from '../../types/env.js';
import {isHandledReply, toReplyArray} from '../../core/reply.js';
import {runPipeline} from '../../core/pipeline.js';
import {ensurePluginsRegistered} from '../../plugins/register.js';
import {parseBool} from '../../utils/bool.js';
import {recordInboundChatMessage, recordOutboundChatMessage} from '../../core/chat-log/index.js';
import {getAdapter} from '../index.js';
import {presentForWebList} from './channel.js';
import {normalizeWebUserId, pullWebInbox, type WebInboxItem} from './inbox.js';
import {parseWebMessage} from './parse.js';
import {renderWebPage} from './page.js';
import type {WebInboundBody} from './types.js';

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {'Content-Type': 'application/json'},
    });
}

function cors(response: Response): Response {
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Web-Token');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    return new Response(response.body, {status: response.status, headers});
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
    if (request.method === 'OPTIONS') {
        return cors(new Response(null, {status: 204}));
    }

    if (!isEnabled(env)) {
        return cors(new Response('Not Found', {status: 404}));
    }

    const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'GET' && pathname === '/adapter/web') {
        return cors(html(renderWebPage({tokenRequired: Boolean(env.WEB_ADAPTER_TOKEN?.trim())})));
    }

    if (request.method === 'GET' && pathname === '/adapter/web/replies') {
        if (!authorize(request, env)) {
            return cors(json({error: 'Unauthorized'}, 401));
        }
        const url = new URL(request.url);
        const userId = normalizeWebUserId(url.searchParams.get('userId') ?? '');
        if (!userId) return cors(json({error: 'userId is required'}, 400));
        const after = Number(url.searchParams.get('after') ?? '0');
        const inbox = await pullWebInbox(env, userId, Number.isFinite(after) ? after : 0);
        return cors(json({ok: true, ...inbox}));
    }

    if (request.method !== 'POST' || pathname !== '/adapter/web/message') {
        return cors(new Response('Not Found', {status: 404}));
    }

    if (!authorize(request, env)) {
        return cors(json({error: 'Unauthorized'}, 401));
    }

    ensurePluginsRegistered();

    let body: WebInboundBody;
    try {
        body = await request.json() as WebInboundBody;
    } catch {
        return cors(json({error: 'Invalid JSON'}, 400));
    }

    let message;
    try {
        message = parseWebMessage(body);
    } catch (error) {
        return cors(json({error: error instanceof Error ? error.message : 'invalid payload'}, 400));
    }

    await recordInboundChatMessage(env, message);

    const userId = normalizeWebUserId(message.senderId);
    const before = userId
        ? await pullWebInbox(env, userId, 0).catch(() => ({latest: 0, replies: [] as WebInboxItem[]}))
        : {latest: 0, replies: [] as WebInboxItem[]};

    const response = await runPipeline(message, {
        env,
        requestId: message.messageId,
        waitUntil: (promise) => ctx.waitUntil(promise),
        adapter: getAdapter(message.platform),
        resolveAdapter: getAdapter,
    });

    const pipelineReplies = presentForWebList(toReplyArray(response));
    const caught = userId
        ? await pullWebInbox(env, userId, before.latest).catch(() => ({latest: before.latest, replies: [] as WebInboxItem[]}))
        : {latest: before.latest, replies: [] as WebInboxItem[]};
    const replies = caught.replies.length
        ? caught.replies.map((item) => item.reply)
        : pipelineReplies;
    if (!caught.replies.length) {
        for (const [index, reply] of pipelineReplies.entries()) {
            await recordOutboundChatMessage(env, message, reply, {
                causedByMessageId: message.messageId,
                replyIndex: index,
                replyStatus: 'sent',
            });
        }
    }

    return cors(json({
        ok: true,
        handled: isHandledReply(response),
        replies,
    }));
}
