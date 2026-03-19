import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {handleTextMessage} from '../../src/handlers/text-handler.js';
import {handleImageMessage} from '../../src/handlers/image-handler.js';
import {clearImageIntentStateForTest} from '../../src/plugins/image/intent-image.js';
import type {IncomingMessage, Env} from '../../src/types/message.js';

const env: Env = {};

function makeTextMessage(content: string, from = 'wxid_user_1'): IncomingMessage {
    return {
        platform: 'wechat',
        type: 'text',
        from,
        to: 'wxid_bot',
        timestamp: Math.floor(Date.now() / 1000),
        messageId: `msg_${Date.now()}`,
        content,
        raw: {},
    };
}

function makeImageMessage(from = 'wxid_user_1'): IncomingMessage {
    return {
        platform: 'wechat',
        type: 'image',
        from,
        to: 'wxid_bot',
        timestamp: Math.floor(Date.now() / 1000),
        messageId: `img_${Date.now()}`,
        mediaId: 'https://example.com/test.jpg',
        raw: {},
    };
}

function makeImageMessageWithoutMediaId(from = 'wxid_user_1'): IncomingMessage {
    return {
        platform: 'wechat',
        type: 'image',
        from,
        to: 'wxid_bot',
        timestamp: Math.floor(Date.now() / 1000),
        messageId: `img_empty_${Date.now()}`,
        raw: {
            new_messages: [
                {
                    type: 3,
                    content: {
                        value:
                            'wxid_user_1:\n<?xml version="1.0"?><msg><img aeskey="abc123" cdnbigimgurl="file_id_001"/></msg>',
                    },
                },
            ],
        },
    };
}

describe('image intent plugins', () => {
    beforeEach(() => {
        clearImageIntentStateForTest();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does not reply to image by default', async () => {
        const reply = await handleImageMessage(makeImageMessage(), env);
        expect(reply).toBeNull();
    });

    it('replies after user explicitly triggers image intent', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            code: 200,
            msg: 'AI识图成功',
            result: '图里有一只猫在沙发上。',
        }), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        }));

        const triggerReply = await handleTextMessage(makeTextMessage('帮我识图'), env);
        expect(triggerReply).not.toBeNull();

        const imageReply = await handleImageMessage(makeImageMessage(), env);
        expect(imageReply).not.toBeNull();
        const single = Array.isArray(imageReply) ? imageReply[0] : imageReply;
        expect(single?.type).toBe('text');
        expect((single as {content?: string}).content).toContain('识图结果');
    });

    it('consumes pending intent once and does not reply to the next image', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
            code: 200,
            msg: 'AI识图成功',
            result: '一张示例图片。',
        }), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        }));

        await handleTextMessage(makeTextMessage('解析图片'), env);

        const first = await handleImageMessage(makeImageMessage(), env);
        expect(first).not.toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const second = await handleImageMessage(makeImageMessage(), env);
        expect(second).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('uses Wechat CDN fallback when mediaId is missing', async () => {
        const envWithApi: Env = {WECHAT_API_BASE_URL: 'https://wechat-gateway.example.com'};
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            if (url.includes('/api/message/cdn/image')) {
                return new Response(JSON.stringify({
                    code: 0,
                    message: 'ok',
                    data: '/9j/4AAQSkZJRgABAQAAAQABAAD...',
                }), {
                    status: 200,
                    headers: {'Content-Type': 'application/json'},
                });
            }

            if (url.includes('/api/airecognizeimg')) {
                return new Response(JSON.stringify({
                    code: 200,
                    msg: 'AI识图成功',
                    result: '图中是一辆玩具车。',
                }), {
                    status: 200,
                    headers: {'Content-Type': 'application/json'},
                });
            }

            return new Response('not found', {status: 404});
        });

        await handleTextMessage(makeTextMessage('识图', 'wxid_user_1'), envWithApi);
        const imageReply = await handleImageMessage(makeImageMessageWithoutMediaId('wxid_user_1'), envWithApi);

        expect(imageReply).not.toBeNull();
        const single = Array.isArray(imageReply) ? imageReply[0] : imageReply;
        expect(single?.type).toBe('text');
        expect((single as {content?: string}).content).toContain('识图结果');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

