import {describe, it, expect} from 'vitest';
import {routeMessage, registerHandler, toReplyArray} from '../src/bot/index.js';
import type {IncomingMessage, Env, ReplyMessage, TextReply, HandlerResponse} from '../src/types/message.js';

const env: Env = {};

function expectTextReply(reply: HandlerResponse): TextReply {
    expect(reply).not.toBeNull();
    const single = Array.isArray(reply) ? reply[0] : reply;
    expect(single).toBeDefined();
    expect(single?.type).toBe('text');
    return single as TextReply;
}

function makeMessage(overrides: Partial<IncomingMessage>): IncomingMessage {
    return {
        platform: 'wechat',
        type: 'text',
        from: 'user_001',
        to: 'bot_001',
        timestamp: 1700000000,
        messageId: 'msg_001',
        raw: {},
        ...overrides,
    };
}

describe('routeMessage', () => {
    it('routes text messages to the text handler', async () => {
        const msg = makeMessage({type: 'text', content: '帮助'});
        const reply = expectTextReply(await routeMessage(msg, env));
        expect(reply.content).toContain('帮助');
    });

    it('routes image messages to the image handler', async () => {
        const msg = makeMessage({type: 'image', mediaId: 'media_001'});
        const reply = await routeMessage(msg, env);
        expect(reply).toBeNull();
    });

    it('routes voice messages to the voice handler', async () => {
        const msg = makeMessage({type: 'voice', mediaId: 'media_002'});
        const reply = await routeMessage(msg, env);
        expect(reply).toBeNull();
    });

    it('routes video messages to the video handler', async () => {
        const msg = makeMessage({type: 'video', mediaId: 'media_003'});
        const reply = await routeMessage(msg, env);
        expect(reply).toBeNull();
    });

    it('routes location messages to the location handler', async () => {
        const msg = makeMessage({
            type: 'location',
            location: {latitude: 39.9, longitude: 116.4, label: 'Beijing'},
        });
        const reply = await routeMessage(msg, env);
        expect(reply).toBeNull();
    });

    it('routes link messages to the link handler', async () => {
        const msg = makeMessage({
            type: 'link',
            link: {title: 'Test', description: 'Desc', url: 'https://example.com'},
        });
        const reply = await routeMessage(msg, env);
        expect(reply).toBeNull();
    });

    it('routes subscribe events to the event handler', async () => {
        const msg = makeMessage({
            type: 'event',
            event: {type: 'subscribe'},
        });
        const reply = expectTextReply(await routeMessage(msg, env));
        expect(reply.content).toContain('感谢');
    });

    it('returns null for unsubscribe events', async () => {
        const msg = makeMessage({
            type: 'event',
            event: {type: 'unsubscribe'},
        });
        const reply = await routeMessage(msg, env);
        expect(reply).toBeNull();
    });

    it('allows registering a custom handler', async () => {
        registerHandler('text', async (_msg, _env) => ({
            type: 'text',
            content: 'custom reply',
        }));
        const msg = makeMessage({type: 'text', content: 'anything'});
        const reply = expectTextReply(await routeMessage(msg, env));
        expect(reply.content).toBe('custom reply');

        // Restore default handler for other tests
        const {handleTextMessage} = await import('../src/handlers/text-handler.js');
        registerHandler('text', handleTextMessage);
    });

    it('supports a handler returning multiple replies', async () => {
        registerHandler('text', async (_msg, _env) => [
            {type: 'text', content: 'first'},
            {type: 'text', content: 'second'},
            {type: 'image', mediaId: 'img_001'},
        ]);
        const msg = makeMessage({type: 'text', content: 'multi'});
        const response = await routeMessage(msg, env);
        expect(Array.isArray(response)).toBe(true);
        const replies = response as ReplyMessage[];
        expect(replies).toHaveLength(3);
        expect(replies[0]).toEqual({type: 'text', content: 'first'});
        expect(replies[1]).toEqual({type: 'text', content: 'second'});
        expect(replies[2]).toEqual({type: 'image', mediaId: 'img_001'});

        // Restore default handler
        const {handleTextMessage} = await import('../src/handlers/text-handler.js');
        registerHandler('text', handleTextMessage);
    });
});

describe('toReplyArray', () => {
    it('returns empty array for null', () => {
        expect(toReplyArray(null)).toEqual([]);
    });

    it('wraps a single reply in an array', () => {
        const reply: ReplyMessage = {type: 'text', content: 'hello'};
        expect(toReplyArray(reply)).toEqual([reply]);
    });

    it('returns the array as-is for array input', () => {
        const replies: ReplyMessage[] = [
            {type: 'text', content: 'first'},
            {type: 'text', content: 'second'},
        ];
        expect(toReplyArray(replies)).toEqual(replies);
    });

    it('returns empty array for empty array input', () => {
        expect(toReplyArray([])).toEqual([]);
    });
});
