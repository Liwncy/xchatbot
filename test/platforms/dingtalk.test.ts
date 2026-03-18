import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {parseDingTalkMessage, verifyDingTalkSignature, sendDingTalkReply} from '../../src/platforms/dingtalk/index.js';
import type {DingTalkMessage} from '../../src/platforms/dingtalk/types.js';
import type {ReplyMessage} from '../../src/types/message.js';

describe('verifyDingTalkSignature', () => {
    it('returns true for valid Base64-encoded signature', async () => {
        // Pre-compute expected signature using Node's crypto
        const {createHmac} = await import('crypto');
        const secret = 'mysecret';
        const timestamp = '1700000000000';
        const message = `${timestamp}\n${secret}`;
        const hmacBuffer = createHmac('sha256', secret).update(message).digest();
        const base64Sig = Buffer.from(hmacBuffer).toString('base64');
        // URL-encode it as DingTalk would send
        const urlEncodedSig = encodeURIComponent(base64Sig);

        const result = await verifyDingTalkSignature(secret, timestamp, urlEncodedSig);
        expect(result).toBe(true);
    });

    it('returns false for invalid signature', async () => {
        const result = await verifyDingTalkSignature('secret', '12345', 'invalidsig');
        expect(result).toBe(false);
    });
});

describe('parseDingTalkMessage', () => {
    it('parses text message', () => {
        const msg: DingTalkMessage = {
            msgtype: 'text',
            msgId: 'msg_001',
            createAt: 1700000000000,
            senderId: 'user_001',
            senderNick: 'Test User',
            robotCode: 'bot_001',
            sessionWebhook: 'https://oapi.dingtalk.com/robot/send?access_token=xxx',
            text: {content: 'Hello DingTalk Bot'},
        };

        const result = parseDingTalkMessage(msg);
        expect(result.platform).toBe('dingtalk');
        expect(result.type).toBe('text');
        expect(result.content).toBe('Hello DingTalk Bot');
        expect(result.from).toBe('user_001');
        expect(result.to).toBe('bot_001');
        expect(result.messageId).toBe('msg_001');
    });

    it('parses picture message', () => {
        const msg: DingTalkMessage = {
            msgtype: 'picture',
            msgId: 'msg_002',
            createAt: 1700000000000,
            senderId: 'user_001',
            robotCode: 'bot_001',
            sessionWebhook: 'https://oapi.dingtalk.com/robot/send?access_token=xxx',
            picture: {downloadCode: 'pic_code_001'},
        };

        const result = parseDingTalkMessage(msg);
        expect(result.type).toBe('image');
        expect(result.mediaId).toBe('pic_code_001');
    });

    it('parses audio message', () => {
        const msg: DingTalkMessage = {
            msgtype: 'audio',
            msgId: 'msg_003',
            createAt: 1700000000000,
            senderId: 'user_001',
            robotCode: 'bot_001',
            sessionWebhook: 'https://oapi.dingtalk.com/robot/send?access_token=xxx',
            audio: {downloadCode: 'audio_code_001', duration: '10'},
        };

        const result = parseDingTalkMessage(msg);
        expect(result.type).toBe('voice');
        expect(result.mediaId).toBe('audio_code_001');
    });

    it('uses current timestamp when createAt is absent', () => {
        const before = Math.floor(Date.now() / 1000);
        const msg: DingTalkMessage = {
            msgtype: 'text',
            text: {content: 'test'},
        };
        const result = parseDingTalkMessage(msg);
        const after = Math.floor(Date.now() / 1000);
        expect(result.timestamp).toBeGreaterThanOrEqual(before);
        expect(result.timestamp).toBeLessThanOrEqual(after);
    });
});

describe('sendDingTalkReply', () => {
    const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();

    beforeEach(() => {
        mockFetch.mockResolvedValue(
            new Response(JSON.stringify({errcode: 0, errmsg: 'ok'}), {
                headers: {'Content-Type': 'application/json'},
            }),
        );
        vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('includes at block when mentions are specified', async () => {
        const reply: ReplyMessage = {
            type: 'text',
            content: 'Hello',
            mentions: ['user_001', 'user_002'],
        };
        await sendDingTalkReply(reply, 'https://oapi.dingtalk.com/robot/send?token=xxx');

        const [, init] = mockFetch.mock.calls[0];
        const body = JSON.parse(init?.body as string);
        expect(body.at).toEqual({atUserIds: ['user_001', 'user_002'], isAtAll: false});
    });

    it('does not include at block when no mentions', async () => {
        const reply: ReplyMessage = {type: 'text', content: 'Hello'};
        await sendDingTalkReply(reply, 'https://oapi.dingtalk.com/robot/send?token=xxx');

        const [, init] = mockFetch.mock.calls[0];
        const body = JSON.parse(init?.body as string);
        expect(body.at).toBeUndefined();
    });

    it('includes at block for markdown reply with mentions', async () => {
        const reply: ReplyMessage = {
            type: 'markdown',
            title: 'Test',
            content: '**bold**',
            mentions: ['user_003'],
        };
        await sendDingTalkReply(reply, 'https://oapi.dingtalk.com/robot/send?token=xxx');

        const [, init] = mockFetch.mock.calls[0];
        const body = JSON.parse(init?.body as string);
        expect(body.msgtype).toBe('markdown');
        expect(body.at).toEqual({atUserIds: ['user_003'], isAtAll: false});
    });

    it('sends multiple replies sequentially', async () => {
        const replies: ReplyMessage[] = [
            {type: 'text', content: 'first'},
            {type: 'markdown', title: 'Title', content: '**bold**'},
        ];
        const webhook = 'https://oapi.dingtalk.com/robot/send?token=xxx';
        for (const reply of replies) {
            await sendDingTalkReply(reply, webhook);
        }

        expect(mockFetch).toHaveBeenCalledTimes(2);

        const body0 = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
        expect(body0.msgtype).toBe('text');
        expect(body0.text.content).toBe('first');

        const body1 = JSON.parse(mockFetch.mock.calls[1][1]?.body as string);
        expect(body1.msgtype).toBe('markdown');
    });
});
