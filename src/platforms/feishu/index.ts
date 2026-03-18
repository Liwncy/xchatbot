import {hmacSha256Hex} from '../../utils/crypto.js';
import type {Env, IncomingMessage, MessageType, ReplyMessage,} from '../../types/message.js';
import type {FeishuAudioContent, FeishuEventBody, FeishuImageContent, FeishuTextContent,} from './types.js';
import {logger} from '../../utils/logger.js';

/**
 * 验证飞书事件签名。
 * 飞书使用 HMAC-SHA256(timestamp + body, encrypt_key) 签名请求。
 * 签名 header 为 "X-Lark-Signature"。
 */
export async function verifyFeishuSignature(
    encryptKey: string,
    timestamp: string,
    body: string,
    signature: string,
): Promise<boolean> {
    const message = timestamp + body;
    const expected = await hmacSha256Hex(encryptKey, message);
    return expected === signature;
}

/**
 * 将飞书事件体解析为标准化的 IncomingMessage。
 */
export function parseFeishuMessage(body: FeishuEventBody): IncomingMessage | null {
    // 处理 URL 验证挑战
    if (body.type === 'url_verification' || body.challenge) {
        return null;
    }

    const event = body.event;
    if (!event?.message) {
        return null;
    }

    const {message, sender} = event;
    const senderId =
        sender?.sender_id?.open_id ?? sender?.sender_id?.user_id ?? 'unknown';
    const appId = body.header?.app_id ?? '';
    const timestamp = Math.floor(parseInt(message.create_time, 10) / 1000);

    const rawMsgType = message.message_type.toLowerCase();

    let content: string | undefined;
    let mediaId: string | undefined;
    let parsedType: MessageType = 'text';

    try {
        const contentObj = JSON.parse(message.content);

        if (rawMsgType === 'text') {
            parsedType = 'text';
            content = (contentObj as FeishuTextContent).text ?? '';
        } else if (rawMsgType === 'image') {
            parsedType = 'image';
            mediaId = (contentObj as FeishuImageContent).image_key;
        } else if (rawMsgType === 'audio') {
            parsedType = 'voice';
            mediaId = (contentObj as FeishuAudioContent).file_key;
        } else if (rawMsgType === 'video' || rawMsgType === 'file') {
            parsedType = 'video';
            mediaId = (contentObj as { file_key: string }).file_key;
        } else {
            parsedType = 'text';
            content = message.content;
        }
    } catch {
        parsedType = 'text';
        content = message.content;
    }

    return {
        platform: 'feishu',
        type: parsedType,
        from: senderId,
        to: appId,
        timestamp,
        messageId: message.message_id,
        content,
        mediaId,
        raw: body,
    };
}

/**
 * 通过飞书消息 API 发送回复。
 * 飞书使用 REST API，向 API 接口发送 JSON POST 请求。
 *
 * 当 `reply.to` 被设置时会覆盖默认 `chatId` 接收者。
 * 当 `reply.mentions` 被设置时，会在文本内容中追加 `<at user_id="...">...</at>` 标签，
 * 以通知被提及的用户。
 */
export async function sendFeishuReply(
    reply: ReplyMessage,
    chatId: string,
    appToken: string,
): Promise<void> {
    const effectiveChatId = reply.to ?? chatId;

    let msgType: string;
    let content: unknown;

    if (reply.type === 'text') {
        msgType = 'text';
        let text = reply.content;
        if (reply.mentions?.length) {
            const mentionTags = reply.mentions
                .map((id) => `<at user_id="${id}"></at>`)
                .join(' ');
            text = `${mentionTags} ${text}`;
        }
        content = {text};
    } else if (reply.type === 'image') {
        msgType = 'image';
        content = {image_key: reply.mediaId};
    } else if (reply.type === 'markdown') {
        msgType = 'post';
        const bodyContent: unknown[][] = [[{tag: 'md', text: reply.content}]];
        if (reply.mentions?.length) {
            const mentionElements = reply.mentions.map((id) => ({
                tag: 'at',
                user_id: id,
            }));
            bodyContent[0].push(...mentionElements);
        }
        content = {
            post: {
                zh_cn: {
                    title: reply.title ?? '',
                    content: bodyContent,
                },
            },
        };
    } else if (reply.type === 'card') {
        msgType = 'interactive';
        content = reply.cardContent;
    } else {
        msgType = 'text';
        content = {text: '不支持的回复类型'};
    }

    await fetch('https://open.feishu.cn/open-apis/im/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${appToken}`,
        },
        body: JSON.stringify({
            receive_id: effectiveChatId,
            receive_id_type: 'chat_id',
            msg_type: msgType,
            content: JSON.stringify(content),
        }),
    });
}

/**
 * 获取飞书应用访问令牌。
 */
async function getFeishuAppToken(appId: string, appSecret: string): Promise<string> {
    const response = await fetch(
        'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal',
        {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({app_id: appId, app_secret: appSecret}),
        },
    );
    const data = (await response.json()) as { app_access_token?: string };
    return data.app_access_token ?? '';
}

/**
 * 飞书请求主处理器。
 */
export async function handleFeishu(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', {status: 405});
    }

    const body = await request.text();

    // 如果配置了加密密钥，验证签名
    const encryptKey = env.FEISHU_ENCRYPT_KEY ?? '';
    if (encryptKey) {
        const timestamp = request.headers.get('X-Lark-Request-Timestamp') ?? '';
        const signature = request.headers.get('X-Lark-Signature') ?? '';
        const valid = await verifyFeishuSignature(encryptKey, timestamp, body, signature);
        if (!valid) {
            logger.warn('飞书签名验证失败');
            return new Response('Invalid signature', {status: 403});
        }
    }

    let eventBody: FeishuEventBody;
    try {
        eventBody = JSON.parse(body) as FeishuEventBody;
    } catch {
        logger.error('飞书消息 JSON 解析失败', body);
        return new Response('Invalid JSON', {status: 400});
    }

    // 处理 URL 验证
    if (eventBody.challenge) {
        return new Response(JSON.stringify({challenge: eventBody.challenge}), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        });
    }

    const message = parseFeishuMessage(eventBody);
    if (!message) {
        return new Response('', {status: 200});
    }

    const {routeMessage, toReplyArray} = await import('../../router/index.js');
    const response = await routeMessage(message, env);
    const replies = toReplyArray(response);

    if (replies.length > 0 && env.FEISHU_APP_ID && env.FEISHU_APP_SECRET) {
        const appToken = await getFeishuAppToken(env.FEISHU_APP_ID, env.FEISHU_APP_SECRET);
        const chatId = (eventBody.event?.message as { chat_id?: string } | undefined)?.chat_id ?? '';
        if (appToken && chatId) {
            for (const reply of replies) {
                await sendFeishuReply(reply, chatId, appToken);
            }
        }
    }

    return new Response('', {status: 200});
}
