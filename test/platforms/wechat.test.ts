import { describe, it, expect, vi } from 'vitest';
import {
  verifyWechatSignature,
  parseWechatMessage,
  buildWechatReply,
} from '../../src/platforms/wechat/index.js';
import type { ReplyMessage } from '../../src/types/message.js';

describe('verifyWechatSignature', () => {
  it('returns true for valid signature', async () => {
    // token=testtoken, timestamp=1700000000, nonce=nonce123
    // sorted: [testtoken, 1700000000, nonce123] -> [1700000000, nonce123, testtoken]
    // We pre-compute the expected SHA1 via Node crypto for comparison
    const { createHash } = await import('crypto');
    const token = 'testtoken';
    const timestamp = '1700000000';
    const nonce = 'nonce123';
    const sorted = [token, timestamp, nonce].sort().join('');
    const signature = createHash('sha1').update(sorted).digest('hex');

    const result = await verifyWechatSignature(token, signature, timestamp, nonce);
    expect(result).toBe(true);
  });

  it('returns false for invalid signature', async () => {
    const result = await verifyWechatSignature('token', 'badsignature', '12345', 'abc');
    expect(result).toBe(false);
  });
});

describe('parseWechatMessage', () => {
  it('parses text message', () => {
    const xml =
      '<xml>' +
      '<ToUserName><![CDATA[gh_123]]></ToUserName>' +
      '<FromUserName><![CDATA[user_456]]></FromUserName>' +
      '<CreateTime>1700000000</CreateTime>' +
      '<MsgType><![CDATA[text]]></MsgType>' +
      '<Content><![CDATA[Hello Bot]]></Content>' +
      '<MsgId>1234567890</MsgId>' +
      '</xml>';

    const msg = parseWechatMessage(xml);
    expect(msg.platform).toBe('wechat');
    expect(msg.type).toBe('text');
    expect(msg.content).toBe('Hello Bot');
    expect(msg.from).toBe('user_456');
    expect(msg.to).toBe('gh_123');
    expect(msg.messageId).toBe('1234567890');
  });

  it('parses image message', () => {
    const xml =
      '<xml>' +
      '<ToUserName><![CDATA[gh_123]]></ToUserName>' +
      '<FromUserName><![CDATA[user_456]]></FromUserName>' +
      '<CreateTime>1700000000</CreateTime>' +
      '<MsgType><![CDATA[image]]></MsgType>' +
      '<PicUrl><![CDATA[https://example.com/img.jpg]]></PicUrl>' +
      '<MediaId><![CDATA[media_001]]></MediaId>' +
      '<MsgId>1234567891</MsgId>' +
      '</xml>';

    const msg = parseWechatMessage(xml);
    expect(msg.type).toBe('image');
    expect(msg.mediaId).toBe('media_001');
  });

  it('parses subscribe event', () => {
    const xml =
      '<xml>' +
      '<ToUserName><![CDATA[gh_123]]></ToUserName>' +
      '<FromUserName><![CDATA[user_456]]></FromUserName>' +
      '<CreateTime>1700000000</CreateTime>' +
      '<MsgType><![CDATA[event]]></MsgType>' +
      '<Event><![CDATA[subscribe]]></Event>' +
      '</xml>';

    const msg = parseWechatMessage(xml);
    expect(msg.type).toBe('event');
    expect(msg.event?.type).toBe('subscribe');
  });

  it('parses location message', () => {
    const xml =
      '<xml>' +
      '<ToUserName><![CDATA[gh_123]]></ToUserName>' +
      '<FromUserName><![CDATA[user_456]]></FromUserName>' +
      '<CreateTime>1700000000</CreateTime>' +
      '<MsgType><![CDATA[location]]></MsgType>' +
      '<Location_X>39.9</Location_X>' +
      '<Location_Y>116.4</Location_Y>' +
      '<Scale>16</Scale>' +
      '<Label><![CDATA[Beijing]]></Label>' +
      '<MsgId>1234567892</MsgId>' +
      '</xml>';

    const msg = parseWechatMessage(xml);
    expect(msg.type).toBe('location');
    expect(msg.location?.latitude).toBe(39.9);
    expect(msg.location?.longitude).toBe(116.4);
    expect(msg.location?.label).toBe('Beijing');
  });

  it('parses link message', () => {
    const xml =
      '<xml>' +
      '<ToUserName><![CDATA[gh_123]]></ToUserName>' +
      '<FromUserName><![CDATA[user_456]]></FromUserName>' +
      '<CreateTime>1700000000</CreateTime>' +
      '<MsgType><![CDATA[link]]></MsgType>' +
      '<Title><![CDATA[Test Page]]></Title>' +
      '<Description><![CDATA[Desc]]></Description>' +
      '<Url><![CDATA[https://example.com]]></Url>' +
      '<MsgId>1234567893</MsgId>' +
      '</xml>';

    const msg = parseWechatMessage(xml);
    expect(msg.type).toBe('link');
    expect(msg.link?.title).toBe('Test Page');
    expect(msg.link?.url).toBe('https://example.com');
  });
});

describe('buildWechatReply', () => {
  it('builds text reply XML', () => {
    const reply: ReplyMessage = { type: 'text', content: 'Hello User' };
    const xml = buildWechatReply(reply, 'user_456', 'gh_123');
    expect(xml).toContain('<MsgType><![CDATA[text]]></MsgType>');
    expect(xml).toContain('<Content><![CDATA[Hello User]]></Content>');
    expect(xml).toContain('<ToUserName><![CDATA[user_456]]></ToUserName>');
    expect(xml).toContain('<FromUserName><![CDATA[gh_123]]></FromUserName>');
  });

  it('builds image reply XML', () => {
    const reply: ReplyMessage = { type: 'image', mediaId: 'media_001' };
    const xml = buildWechatReply(reply, 'user_456', 'gh_123');
    expect(xml).toContain('<MsgType><![CDATA[image]]></MsgType>');
    expect(xml).toContain('<MediaId><![CDATA[media_001]]></MediaId>');
  });

  it('builds news reply XML', () => {
    const reply: ReplyMessage = {
      type: 'news',
      articles: [
        { title: 'Article 1', description: 'Desc 1', url: 'https://example.com/1', picUrl: '' },
        { title: 'Article 2', description: 'Desc 2', url: 'https://example.com/2', picUrl: '' },
      ],
    };
    const xml = buildWechatReply(reply, 'user_456', 'gh_123');
    expect(xml).toContain('<MsgType><![CDATA[news]]></MsgType>');
    expect(xml).toContain('<ArticleCount>2</ArticleCount>');
    expect(xml).toContain('Article 1');
    expect(xml).toContain('Article 2');
  });

  it('returns empty string for unsupported reply type', () => {
    const reply = { type: 'card', cardContent: {} } as ReplyMessage;
    const xml = buildWechatReply(reply, 'user', 'bot');
    expect(xml).toBe('');
  });
});
