import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {todayWifePlugin} from '../../src/plugins/meitu/today-wife.js';
import type {IncomingMessage, Env} from '../../src/types/message.js';

const env: Env = {};

function makeMessage(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
    return {
        platform: 'wechat',
        type: 'text',
        from: 'wxid_test_sender',
        to: 'bot_001',
        timestamp: 1700000000,
        messageId: 'msg_001',
        raw: {},
        ...overrides,
    };
}

describe('todayWifePlugin', () => {
    describe('match', () => {
        it('matches text containing "今日老婆"', () => {
            expect(todayWifePlugin.match('来个今日老婆', makeMessage())).toBe(true);
        });

        it('does not match unrelated text', () => {
            expect(todayWifePlugin.match('你好', makeMessage())).toBe(false);
        });
    });

    describe('handle', () => {
        const originalFetch = globalThis.fetch;

        beforeEach(() => {
            vi.restoreAllMocks();
        });

        afterEach(() => {
            globalThis.fetch = originalFetch;
        });

        it('requests API with stable numeric id and returns image reply', async () => {
            const fakeImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
            globalThis.fetch = vi.fn()
                .mockResolvedValueOnce(
                    new Response(
                        JSON.stringify({
                            code: 200,
                            msg: '获取成功',
                            data: {
                                image_url: 'https://api.pearktrue.cn/api_assets/wife/demo.webp',
                                role_name: '测试角色',
                                width: 100,
                                height: 100,
                            },
                        }),
                        {status: 200, headers: {'Content-Type': 'application/json'}},
                    ),
                )
                .mockResolvedValueOnce(
                    new Response(fakeImageBytes, {
                        status: 200,
                        headers: {'Content-Type': 'image/webp'},
                    }),
                );

            const reply = await todayWifePlugin.handle(makeMessage({content: '今日老婆'}), env);
            expect(reply).not.toBeNull();
            expect(Array.isArray(reply)).toBe(false);
            expect((reply as { type: string }).type).toBe('image');
            expect((reply as { mediaId: string }).mediaId).toBeTruthy();

            expect(globalThis.fetch).toHaveBeenCalledTimes(2);
            const firstCallUrl = String((globalThis.fetch as unknown as {
                mock: { calls: unknown[][] }
            }).mock.calls[0][0]);
            const matched = firstCallUrl.match(/\?id=(\d+)$/);
            expect(matched).not.toBeNull();
            const numericId = Number(matched?.[1]);
            expect(numericId).toBeGreaterThanOrEqual(10001);
            expect(numericId).toBeLessThanOrEqual(19999);
        });

        it('returns null when API responds with non-2xx', async () => {
            globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response('Bad Gateway', {status: 502}));

            const reply = await todayWifePlugin.handle(makeMessage({content: '今日老婆'}), env);
            expect(reply).toBeNull();
        });

        it('returns null when API has no image_url', async () => {
            globalThis.fetch = vi.fn().mockResolvedValueOnce(
                new Response(
                    JSON.stringify({code: 200, msg: 'ok', data: {}}),
                    {status: 200, headers: {'Content-Type': 'application/json'}},
                ),
            );

            const reply = await todayWifePlugin.handle(makeMessage({content: '今日老婆'}), env);
            expect(reply).toBeNull();
        });
    });
});

