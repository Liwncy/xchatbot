import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {WechatApi} from '../../src/platforms/wechat/api.js';
import {sendWechatReply} from '../../src/platforms/wechat/index.js';
import type {ReplyMessage} from '../../src/types/message.js';

const BASE_URL = 'http://gateway:8080';

/* Stub the global fetch so no real HTTP requests are made. */
const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
    mockFetch.mockResolvedValue(
        new Response(JSON.stringify({code: 0, message: 'ok', data: {}}), {
            headers: {'Content-Type': 'application/json'},
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
        const res = await api.sendText({receiver: 'wxid_test', content: 'hello'});

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
        await api.sendImage({receiver: 'wxid_test', data: 'base64data'});

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
        await api.sendEmoji({receiver: 'wxid_test', data: 'emojidata'});

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
        await api.sendApp({receiver: 'wxid_test', type: 5, xml: '<xml/>'});

        const [url] = mockFetch.mock.calls[0];
        expect(url).toBe(`${BASE_URL}/api/message/app`);
    });

    it('forwards a message via POST /api/message/forward', async () => {
        const api = new WechatApi(BASE_URL);
        await api.forwardMessage({receiver: 'wxid_test', type: 'image', xml: '<xml/>'});

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

        const [url, init] = mockFetch.mock.calls[0];
        expect(String(url)).toBe(`${BASE_URL}/api/message/start?receiver=wxid_test`);
        expect(init?.method).toBe('POST');
        expect(init?.body).toBeUndefined();
    });

    it('stops typing indicator via POST /api/message/stop', async () => {
        const api = new WechatApi(BASE_URL);
        await api.stopTyping('wxid_test');

        const [url, init] = mockFetch.mock.calls[0];
        expect(String(url)).toBe(`${BASE_URL}/api/message/stop?receiver=wxid_test`);
        expect(init?.method).toBe('POST');
        expect(init?.body).toBeUndefined();
    });

    it('syncs messages via GET /api/message/sync', async () => {
        const api = new WechatApi(BASE_URL);
        await api.syncMessages();

        const [url] = mockFetch.mock.calls[0];
        expect(String(url)).toBe(`${BASE_URL}/api/message/sync`);
    });

    it('gets CDN DNS via GET /api/message/cdn/dns', async () => {
        const api = new WechatApi(BASE_URL);
        await api.getCdnDns();

        const [url, init] = mockFetch.mock.calls[0];
        expect(String(url)).toBe(`${BASE_URL}/api/message/cdn/dns`);
        expect(init?.method).toBe('GET');
        expect((init?.headers as Record<string, string>)?.['User-Agent']).toContain('Mozilla/5.0');
    });

    it('downloads CDN image via POST /api/message/cdn/image', async () => {
        const api = new WechatApi(BASE_URL);
        await api.cdnDownloadImage({file_id: 'cdn_file_1', file_aes_key: 'aabbcc'});

        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe(`${BASE_URL}/api/message/cdn/image`);
        expect(JSON.parse(init?.body as string)).toEqual({file_id: 'cdn_file_1', file_aes_key: 'aabbcc'});
    });

    it('downloads file/image/video/voice via corresponding endpoints', async () => {
        // Each API call consumes response body once, so return a fresh Response every call.
        mockFetch.mockImplementation(async () =>
            new Response(JSON.stringify({code: 0, message: 'ok', data: {}}), {
                headers: {'Content-Type': 'application/json'},
            }),
        );

        const api = new WechatApi(BASE_URL);

        await api.downloadFile({
            app_id: 'wx123',
            attach_id: 'att_1',
            total_len: 1000,
            data_len: 256,
            start_pos: 0,
            username: 'wxid_xxx',
        });
        expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/message/download/file`);

        await api.downloadImage({
            msg_id: 1,
            sender: 'wxid_a',
            receiver: 'wxid_b',
            total_len: 2000,
            data_len: 512,
            start_pos: 0,
            compress_type: 0,
        });
        expect(mockFetch.mock.calls[1][0]).toBe(`${BASE_URL}/api/message/download/image`);

        await api.downloadVideo({msg_id: 2, total_len: 3000, start_pos: 0, mx_pack_size: 1024});
        expect(mockFetch.mock.calls[2][0]).toBe(`${BASE_URL}/api/message/download/video`);

        await api.downloadVoice({msg_id: 3, buffer_id_str: 'buf', length: 4096, group_name: ''});
        expect(mockFetch.mock.calls[3][0]).toBe(`${BASE_URL}/api/message/download/voice`);
    });

    it('throws actionable error when gateway returns plain text instead of JSON', async () => {
        mockFetch.mockResolvedValueOnce(new Response('error code: 1003', {status: 200}));

        const api = new WechatApi(BASE_URL);
        await expect(api.sendText({receiver: 'wxid_test', content: 'hello'}))
            .rejects
            .toThrow('WechatApi /api/message/text returned non-JSON response (status 200): error code: 1003');
    });

    it('strips trailing slash from base URL', async () => {
        const api = new WechatApi('http://gateway:8080/');
        await api.sendText({receiver: 'wxid_test', content: 'hi'});

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
        const reply: ReplyMessage = {type: 'text', content: 'hello'};
        await sendWechatReply(api, reply, 'wxid_recv');

        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe(`${BASE_URL}/api/message/text`);
        const body = JSON.parse(init?.body as string);
        expect(body.receiver).toBe('wxid_recv');
        expect(body.content).toBe('hello');
    });

    it('dispatches markdown reply to sendText', async () => {
        const api = new WechatApi(BASE_URL);
        const reply: ReplyMessage = {type: 'markdown', content: '**bold**'};
        await sendWechatReply(api, reply, 'wxid_recv');

        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe(`${BASE_URL}/api/message/text`);
        expect(JSON.parse(init?.body as string).content).toBe('**bold**');
    });

    it('dispatches image reply to sendImage', async () => {
        const api = new WechatApi(BASE_URL);
        const reply: ReplyMessage = {type: 'image', mediaId: 'img_data'};
        await sendWechatReply(api, reply, 'wxid_recv');

        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe(`${BASE_URL}/api/message/image`);
        expect(JSON.parse(init?.body as string).data).toBe('img_data');
    });

    it('dispatches voice reply to sendVoice', async () => {
        const api = new WechatApi(BASE_URL);
        const reply: ReplyMessage = {type: 'voice', mediaId: 'voice_data'};
        await sendWechatReply(api, reply, 'wxid_recv');

        const [url] = mockFetch.mock.calls[0];
        expect(url).toBe(`${BASE_URL}/api/message/voice`);
    });

    it('dispatches video reply to sendVideo', async () => {
        const api = new WechatApi(BASE_URL);
        const reply: ReplyMessage = {type: 'video', mediaId: 'video_data'};
        await sendWechatReply(api, reply, 'wxid_recv');

        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe(`${BASE_URL}/api/message/video`);
        const body = JSON.parse(init?.body as string);
        expect(body.thumb_data).toBe('');
        expect(body.duration).toBe(0);
    });

    it('uses env video thumb and duration when provided', async () => {
        const api = new WechatApi(BASE_URL);
        const reply: ReplyMessage = {type: 'video', mediaId: 'video_data'};
        await sendWechatReply(api, reply, 'wxid_recv', {
            WECHAT_VIDEO_THUMB_BASE64: 'thumb_base64',
            WECHAT_VIDEO_DURATION: '12',
        });

        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe(`${BASE_URL}/api/message/video`);
        const body = JSON.parse(init?.body as string);
        expect(body.thumb_data).toBe('thumb_base64');
        expect(body.duration).toBe(12);
    });

    it('dispatches news reply to sendLink using first article', async () => {
        const api = new WechatApi(BASE_URL);
        const reply: ReplyMessage = {
            type: 'news',
            articles: [
                {title: 'A1', description: 'D1', url: 'https://example.com/1', picUrl: 'https://example.com/pic.jpg'},
                {title: 'A2', url: 'https://example.com/2'},
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
        const reply: ReplyMessage = {type: 'card', cardContent: {}};
        await sendWechatReply(api, reply, 'wxid_recv');

        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uses reply.to to override receiver for text reply', async () => {
        const api = new WechatApi(BASE_URL);
        const reply: ReplyMessage = {type: 'text', content: 'hello', to: 'wxid_other'};
        await sendWechatReply(api, reply, 'wxid_recv');

        const [, init] = mockFetch.mock.calls[0];
        const body = JSON.parse(init?.body as string);
        expect(body.receiver).toBe('wxid_other');
    });

    it('passes remind parameter for text reply with mentions', async () => {
        const api = new WechatApi(BASE_URL);
        const reply: ReplyMessage = {
            type: 'text',
            content: 'hello group',
            mentions: ['wxid_a', 'wxid_b'],
        };
        await sendWechatReply(api, reply, 'room_123@chatroom');

        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe(`${BASE_URL}/api/message/text`);
        const body = JSON.parse(init?.body as string);
        expect(body.receiver).toBe('room_123@chatroom');
        expect(body.content).toBe('hello group');
        expect(body.remind).toBe('wxid_a,wxid_b');
    });

    it('does not pass remind when mentions is empty', async () => {
        const api = new WechatApi(BASE_URL);
        const reply: ReplyMessage = {type: 'text', content: 'hi', mentions: []};
        await sendWechatReply(api, reply, 'wxid_recv');

        const [, init] = mockFetch.mock.calls[0];
        const body = JSON.parse(init?.body as string);
        expect(body.remind).toBeUndefined();
    });

    it('uses reply.to to override receiver for image reply', async () => {
        const api = new WechatApi(BASE_URL);
        const reply: ReplyMessage = {type: 'image', mediaId: 'img_data', to: 'wxid_other'};
        await sendWechatReply(api, reply, 'wxid_recv');

        const [, init] = mockFetch.mock.calls[0];
        const body = JSON.parse(init?.body as string);
        expect(body.receiver).toBe('wxid_other');
    });

    it('sends multiple replies sequentially', async () => {
        // Return a fresh Response for each call so the body can be read each time
        mockFetch.mockImplementation(async () =>
            new Response(JSON.stringify({code: 0, message: 'ok', data: {}}), {
                headers: {'Content-Type': 'application/json'},
            }),
        );

        const api = new WechatApi(BASE_URL);
        const replies: ReplyMessage[] = [
            {type: 'text', content: 'first'},
            {type: 'text', content: 'second'},
            {type: 'image', mediaId: 'img_data'},
        ];

        for (const reply of replies) {
            await sendWechatReply(api, reply, 'wxid_recv');
        }

        expect(mockFetch).toHaveBeenCalledTimes(3);

        const body0 = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
        expect(body0.content).toBe('first');

        const body1 = JSON.parse(mockFetch.mock.calls[1][1]?.body as string);
        expect(body1.content).toBe('second');

        const [url2] = mockFetch.mock.calls[2];
        expect(url2).toBe(`${BASE_URL}/api/message/image`);
    });
});
