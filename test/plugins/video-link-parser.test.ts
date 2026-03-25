import {describe, it, expect, vi, afterEach} from 'vitest';
import {videoLinkParserPlugin} from '../../src/plugins/video/video-link-parser';
import type {IncomingMessage} from '../../src/types/message.js';

function makeMessage(content: string): IncomingMessage {
    return {
        platform: 'wechat',
        type: 'text',
        from: 'wxid_user_001',
        to: 'wxid_bot_001',
        timestamp: 1700000000,
        messageId: 'msg_001',
        content,
        raw: {},
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('videoLinkParserPlugin', () => {
    it('matches short-video share links', () => {
        const message = makeMessage('快看这个 https://v.douyin.com/abc123/');
        expect(videoLinkParserPlugin.match(message.content ?? '', message)).toBe(true);
    });

    it('does not match text without supported links', () => {
        const message = makeMessage('今天中午吃什么');
        expect(videoLinkParserPlugin.match(message.content ?? '', message)).toBe(false);
    });

    it('returns news reply when API resolves video url', async () => {
        const content = '看看这个 https://v.douyin.com/abc123/';
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    code: 200,
                    data: {
                        title: '测试视频',
                        video_url: 'https://cdn.example.com/video.mp4',
                        cover_url: 'https://cdn.example.com/cover.jpg',
                    },
                }),
                {status: 200, headers: {'Content-Type': 'application/json'}},
            ),
        );

        const reply = await videoLinkParserPlugin.handle(
            makeMessage(content),
            {},
        );

        expect(reply).not.toBeNull();
        expect(Array.isArray(reply)).toBe(false);
        expect((reply as { type: string }).type).toBe('news');
        expect((reply as { articles: Array<{ url: string; title: string; picUrl?: string }> }).articles[0].url)
            .toBe('https://cdn.example.com/video.mp4');
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(calledUrl).toContain('https://api.dudunas.top/api/qushuiyin?');
        expect(calledUrl).toContain('AppSecret=a3c838e4dfbd21b3ab09e81ccd8b185d');
        const parsed = new URL(calledUrl);
        expect(parsed.searchParams.get('text')).toBe(content);
        expect(calledInit.method).toBe('GET');
    });
});

