import type {Env} from '../../types/env.js';
import type {IncomingMessage} from '../../core/message.js';
import type {ReplyMessage} from '../../core/reply.js';
import {toReplyArray} from '../../core/reply.js';
import {runPipeline} from '../../core/pipeline.js';
import {runWithLogContext} from '../../core/app-log/context.js';
import {logger} from '../../utils/logger.js';
import {ensurePluginsRegistered} from '../../plugins/register.js';
import {resolveOwnerId} from '../../core/bot.js';
import {recordInboundChatMessage} from '../../core/chat-log/index.js';
import {getAdapter} from '../index.js';
import {filterExpiredMessages, parseWechatMessages} from './parse.js';
import type {WechatPushMessage} from './types.js';
import {verifyWechatSignature} from './verify.js';

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {'Content-Type': 'application/json'},
    });
}

export async function handleGolemWebhook(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
): Promise<Response> {
    ensurePluginsRegistered();

    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', {status: 405});
    }

    const body = await request.text();
    const token = env.WECHAT_TOKEN ?? '';
    if (token) {
        const signature = request.headers.get('x-signature') ?? '';
        const timestamp = request.headers.get('x-timestamp') ?? '';
        const valid = await verifyWechatSignature(token, signature, timestamp, body);
        if (!valid) {
            logger.warn('Golem 签名验证失败');
            return new Response('Invalid signature', {status: 403});
        }
    }

    let payload: WechatPushMessage;
    try {
        payload = JSON.parse(body) as WechatPushMessage;
    } catch {
        return new Response('Invalid JSON', {status: 400});
    }

    let messages: IncomingMessage[];
    try {
        messages = parseWechatMessages(payload);
    } catch {
        return json({success: true, skipped: true});
    }

    const activeMessages = filterExpiredMessages(messages);
    if (activeMessages.length === 0) {
        return json({success: true, skipped: true, reason: 'expired'});
    }

    ctx.waitUntil(runWithLogContext(
        {env, waitUntil: (promise) => ctx.waitUntil(promise)},
        () => processGolemInbound(activeMessages, env, ctx),
    ));
    return json({success: true, accepted: activeMessages.length});
}

async function processGolemInbound(
    messages: IncomingMessage[],
    env: Env,
    ctx: ExecutionContext,
): Promise<void> {
    const adapter = getAdapter('golem');
    const sendTasks: Array<{message: IncomingMessage; replies: ReplyMessage[]}> = [];
    const botId = env.BOT_WECHAT_ID?.trim() ?? '';
    const ownerId = resolveOwnerId(env, 'golem');

    for (const message of messages) {
        if (botId && message.from.trim() === botId) {
            continue;
        }
        if (message.source === 'official') {
            logger.info('入站已跳过', {reason: 'official', from: message.from, messageId: message.messageId});
            continue;
        }
        if (message.source === 'private' && (!ownerId || message.from.trim() !== ownerId)) {
            logger.info('入站已跳过', {reason: 'dm-allowlist', from: message.from, messageId: message.messageId});
            continue;
        }
        try {
            await recordInboundChatMessage(env, message);
            const response = await runPipeline(message, {
                env,
                requestId: message.messageId,
                waitUntil: (promise) => ctx.waitUntil(promise),
                adapter,
            });
            const replies = toReplyArray(response);
            if (replies.length > 0) {
                sendTasks.push({message, replies});
            }
        } catch (error) {
            logger.error('入站处理失败', {
                messageId: message.messageId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    if (sendTasks.length === 0 || !adapter) return;
    for (const task of sendTasks) {
        try {
            await adapter.send(task.message, task.replies, env);
        } catch (error) {
            logger.error('Golem 发送失败', {
                messageId: task.message.messageId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
