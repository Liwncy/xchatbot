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
import { logger } from '../../utils/logger.js';

function ensureWechatApiSuccess(op: string, result: unknown): void {
  const code = (result as { code?: unknown })?.code;
  const message = (result as { message?: unknown })?.message;
  if (typeof code === 'number' && code !== 0) {
    throw new Error(`${op} failed: code=${code}, message=${String(message ?? '')}`);
  }
}

/**
 * 验证微信网关的 Webhook 签名。
 * 使用 HMAC-SHA256(timestamp + body, token) 进行认证。
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

/** 将微信数字消息类型映射为标准化类型。 */
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

/** 根据网关字段推断消息来源。 */
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

/** 将毫秒时间戳转换为标准化消息模型所需的秒级时间戳。 */
function toUnixSeconds(timestamp: number): number {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return Math.floor(Date.now() / 1000);
  return timestamp > 1_000_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
}

/**
 * 将微信推送消息解析为标准化的 IncomingMessage。
 * 如果 `new_messages` 中没有消息则抛出异常。
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
    // 优先使用 msg_id 以避免大 new_msg_id 值的精度损失。
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
 * 构建发送给微信网关的 JSON 回复数据。
 *
 * 当 `reply.to` 被设置时会覆盖默认接收者。
 * 当 `reply.mentions` 被设置且消息发送到群聊时，
 * 会包含 `remind` 字段（逗号分隔的 wxid），以便网关 @提及这些用户。
 */
export function buildWechatReply(
  reply: ReplyMessage,
  toUser: string,
  roomId?: string,
): Record<string, unknown> {
  const effectiveTo = reply.to ?? (roomId ? roomId : toUser);
  const target: Record<string, unknown> = { to: effectiveTo };

  // 发送到群聊时包含 @提及列表
  if (reply.mentions?.length && (roomId || reply.to?.endsWith('@chatroom'))) {
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
 * 通过微信网关 API 发送回复。
 *
 * 使用类型化的 {@link WechatApi} 客户端，根据回复类型调用相应的消息接口。
 *
 * 当 `reply.to` 被设置时会覆盖默认 `receiver`。
 * 当 `reply.mentions` 被设置时，`remind` 参数会被转发，
 * 以便网关在群聊中 @提及这些用户。
 */
export async function sendWechatReply(
  api: WechatApi,
  reply: ReplyMessage,
  receiver: string,
  env?: Env,
): Promise<void> {
  const effectiveReceiver = reply.to ?? receiver;

  switch (reply.type) {
    case 'text':
    case 'markdown': {
      const result = await api.sendText({
        receiver: effectiveReceiver,
        content: reply.content,
        remind: reply.mentions?.length ? reply.mentions.join(',') : undefined,
      });
      ensureWechatApiSuccess('sendText', result);
      break;
    }
    case 'image': {
      const result = await api.sendImage({ receiver: effectiveReceiver, data: reply.mediaId });
      ensureWechatApiSuccess('sendImage', result);
      break;
    }
    case 'voice': {
      // VoiceReply 中没有 duration / format 字段；使用安全默认值（AMR 格式，未知时长）
      const result = await api.sendVoice({ receiver: effectiveReceiver, data: reply.mediaId, duration: 0, format: 0 });
      ensureWechatApiSuccess('sendVoice', result);
      break;
    }
    case 'video': {
      const { thumbData, duration } = resolveVideoOptions(env);
      const result = await api.sendVideo({
        receiver: effectiveReceiver,
        video_data: reply.mediaId,
        thumb_data: thumbData,
        duration,
      });
      ensureWechatApiSuccess('sendVideo', result);
      break;
    }
    case 'news': {
      const first = reply.articles[0];
      if (first?.url) {
        const result = await api.sendLink({
          receiver: effectiveReceiver,
          url: first.url,
          title: first.title,
          desc: first.description ?? '',
          thumb_url: first.picUrl ?? '',
        });
        ensureWechatApiSuccess('sendLink', result);
      }
      break;
    }
    default:
      break;
  }
}

function resolveVideoOptions(env?: Env): { thumbData: string; duration: number } {
  const thumbData = env?.WECHAT_VIDEO_THUMB_BASE64?.trim() ?? '';
  const durationRaw = env?.WECHAT_VIDEO_DURATION?.trim();
  const parsed = durationRaw ? Number(durationRaw) : 0;
  const duration = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
  return { thumbData, duration };
}

/**
 * 微信个人号请求主处理器。
 * 接收来自网关的 JSON 数据并处理消息。
 *
 * 当 {@link Env.WECHAT_API_BASE_URL} 被设置时，通过类型化 API 客户端发送回复；
 * 否则使用旧版回调 URL。
 */
export async function handleWechat(request: Request, env: Env): Promise<Response> {
  const token = env.WECHAT_TOKEN ?? '';
  const callbackUrl = env.WECHAT_CALLBACK_URL ?? '';
  const apiBaseUrl = env.WECHAT_API_BASE_URL ?? '';

  // 仅接受 POST 请求
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const body = await request.text();

  logger.debug('收到微信消息', body);

  // 如果配置了 token，验证 HMAC-SHA256 签名
  if (token) {
    const signature = request.headers.get('x-signature') ?? '';
    const timestamp = request.headers.get('x-timestamp') ?? '';

    const valid = await verifyWechatSignature(token, signature, timestamp, body);
    if (!valid) {
      logger.warn('微信签名验证失败');
      return new Response('Invalid signature', { status: 403 });
    }
  }

  let payload: WechatPushMessage;
  try {
    payload = JSON.parse(body) as WechatPushMessage;
  } catch {
    logger.error('微信消息 JSON 解析失败', body);
    return new Response('Invalid JSON', { status: 400 });
  }

  let message: IncomingMessage;
  try {
    message = parseWechatMessage(payload);
  } catch {
    // 忽略非消息推送（联系人变更、个人资料更新等）
    logger.debug('跳过非消息推送');
    return new Response(JSON.stringify({ success: true, skipped: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 分发到路由
  const { routeMessage, toReplyArray } = await import('../../router/index.js');
  const response = await routeMessage(message, env);
  const replies = toReplyArray(response);

  if (replies.length === 0) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const receiver = message.room?.id ?? message.from;

  // 优先使用类型化 API 客户端（需配置 base URL）
  if (apiBaseUrl) {
    const api = new WechatApi(apiBaseUrl);
    for (const reply of replies) {
      try {
        await sendWechatReply(api, reply, receiver, env);
      } catch (err) {
        logger.error('微信 API 发送回复失败', err);
      }
    }
  } else if (callbackUrl) {
    // 旧版方式：将构建好的数据发送到回调 URL
    for (const reply of replies) {
      const replyPayload = buildWechatReply(reply, message.from, message.room?.id);
      try {
        await fetch(callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(replyPayload),
        });
      } catch (err) {
        // 回调发送失败；仍在响应体中返回回复
        logger.error('微信回调发送失败', err);
      }
    }
  }

  // 同时在响应体中返回回复
  const replyPayloads = replies.map((r) => buildWechatReply(r, message.from, message.room?.id));
  const responseBody = replyPayloads.length === 1 ? replyPayloads[0] : replyPayloads;
  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
