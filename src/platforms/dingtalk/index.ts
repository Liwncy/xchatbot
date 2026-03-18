import type {IncomingMessage, ReplyMessage, MessageType, Env} from '../../types/message.js';
import type {DingTalkMessage} from './types.js';
import {logger} from '../../utils/logger.js';

/**
 * 验证钉钉 Webhook 签名。
 * 钉钉使用 Base64(HMAC-SHA256(timestamp + '\n' + secret, secret)) 签名。
 * 通过查询参数传递：timestamp、sign。
 */
export async function verifyDingTalkSignature(
    secret: string,
    timestamp: string,
    sign: string,
): Promise<boolean> {
    // 钉钉消息格式：timestamp + 换行符 + secret，以 secret 为密钥
    const message = `${timestamp}\n${secret}`;
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(secret);
    const msgBytes = encoder.encode(message);
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        {name: 'HMAC', hash: 'SHA-256'},
        false,
        ['sign'],
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgBytes);
    const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
    // 查询参数中的 sign 是 URL 编码的 Base64
    const decodedSign = decodeURIComponent(sign);
    return base64Signature === decodedSign;
}

/**
 * 将钉钉 Webhook 消息解析为标准化的 IncomingMessage。
 */
export function parseDingTalkMessage(msg: DingTalkMessage): IncomingMessage {
    const rawType = (msg.msgtype ?? 'text').toLowerCase();

    let parsedType: MessageType = 'text';
    let content: string | undefined;
    let mediaId: string | undefined;

    if (rawType === 'text' || rawType === 'richText') {
        parsedType = 'text';
        content = msg.text?.content ?? extractRichText(msg) ?? '';
    } else if (rawType === 'picture') {
        parsedType = 'image';
        mediaId = msg.picture?.downloadCode;
    } else if (rawType === 'audio') {
        parsedType = 'voice';
        mediaId = msg.audio?.downloadCode;
    } else {
        parsedType = 'text';
        content = '';
    }

    return {
        platform: 'dingtalk',
        type: parsedType,
        from: msg.senderId ?? '',
        to: msg.robotCode ?? '',
        timestamp: Math.floor((msg.createAt ?? Date.now()) / 1000),
        messageId: msg.msgId ?? `${msg.createAt ?? Date.now()}`,
        content,
        mediaId,
        raw: msg,
    };
}

function extractRichText(msg: DingTalkMessage): string {
    const richText = msg.content?.richText ?? msg.richText ?? [];
    return richText
        .filter((item) => item.type === 'text')
        .map((item) => item.text ?? '')
        .join('');
}

/**
 * 通过会话 Webhook URL 向钉钉发送回复。
 *
 * 当 `reply.mentions` 被设置时，会在 payload 中追加 `at` 块，
 * 以 @通知被提及的用户。
 */
export async function sendDingTalkReply(
    reply: ReplyMessage,
    sessionWebhook: string,
): Promise<void> {
    let payload: Record<string, unknown>;

    if (reply.type === 'text') {
        payload = {msgtype: 'text', text: {content: reply.content}};
    } else if (reply.type === 'markdown') {
        payload = {
            msgtype: 'markdown',
            markdown: {title: reply.title ?? 'Message', text: reply.content},
        };
    } else if (reply.type === 'news') {
        const first = reply.articles[0];
        payload = {
            msgtype: 'actionCard',
            actionCard: {
                title: first?.title ?? 'News',
                text: reply.articles
                    .map((a) => `**${a.title}**\n${a.description ?? ''}\n[查看详情](${a.url ?? ''})`)
                    .join('\n\n'),
            },
        };
    } else {
        payload = {msgtype: 'text', text: {content: '不支持的回复类型'}};
    }

    // 设置了 mentions 时追加 @提及块
    if (reply.mentions?.length) {
        payload.at = {atUserIds: reply.mentions, isAtAll: false};
    }

    await fetch(sessionWebhook, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
    });
}

/**
 * 钉钉请求主处理器。
 */
export async function handleDingTalk(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', {status: 405});
    }

    // 如果配置了密钥，验证签名
    const appSecret = env.DINGTALK_APP_SECRET ?? '';
    if (appSecret) {
        const url = new URL(request.url);
        const timestamp = url.searchParams.get('timestamp') ?? '';
        const sign = url.searchParams.get('sign') ?? '';
        const valid = await verifyDingTalkSignature(appSecret, timestamp, sign);
        if (!valid) {
            logger.warn('钉钉签名验证失败');
            return new Response('Invalid signature', {status: 403});
        }
    }

    let body: DingTalkMessage;
    try {
        body = (await request.json()) as DingTalkMessage;
    } catch {
        logger.error('钉钉消息 JSON 解析失败');
        return new Response('Invalid JSON', {status: 400});
    }

    const message = parseDingTalkMessage(body);

    const {routeMessage, toReplyArray} = await import('../../router/index.js');
    const response = await routeMessage(message, env);
    const replies = toReplyArray(response);

    if (replies.length > 0 && body.sessionWebhook) {
        for (const reply of replies) {
            await sendDingTalkReply(reply, body.sessionWebhook);
        }
    }

    return new Response(JSON.stringify({errcode: 0, errmsg: 'ok'}), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
    });
}
