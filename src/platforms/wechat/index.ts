import { hmacSha256Hex } from '../../utils/crypto.js';
import type {
  IncomingMessage,
  ReplyMessage,
  MessageType,
  MessageSource,
  Env,
} from '../../types/message.js';
import type { WechatPersonalMessage } from './types.js';
import { WechatApi } from './api.js';

/**
 * Verify the webhook signature from the WeChat bridge/gateway.
 * Uses HMAC-SHA256(timestamp + body, token) for authentication.
 */
export async function verifyWechatSignature(
  token: string,
  signature: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  const expected = await hmacSha256Hex(token, timestamp + body);
  return expected === signature;
}

/**
 * Parse the JSON body from the WeChat personal account bridge
 * into a normalized IncomingMessage.
 */
export function parseWechatMessage(payload: WechatPersonalMessage): IncomingMessage {
  const msgType = (payload.type ?? '').toLowerCase() as MessageType;
  const sourceMap: Record<string, MessageSource> = {
    private: 'private',
    group: 'group',
    official: 'official',
  };
  const source: MessageSource = sourceMap[payload.source] ?? 'private';

  const base: Omit<IncomingMessage, 'type'> = {
    platform: 'wechat' as const,
    source,
    from: payload.from?.id ?? '',
    senderName: payload.from?.name,
    to: payload.self ?? '',
    timestamp: payload.timestamp ?? Math.floor(Date.now() / 1000),
    messageId: payload.messageId ?? `${payload.timestamp}`,
    raw: payload,
  };

  // Attach room info for group messages
  if (payload.room) {
    base.room = {
      id: payload.room.id,
      topic: payload.room.topic,
    };
  }

  if (msgType === 'text') {
    return { ...base, type: 'text', content: payload.content ?? '' };
  }

  if (msgType === 'image') {
    return { ...base, type: 'image', mediaId: payload.mediaUrl };
  }

  if (msgType === 'voice') {
    return { ...base, type: 'voice', mediaId: payload.mediaUrl };
  }

  if (msgType === 'video') {
    return { ...base, type: 'video', mediaId: payload.mediaUrl };
  }

  if (msgType === 'location') {
    return {
      ...base,
      type: 'location',
      location: {
        latitude: payload.location?.latitude ?? 0,
        longitude: payload.location?.longitude ?? 0,
        label: payload.location?.label,
      },
    };
  }

  if (msgType === 'link') {
    return {
      ...base,
      type: 'link',
      link: {
        title: payload.link?.title ?? '',
        description: payload.link?.description ?? '',
        url: payload.link?.url ?? '',
      },
    };
  }

  // Fallback: treat as text
  return { ...base, type: 'text', content: payload.content ?? '' };
}

/**
 * Build the JSON reply payload to send back to the WeChat bridge.
 */
export function buildWechatReply(
  reply: ReplyMessage,
  toUser: string,
  roomId?: string,
): Record<string, unknown> {
  const target: Record<string, unknown> = roomId ? { to: roomId } : { to: toUser };

  if (reply.type === 'text') {
    return { ...target, type: 'text', content: reply.content };
  }

  if (reply.type === 'image') {
    return { ...target, type: 'image', mediaUrl: reply.mediaId };
  }

  if (reply.type === 'voice') {
    return { ...target, type: 'voice', mediaUrl: reply.mediaId };
  }

  if (reply.type === 'video') {
    return {
      ...target,
      type: 'video',
      mediaUrl: reply.mediaId,
      title: reply.title ?? '',
      description: reply.description ?? '',
    };
  }

  if (reply.type === 'news') {
    return {
      ...target,
      type: 'news',
      articles: reply.articles,
    };
  }

  if (reply.type === 'markdown') {
    return { ...target, type: 'text', content: reply.content };
  }

  return {};
}

/**
 * Send a reply through the WeChat bridge API.
 *
 * Uses the typed {@link WechatApi} client to call the appropriate
 * message endpoint based on the reply type.
 */
export async function sendWechatReply(
  api: WechatApi,
  reply: ReplyMessage,
  receiver: string,
): Promise<void> {
  switch (reply.type) {
    case 'text':
    case 'markdown':
      await api.sendText({ receiver, content: reply.content });
      break;
    case 'image':
      await api.sendImage({ receiver, data: reply.mediaId });
      break;
    case 'voice':
      // duration / format are not part of VoiceReply; use safe defaults (AMR, unknown length)
      await api.sendVoice({ receiver, data: reply.mediaId, duration: 0, format: 0 });
      break;
    case 'video':
      // thumb_data / duration are not part of VideoReply; use safe defaults
      await api.sendVideo({
        receiver,
        video_data: reply.mediaId,
        thumb_data: '',
        duration: 0,
      });
      break;
    case 'news': {
      const first = reply.articles[0];
      if (first?.url) {
        await api.sendLink({
          receiver,
          url: first.url,
          title: first.title,
          desc: first.description ?? '',
          thumb_url: first.picUrl ?? '',
        });
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Main WeChat personal account request handler.
 * Receives JSON from a bridge/gateway and processes the message.
 *
 * When {@link Env.WECHAT_API_BASE_URL} is set the reply is delivered
 * through the typed API client; otherwise the legacy callback URL is used.
 */
export async function handleWechat(request: Request, env: Env): Promise<Response> {
  const token = env.WECHAT_TOKEN ?? '';
  const callbackUrl = env.WECHAT_CALLBACK_URL ?? '';
  const apiBaseUrl = env.WECHAT_API_BASE_URL ?? '';

  // Only accept POST requests
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const body = await request.text();

  // Verify HMAC-SHA256 signature if token is configured
  if (token) {
    const signature = request.headers.get('x-signature') ?? '';
    const timestamp = request.headers.get('x-timestamp') ?? '';

    const valid = await verifyWechatSignature(token, signature, timestamp, body);
    if (!valid) {
      return new Response('Invalid signature', { status: 403 });
    }
  }

  let payload: WechatPersonalMessage;
  try {
    payload = JSON.parse(body) as WechatPersonalMessage;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const message = parseWechatMessage(payload);

  // Dispatch to router
  const { routeMessage } = await import('../../router/index.js');
  const reply = await routeMessage(message, env);

  if (!reply) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const receiver = message.room?.id ?? message.from;

  // Prefer the typed API client when a base URL is configured
  if (apiBaseUrl) {
    const api = new WechatApi(apiBaseUrl);
    try {
      await sendWechatReply(api, reply, receiver);
    } catch {
      // API delivery failed; fall through to legacy path
    }
  } else if (callbackUrl) {
    // Legacy: send the built payload to the callback URL
    const replyPayload = buildWechatReply(reply, message.from, message.room?.id);
    try {
      await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(replyPayload),
      });
    } catch {
      // Callback delivery failed; still return the reply in the response body
    }
  }

  // Also return the reply in the response
  const replyPayload = buildWechatReply(reply, message.from, message.room?.id);
  return new Response(JSON.stringify(replyPayload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
