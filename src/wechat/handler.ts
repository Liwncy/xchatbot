import type {
    IncomingMessage,
    ReplyMessage,
    Env,
} from '../types/message.js';
import type {WechatPushMessage} from './types.js';
import {WechatApi} from './api.js';
import {verifyWechatSignature} from './inbound/verify.js';
import {parseWechatMessages} from './inbound/parse-payload.js';
import {buildWechatReply} from './outbound/build-send-params.js';
import {sendWechatReply} from './outbound/send-reply.js';
import {logger} from '../utils/logger.js';
import {ContactRepository} from '../plugins/system/contact-admin/repository.js';

const MESSAGE_EXPIRE_SECONDS = 3 * 60;

function isExpiredMessage(message: IncomingMessage, nowUnixSeconds: number): boolean {
    return nowUnixSeconds - message.timestamp > MESSAGE_EXPIRE_SECONDS;
}

function resolveVoiceConversionOptions(env: Env): {
    voiceConvertApiUrl?: string;
} {
    const voiceEnv = env as Env & {
        VOICE_CONVERT_API_URL?: string;
        VOICE_TOSILK_API_URL?: string;
    };
    return {
        // Prefer the new generic variable name; keep legacy fallback.
        voiceConvertApiUrl: voiceEnv.VOICE_CONVERT_API_URL || voiceEnv.VOICE_TOSILK_API_URL,
    };
}

/**
 * 微信请求主处理器。
 * 接收来自网关的 JSON 数据并处理消息。
 *
 * 通过类型化 API 客户端发送回复。
 */
export async function handleWechat(request: Request, env: Env): Promise<Response> {
    const token = env.WECHAT_TOKEN ?? '';
    const apiBaseUrl = env.WECHAT_API_BASE_URL ?? '';

    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', {status: 405});
    }

    const body = await request.text();

    logger.debug('收到微信消息', body);

    if (token) {
        const signature = request.headers.get('x-signature') ?? '';
        const timestamp = request.headers.get('x-timestamp') ?? '';

        const valid = await verifyWechatSignature(token, signature, timestamp, body);
        if (!valid) {
            logger.warn('微信签名验证失败');
            return new Response('Invalid signature', {status: 403});
        }
    }

    let payload: WechatPushMessage;
    try {
        payload = JSON.parse(body) as WechatPushMessage;
    } catch {
        logger.error('微信消息 JSON 解析失败', body);
        return new Response('Invalid JSON', {status: 400});
    }

    let messages: IncomingMessage[];
    try {
        messages = parseWechatMessages(payload);
    } catch (error) {
        logger.debug('跳过非消息推送', {
            error: error instanceof Error ? error.message : String(error),
            payloadKeys: Object.keys(payload ?? {}),
            newMessageCount: Array.isArray(payload.new_message) ? payload.new_message.length : null,
        });
        return new Response(JSON.stringify({success: true, skipped: true}), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        });
    }

    const nowUnixSeconds = Math.floor(Date.now() / 1000);
    const activeMessages = messages.filter((message) => !isExpiredMessage(message, nowUnixSeconds));
    const expiredCount = messages.length - activeMessages.length;
    if (expiredCount > 0) {
        logger.debug('跳过过期微信消息', {expiredCount, thresholdSeconds: MESSAGE_EXPIRE_SECONDS});
    }

    if (activeMessages.length === 0) {
        return new Response(JSON.stringify({success: true, skipped: true, reason: 'expired'}), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        });
    }

    const {routeMessage} = await import('../message/router.js');
    const {toReplyArray} = await import('../message/response.js');
    const replyTasks: Array<{ message: IncomingMessage; reply: ReplyMessage }> = [];
    const ownerWxid = env.BOT_OWNER_WECHAT_ID?.trim() ?? '';

    for (const message of activeMessages) {
        if (!ownerWxid || message.from !== ownerWxid) {
            if (message.source === 'private') {
                // pass
            } else if (message.source === 'group') {
                if (!apiBaseUrl || !message.room?.id) {
                    logger.debug('消息被白名单过滤（群聊缺少配置或群ID）', {
                        source: message.source,
                        roomId: message.room?.id,
                        hasApiBaseUrl: Boolean(apiBaseUrl),
                    });
                    continue;
                }
                const allowed = await ContactRepository.isGroupContactAllowed(env.XBOT_DB, message.room.id);
                if (!allowed) {
                    logger.debug('消息被白名单过滤（群聊不在联系人列表）', {
                        source: message.source,
                        roomId: message.room.id,
                    });
                    continue;
                }
            } else {
                logger.debug('消息被白名单过滤（非私聊且非联系人群聊）', {
                    source: message.source,
                    from: message.from,
                });
                continue;
            }
        }

        console.log('处理微信消息', {routeMessage, toReplyArray, message});
        const response = await routeMessage(message, env);
        const replies = toReplyArray(response);
        for (const reply of replies) {
            replyTasks.push({message, reply});
        }
    }

    if (replyTasks.length === 0) {
        return new Response(JSON.stringify({success: true}), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        });
    }

    if (apiBaseUrl) {
        const api = new WechatApi(apiBaseUrl);
        const voiceOptions = resolveVoiceConversionOptions(env);
        for (const task of replyTasks) {
            const receiver = task.message.room?.id ?? task.message.from;
            try {
                await sendWechatReply(api, task.reply, receiver, voiceOptions);
            } catch (err) {
                logger.error('微信 API 发送回复失败', {
                    replyType: task.reply.type,
                    receiver,
                    apiBaseUrl,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        return new Response(JSON.stringify({success: true}), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        });
    }

    const replyPayloads = replyTasks.map((task) =>
        buildWechatReply(task.reply, task.message.from, task.message.room?.id),
    );
    const responseBody = replyPayloads.length === 1 ? replyPayloads[0] : replyPayloads;
    return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
    });
}

