import { sha1Hex } from '../../utils/crypto.js';
import { parseXml, buildXml } from '../../utils/xml.js';
import type {
  IncomingMessage,
  ReplyMessage,
  EventType,
  MessageType,
  Env,
} from '../../types/message.js';
import type { WechatXmlMessage } from './types.js';

/**
 * Verify the WeChat server signature.
 * WeChat sends: signature, timestamp, nonce as query parameters.
 * We must sort [token, timestamp, nonce] alphabetically, join them, SHA-1 hash, and compare.
 */
export async function verifyWechatSignature(
  token: string,
  signature: string,
  timestamp: string,
  nonce: string,
): Promise<boolean> {
  const sorted = [token, timestamp, nonce].sort().join('');
  const expected = await sha1Hex(sorted);
  return expected === signature;
}

/**
 * Parse the WeChat XML body into a normalized IncomingMessage.
 */
export function parseWechatMessage(xml: string): IncomingMessage {
  const fields = parseXml(xml) as WechatXmlMessage;
  const msgType = (fields.MsgType ?? '').toLowerCase() as MessageType;
  const timestamp = parseInt(fields.CreateTime ?? '0', 10);

  const base = {
    platform: 'wechat' as const,
    from: fields.FromUserName ?? '',
    to: fields.ToUserName ?? '',
    timestamp,
    messageId: fields.MsgId ?? `${timestamp}`,
    raw: fields,
  };

  if (msgType === 'text') {
    return { ...base, type: 'text', content: fields.Content ?? '' };
  }

  if (msgType === 'image') {
    return { ...base, type: 'image', mediaId: fields.MediaId, content: fields.PicUrl };
  }

  if (msgType === 'voice') {
    return { ...base, type: 'voice', mediaId: fields.MediaId };
  }

  if (msgType === 'video' || msgType === 'shortvideo') {
    return { ...base, type: 'video', mediaId: fields.MediaId };
  }

  if (msgType === 'location') {
    return {
      ...base,
      type: 'location',
      location: {
        latitude: parseFloat(fields.Location_X ?? '0'),
        longitude: parseFloat(fields.Location_Y ?? '0'),
        precision: parseFloat(fields.Precision ?? '0'),
        label: fields.Label,
      },
    };
  }

  if (msgType === 'link') {
    return {
      ...base,
      type: 'link',
      link: {
        title: fields.Title ?? '',
        description: fields.Description ?? '',
        url: fields.Url ?? '',
      },
    };
  }

  if (msgType === 'event') {
    const eventStr = (fields.Event ?? '').toLowerCase();
    const eventTypeMap: Record<string, EventType> = {
      subscribe: 'subscribe',
      unsubscribe: 'unsubscribe',
      scan: 'scan',
      location: 'location',
      click: 'click',
      view: 'view',
    };
    return {
      ...base,
      type: 'event',
      event: {
        type: eventTypeMap[eventStr] ?? 'unknown',
        key: fields.EventKey,
        ticket: fields.Ticket,
      },
    };
  }

  // Fallback: treat as text
  return { ...base, type: 'text', content: '' };
}

/**
 * Convert a ReplyMessage to the WeChat XML reply format.
 * Returns an empty string if the reply type is not supported.
 */
export function buildWechatReply(
  reply: ReplyMessage,
  toUser: string,
  fromUser: string,
): string {
  const timestamp = Math.floor(Date.now() / 1000);

  if (reply.type === 'text') {
    return buildXml('xml', {
      ToUserName: toUser,
      FromUserName: fromUser,
      CreateTime: timestamp,
      MsgType: 'text',
      Content: reply.content,
    });
  }

  if (reply.type === 'image') {
    return buildXml('xml', {
      ToUserName: toUser,
      FromUserName: fromUser,
      CreateTime: timestamp,
      MsgType: 'image',
      MediaId: reply.mediaId,
    });
  }

  if (reply.type === 'voice') {
    return buildXml('xml', {
      ToUserName: toUser,
      FromUserName: fromUser,
      CreateTime: timestamp,
      MsgType: 'voice',
      MediaId: reply.mediaId,
    });
  }

  if (reply.type === 'video') {
    return buildXml('xml', {
      ToUserName: toUser,
      FromUserName: fromUser,
      CreateTime: timestamp,
      MsgType: 'video',
      MediaId: reply.mediaId,
      Title: reply.title ?? '',
      Description: reply.description ?? '',
    });
  }

  if (reply.type === 'news') {
    const articleCount = reply.articles.length;
    const articleXml = reply.articles
      .map(
        (a) =>
          `<item>` +
          `<Title><![CDATA[${a.title}]]></Title>` +
          `<Description><![CDATA[${a.description ?? ''}]]></Description>` +
          `<PicUrl><![CDATA[${a.picUrl ?? ''}]]></PicUrl>` +
          `<Url><![CDATA[${a.url ?? ''}]]></Url>` +
          `</item>`,
      )
      .join('');
    return (
      `<xml>` +
      `<ToUserName><![CDATA[${toUser}]]></ToUserName>` +
      `<FromUserName><![CDATA[${fromUser}]]></FromUserName>` +
      `<CreateTime>${timestamp}</CreateTime>` +
      `<MsgType><![CDATA[news]]></MsgType>` +
      `<ArticleCount>${articleCount}</ArticleCount>` +
      `<Articles>${articleXml}</Articles>` +
      `</xml>`
    );
  }

  return '';
}

/**
 * Main WeChat request handler.
 * - GET: server verification (echo echostr)
 * - POST: process incoming message and return XML reply
 */
export async function handleWechat(request: Request, env: Env): Promise<Response> {
  const token = env.WECHAT_TOKEN ?? '';
  const url = new URL(request.url);
  const signature = url.searchParams.get('signature') ?? '';
  const timestamp = url.searchParams.get('timestamp') ?? '';
  const nonce = url.searchParams.get('nonce') ?? '';

  // Verify signature for all WeChat requests
  const valid = await verifyWechatSignature(token, signature, timestamp, nonce);
  if (!valid) {
    return new Response('Invalid signature', { status: 403 });
  }

  // GET request: server URL verification
  if (request.method === 'GET') {
    const echostr = url.searchParams.get('echostr') ?? '';
    return new Response(echostr, { status: 200 });
  }

  // POST request: process message
  if (request.method === 'POST') {
    const body = await request.text();
    const message = parseWechatMessage(body);

    // Dispatch to router
    const { routeMessage } = await import('../../router/index.js');
    const reply = await routeMessage(message, env);

    if (!reply) {
      return new Response('', { status: 200 });
    }

    const xmlReply = buildWechatReply(reply, message.from, message.to);
    return new Response(xmlReply, {
      status: 200,
      headers: { 'Content-Type': 'application/xml' },
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
