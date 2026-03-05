import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WechatApi } from '../../src/platforms/wechat/api.js';
import { sendWechatReply } from '../../src/platforms/wechat/index.js';
import type { ReplyMessage } from '../../src/types/message.js';
import type { ApiResponse } from '../../src/platforms/wechat/api-types.js';

const BASE_URL = 'http://gateway:8080';

/* Stub the global fetch so no real HTTP requests are made. */
const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify({ code: 0, message: 'ok', data: {} }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// WechatApi – unit tests
// ---------------------------------------------------------------------------

describe('WechatApi', () => {
  it('sends text message via POST /api/message/text', async () => {
    const api = new WechatApi(BASE_URL);
    const res = await api.sendText({ receiver: 'wxid_test', content: 'hello' });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/text`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      receiver: 'wxid_test',
      content: 'hello',
    });
    expect(res.code).toBe(0);
  });

  it('sends image message via POST /api/message/image', async () => {
    const api = new WechatApi(BASE_URL);
    await api.sendImage({ receiver: 'wxid_test', data: 'base64data' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/image`);
  });

  it('sends video message via POST /api/message/video', async () => {
    const api = new WechatApi(BASE_URL);
    await api.sendVideo({
      receiver: 'wxid_test',
      video_data: 'vdata',
      thumb_data: 'tdata',
      duration: 10,
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/video`);
    expect(JSON.parse(init?.body as string).duration).toBe(10);
  });

  it('sends voice message via POST /api/message/voice', async () => {
    const api = new WechatApi(BASE_URL);
    await api.sendVoice({
      receiver: 'wxid_test',
      data: 'voicedata',
      duration: 3000,
      format: 4,
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/voice`);
    expect(JSON.parse(init?.body as string).format).toBe(4);
  });

  it('sends emoji message via POST /api/message/emoji', async () => {
    const api = new WechatApi(BASE_URL);
    await api.sendEmoji({ receiver: 'wxid_test', data: 'emojidata' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/emoji`);
  });

  it('sends card message via POST /api/message/card', async () => {
    const api = new WechatApi(BASE_URL);
    await api.sendCard({
      receiver: 'wxid_test',
      card_username: 'wxid_card',
      card_nickname: 'Card',
      card_alias: 'card_alias',
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/card`);
  });

  it('sends link message via POST /api/message/link', async () => {
    const api = new WechatApi(BASE_URL);
    await api.sendLink({
      receiver: 'wxid_test',
      url: 'https://example.com',
      title: 'Title',
      desc: 'Desc',
      thumb_url: 'https://example.com/thumb.jpg',
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/link`);
    expect(JSON.parse(init?.body as string).title).toBe('Title');
  });

  it('sends position message via POST /api/message/position', async () => {
    const api = new WechatApi(BASE_URL);
    await api.sendPosition({
      receiver: 'wxid_test',
      lat: 39.9,
      lon: 116.4,
      label: 'Beijing',
      poi_name: 'Beijing',
      scale: 15,
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/position`);
  });

  it('sends app message via POST /api/message/app', async () => {
    const api = new WechatApi(BASE_URL);
    await api.sendApp({ receiver: 'wxid_test', type: 5, xml: '<xml/>' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/app`);
  });

  it('forwards a message via POST /api/message/forward', async () => {
    const api = new WechatApi(BASE_URL);
    await api.forwardMessage({ receiver: 'wxid_test', type: 'image', xml: '<xml/>' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/forward`);
  });

  it('revokes a message via POST /api/message/revoke', async () => {
    const api = new WechatApi(BASE_URL);
    await api.revokeMessage({
      receiver: 'wxid_test',
      client_msg_id: 123,
      new_msg_id: 456,
      create_time: 1700000000,
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/revoke`);
  });

  it('starts typing indicator via POST /api/message/start', async () => {
    const api = new WechatApi(BASE_URL);
    await api.startTyping('wxid_test');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/start`);
  });

  it('stops typing indicator via POST /api/message/stop', async () => {
    const api = new WechatApi(BASE_URL);
    await api.stopTyping('wxid_test');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/stop`);
  });

  it('syncs messages via GET /api/message/sync', async () => {
    const api = new WechatApi(BASE_URL);
    await api.syncMessages();

    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toBe(`${BASE_URL}/api/message/sync`);
  });

  it('strips trailing slash from base URL', async () => {
    const api = new WechatApi('http://gateway:8080/');
    await api.sendText({ receiver: 'wxid_test', content: 'hi' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://gateway:8080/api/message/text');
  });
});

// ---------------------------------------------------------------------------
// sendWechatReply – integration tests
// ---------------------------------------------------------------------------

describe('sendWechatReply', () => {
  it('dispatches text reply to sendText', async () => {
    const api = new WechatApi(BASE_URL);
    const reply: ReplyMessage = { type: 'text', content: 'hello' };
    await sendWechatReply(api, reply, 'wxid_recv');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/text`);
    const body = JSON.parse(init?.body as string);
    expect(body.receiver).toBe('wxid_recv');
    expect(body.content).toBe('hello');
  });

  it('dispatches markdown reply to sendText', async () => {
    const api = new WechatApi(BASE_URL);
    const reply: ReplyMessage = { type: 'markdown', content: '**bold**' };
    await sendWechatReply(api, reply, 'wxid_recv');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/text`);
    expect(JSON.parse(init?.body as string).content).toBe('**bold**');
  });

  it('dispatches image reply to sendImage', async () => {
    const api = new WechatApi(BASE_URL);
    const reply: ReplyMessage = { type: 'image', mediaId: 'img_data' };
    await sendWechatReply(api, reply, 'wxid_recv');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/image`);
    expect(JSON.parse(init?.body as string).data).toBe('img_data');
  });

  it('dispatches voice reply to sendVoice', async () => {
    const api = new WechatApi(BASE_URL);
    const reply: ReplyMessage = { type: 'voice', mediaId: 'voice_data' };
    await sendWechatReply(api, reply, 'wxid_recv');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/voice`);
  });

  it('dispatches video reply to sendVideo', async () => {
    const api = new WechatApi(BASE_URL);
    const reply: ReplyMessage = { type: 'video', mediaId: 'video_data' };
    await sendWechatReply(api, reply, 'wxid_recv');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/video`);
  });

  it('dispatches news reply to sendLink using first article', async () => {
    const api = new WechatApi(BASE_URL);
    const reply: ReplyMessage = {
      type: 'news',
      articles: [
        { title: 'A1', description: 'D1', url: 'https://example.com/1', picUrl: 'https://example.com/pic.jpg' },
        { title: 'A2', url: 'https://example.com/2' },
      ],
    };
    await sendWechatReply(api, reply, 'wxid_recv');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/message/link`);
    const body = JSON.parse(init?.body as string);
    expect(body.title).toBe('A1');
    expect(body.url).toBe('https://example.com/1');
    expect(body.thumb_url).toBe('https://example.com/pic.jpg');
  });

  it('does nothing for card reply (unsupported via sendWechatReply)', async () => {
    const api = new WechatApi(BASE_URL);
    const reply: ReplyMessage = { type: 'card', cardContent: {} };
    await sendWechatReply(api, reply, 'wxid_recv');

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
