import {hmacSha256Hex} from '../../utils/crypto.js';
import type {Env, IncomingMessage, MessageType, ReplyMessage,} from '../../types/message.js';
import type {FeishuAudioContent, FeishuEventBody, FeishuImageContent, FeishuTextContent,} from './types.js';

/**
 * Verify Feishu event signature.
 * Feishu signs requests using: HMAC-SHA256(timestamp + body, encrypt_key).
 * The signature header is "X-Lark-Signature".
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
 * Parse a Feishu event body into a normalized IncomingMessage.
 */
export function parseFeishuMessage(body: FeishuEventBody): IncomingMessage | null {
  // Handle URL verification challenge
  if (body.type === 'url_verification' || body.challenge) {
    return null;
  }

  const event = body.event;
  if (!event?.message) {
    return null;
  }

  const { message, sender } = event;
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
 * Send a reply message via the Feishu Messaging API.
 * Feishu uses a REST API, so we POST JSON to the API endpoint.
 *
 * When `reply.to` is set it overrides the default `chatId` recipient.
 * When `reply.mentions` is set, `<at user_id="...">...</at>` tags are
 * appended to text content so the mentioned users are notified.
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
    content = { text };
  } else if (reply.type === 'image') {
    msgType = 'image';
    content = { image_key: reply.mediaId };
  } else if (reply.type === 'markdown') {
    msgType = 'post';
    const bodyContent: unknown[][] = [[{ tag: 'md', text: reply.content }]];
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
    content = { text: 'Unsupported reply type' };
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
 * Obtain a Feishu app access token.
 */
async function getFeishuAppToken(appId: string, appSecret: string): Promise<string> {
  const response = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    },
  );
  const data = (await response.json()) as { app_access_token?: string };
  return data.app_access_token ?? '';
}

/**
 * Main Feishu request handler.
 */
export async function handleFeishu(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const body = await request.text();

  // Verify signature if encrypt key is configured
  const encryptKey = env.FEISHU_ENCRYPT_KEY ?? '';
  if (encryptKey) {
    const timestamp = request.headers.get('X-Lark-Request-Timestamp') ?? '';
    const signature = request.headers.get('X-Lark-Signature') ?? '';
    const valid = await verifyFeishuSignature(encryptKey, timestamp, body, signature);
    if (!valid) {
      return new Response('Invalid signature', { status: 403 });
    }
  }

  let eventBody: FeishuEventBody;
  try {
    eventBody = JSON.parse(body) as FeishuEventBody;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Handle URL verification
  if (eventBody.challenge) {
    return new Response(JSON.stringify({ challenge: eventBody.challenge }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const message = parseFeishuMessage(eventBody);
  if (!message) {
    return new Response('', { status: 200 });
  }

  const { routeMessage } = await import('../../router/index.js');
  const reply = await routeMessage(message, env);

  if (reply && env.FEISHU_APP_ID && env.FEISHU_APP_SECRET) {
    const appToken = await getFeishuAppToken(env.FEISHU_APP_ID, env.FEISHU_APP_SECRET);
    const chatId = (eventBody.event?.message as { chat_id?: string } | undefined)?.chat_id ?? '';
    if (appToken && chatId) {
      await sendFeishuReply(reply, chatId, appToken);
    }
  }

  return new Response('', { status: 200 });
}
