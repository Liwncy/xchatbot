import { hmacSha256Hex } from '../../utils/crypto.js';
import type {
  IncomingMessage,
  ReplyMessage,
  MessageType,
  MessageSource,
  Env,
} from '../../types/message.js';
import type { WechatPushItem, WechatPushMessage } from './types.js';
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

/** Map WeChat numeric message type to normalized type. */
function mapWechatType(type: number): MessageType {
  switch (type) {
    case 1:
      return 'text';
    case 47:
      return 'image';
    case 34:
      return 'voice';
    case 43:
      return 'video';
    case 48:
      return 'location';
    case 49:
      return 'link';
    default:
      return 'text';
  }
}

/** Infer message source from gateway fields. */
function inferWechatSource(payload: WechatPushItem): MessageSource {
  const source = payload.msg_source?.toLowerCase() ?? '';
  const sender = payload.sender?.value ?? '';
  const receiver = payload.receiver?.value ?? '';

  if (source.includes('official')) return 'official';
  if (
    source.includes('chatroom') ||
    sender.endsWith('@chatroom') ||
    receiver.endsWith('@chatroom')
  ) {
    return 'group';
  }

  return 'private';
}

/** Convert millisecond timestamps to seconds for normalized message model. */
function toUnixSeconds(timestamp: number): number {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return Math.floor(Date.now() / 1000);
  return timestamp > 1_000_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
}

/**
 * Parse the WeChat push payload into a normalized IncomingMessage.
 * Throws if there is no message in `new_messages`.
 */
export function parseWechatMessage(payload: WechatPushMessage): IncomingMessage {
  const item = payload.new_messages?.[0];
  if (!item) {
    throw new Error('No new_messages in WeChat push payload');
  }

  const msgType = mapWechatType(item.type);
  const source = inferWechatSource(item);

  const base: Omit<IncomingMessage, 'type'> = {
    platform: 'wechat' as const,
    source,
    from: item.sender?.value ?? '',
    to: item.receiver?.value ?? '',
    timestamp: toUnixSeconds(item.create_time),
    // Prefer msg_id to avoid precision loss on large new_msg_id values.
    messageId: String(item.msg_id ?? item.create_time),
    raw: payload,
  };

  if (source === 'group') {
    base.room = {
      id: item.receiver?.value?.endsWith('@chatroom')
        ? item.receiver.value
        : item.sender?.value?.endsWith('@chatroom')
          ? item.sender.value
          : item.receiver?.value ?? '',
    };
  }

  if (msgType === 'text') {
    return {
      ...base,
      type: 'text',
      content: item.content?.value ?? item.push_content ?? '',
    };
  }

  if (msgType === 'image') {
    return {
      ...base,
      type: 'image',
      mediaId: item.image_buffer?.buffer?.length ? item.image_buffer.buffer.join(',') : undefined,
    };
  }

  if (msgType === 'voice') {
    return { ...base, type: 'voice' };
  }

  if (msgType === 'video') {
    return { ...base, type: 'video' };
  }

  if (msgType === 'location') {
    return {
      ...base,
      type: 'location',
      location: {
        latitude: 0,
        longitude: 0,
      },
    };
  }

  if (msgType === 'link') {
    return {
      ...base,
      type: 'link',
      link: {
        title: item.content?.value ?? '',
        description: '',
        url: '',
      },
    };
  }

  return { ...base, type: 'text', content: item.content?.value ?? item.push_content ?? '' };
}

/**
 * Build the JSON reply payload to send back to the WeChat bridge.
 *
 * When `reply.to` is set it overrides the default recipient.
 * When `reply.mentions` is set and the message is sent to a group,
 * a `remind` field (comma-separated wxids) is included so the bridge
 * can @-mention those users.
 */
export function buildWechatReply(
  reply: ReplyMessage,
  toUser: string,
  roomId?: string,
): Record<string, unknown> {
  const effectiveTo = reply.to ?? (roomId ? roomId : toUser);
  const target: Record<string, unknown> = { to: effectiveTo };

  // Include @mention list when sending to a group
  if (reply.mentions?.length && (roomId || reply.to)) {
    target.remind = reply.mentions.join(',');
  }

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
 *
 * When `reply.to` is set it overrides the default `receiver`.
 * When `reply.mentions` is set the `remind` parameter is forwarded
 * so that the bridge @-mentions those users in group chats.
 */
export async function sendWechatReply(
  api: WechatApi,
  reply: ReplyMessage,
  receiver: string,
): Promise<void> {
  const effectiveReceiver = reply.to ?? receiver;

  switch (reply.type) {
    case 'text':
    case 'markdown':
      await api.sendText({
        receiver: effectiveReceiver,
        content: reply.content,
        remind: reply.mentions?.length ? reply.mentions.join(',') : undefined,
      });
      break;
    case 'image':
      await api.sendImage({ receiver: effectiveReceiver, data: reply.mediaId });
      break;
    case 'voice':
      // duration / format are not part of VoiceReply; use safe defaults (AMR, unknown length)
      await api.sendVoice({ receiver: effectiveReceiver, data: reply.mediaId, duration: 0, format: 0 });
      break;
    case 'video':
      // thumb_data / duration are not part of VideoReply; use safe defaults
      await api.sendVideo({
        receiver: effectiveReceiver,
        video_data: reply.mediaId,
        thumb_data: '',
        duration: 0,
      });
      break;
    case 'news': {
      const first = reply.articles[0];
      if (first?.url) {
        await api.sendLink({
          receiver: effectiveReceiver,
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

  console.log('Received WeChat message:', body);

  // Verify HMAC-SHA256 signature if token is configured
  if (token) {
    const signature = request.headers.get('x-signature') ?? '';
    const timestamp = request.headers.get('x-timestamp') ?? '';

    const valid = await verifyWechatSignature(token, signature, timestamp, body);
    if (!valid) {
      return new Response('Invalid signature', { status: 403 });
    }
  }

  let payload: WechatPushMessage;
  try {
    payload = JSON.parse(body) as WechatPushMessage;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  let message: IncomingMessage;
  try {
    message = parseWechatMessage(payload);
  } catch {
    // Ignore non-message push updates (contacts/profile changes etc.)
    return new Response(JSON.stringify({ success: true, skipped: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // console.log('Received WeChat message:', message);

  // Dispatch to router
  const { routeMessage } = await import('../../router/index.js');
  const reply = await routeMessage(message, env);

  // console.log('Generated reply for WeChat message:', reply);

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
