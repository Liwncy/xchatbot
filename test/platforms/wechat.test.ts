import {describe, it, expect} from 'vitest';
import {
    verifyWechatSignature,
    parseWechatMessage,
    buildWechatReply,
} from '../../src/wechat/index.js';
import type {WechatPushItem, WechatPushMessage} from '../../src/wechat/types.js';
import type {ReplyMessage} from '../../src/types/message.js';
import {createHmac} from 'crypto';

function makePushItem(overrides: Partial<WechatPushItem> = {}): WechatPushItem {
    return {
        content: {value: 'Hello Bot'},
        create_time: 1_700_000_000_000,
        msg_id: 1001,
        msg_source: 'private',
        receiver: {value: 'wxid_bot'},
        sender: {value: 'wxid_sender'},
        type: 1,
        ...overrides,
    };
}

function makePayload(overrides: Partial<WechatPushMessage> = {}): WechatPushMessage {
    return {
        new_messages: [makePushItem()],
        ...overrides,
    };
}

describe('verifyWechatSignature', () => {
    it('returns true for valid HMAC-SHA256 signature', async () => {
        const token = 'test_secret';
        const timestamp = '1700000000';
        const body = '{"type":"text","content":"hello"}';
        const signature = createHmac('sha256', token).update(timestamp + body).digest('hex');

        const result = await verifyWechatSignature(token, signature, timestamp, body);
        expect(result).toBe(true);
    });

    it('returns false for invalid signature', async () => {
        const result = await verifyWechatSignature('token', 'badsignature', '12345', '{}');
        expect(result).toBe(false);
    });
});

describe('parseWechatMessage', () => {
    it('parses private text message', () => {
        const msg = parseWechatMessage(makePayload());
        expect(msg.platform).toBe('wechat');
        expect(msg.type).toBe('text');
        expect(msg.source).toBe('private');
        expect(msg.content).toBe('Hello Bot');
        expect(msg.from).toBe('wxid_sender');
        expect(msg.to).toBe('wxid_bot');
        expect(msg.messageId).toBe('1001');
    });

    it('parses group text message with room info', () => {
        const msg = parseWechatMessage(makePayload({
            new_messages: [
                makePushItem({
                    msg_source: 'group chatroom',
                    receiver: {value: 'room_123@chatroom'},
                }),
            ],
        }));
        expect(msg.source).toBe('group');
        expect(msg.room?.id).toBe('room_123@chatroom');
    });

    it('parses official account push', () => {
        const msg = parseWechatMessage(makePayload({
            new_messages: [
                makePushItem({
                    msg_source: 'official push',
                    content: {value: 'Official news'},
                }),
            ],
        }));
        expect(msg.source).toBe('official');
        expect(msg.content).toBe('Official news');
    });

    it('parses image message', () => {
        const msg = parseWechatMessage(makePayload({
            new_messages: [makePushItem({type: 3, image_buffer: {buffer: [1, 2, 3], len: 3}})],
        }));
        expect(msg.type).toBe('image');
        expect(msg.mediaId).toBe('1,2,3');
    });

    it('parses voice message', () => {
        const msg = parseWechatMessage(makePayload({
            new_messages: [makePushItem({type: 34})],
        }));
        expect(msg.type).toBe('voice');
    });

    it('parses video message', () => {
        const msg = parseWechatMessage(makePayload({
            new_messages: [makePushItem({type: 43})],
        }));
        expect(msg.type).toBe('video');
    });

    it('parses location message', () => {
        const msg = parseWechatMessage(makePayload({
            new_messages: [makePushItem({type: 48})],
        }));
        expect(msg.type).toBe('location');
        expect(msg.location?.latitude).toBe(0);
        expect(msg.location?.longitude).toBe(0);
    });

    it('parses link message', () => {
        const msg = parseWechatMessage(makePayload({
            new_messages: [makePushItem({type: 49, content: {value: 'Test Page'}})],
        }));
        expect(msg.type).toBe('link');
        expect(msg.link?.title).toBe('Test Page');
    });

    it('falls back to text for unknown type', () => {
        const msg = parseWechatMessage(makePayload({
            new_messages: [makePushItem({type: 999, content: {value: 'some content'}})],
        }));
        expect(msg.type).toBe('text');
        expect(msg.content).toBe('some content');
    });

    it('parses the provided webhook payload shape', () => {
        const msg = parseWechatMessage({
            modify_contacts: null,
            delete_contacts: null,
            new_messages: [
                {
                    msg_id: 1149100601,
                    sender: {value: 'wxid_5jfnhtqy74xr22'},
                    receiver: {value: 'wxid_ahl9az25aljx22'},
                    type: 1,
                    content: {value: '你好'},
                    status: 3,
                    image_status: 1,
                    image_buffer: {len: 0},
                    create_time: 1772785931,
                    msg_source: '<msgsource>...</msgsource>',
                    push_content: 'Liwncy : 你好',
                    new_msg_id: 1294278824268514573,
                    msg_seq: 913520601,
                },
            ],
            modify_user_infos: null,
            modify_user_images: null,
            user_info_extends: null,
            function_switches: null,
            unknowns: null,
            continue: false,
        });

        expect(msg.type).toBe('text');
        expect(msg.content).toBe('你好');
        expect(msg.from).toBe('wxid_5jfnhtqy74xr22');
        expect(msg.to).toBe('wxid_ahl9az25aljx22');
        expect(msg.timestamp).toBe(1772785931);
        expect(msg.messageId).toBe('1149100601');
    });
});

describe('buildWechatReply', () => {
    it('builds text reply JSON for private chat', () => {
        const reply: ReplyMessage = {type: 'text', content: 'Hello User'};
        const result = buildWechatReply(reply, 'wxid_sender');
        expect(result).toEqual({
            to: 'wxid_sender',
            type: 'text',
            content: 'Hello User',
        });
    });

    it('builds text reply JSON for group chat', () => {
        const reply: ReplyMessage = {type: 'text', content: 'Hello Group'};
        const result = buildWechatReply(reply, 'wxid_sender', 'room_123@chatroom');
        expect(result).toEqual({
            to: 'room_123@chatroom',
            type: 'text',
            content: 'Hello Group',
        });
    });

    it('builds image reply JSON', () => {
        const reply: ReplyMessage = {type: 'image', mediaId: 'media_001'};
        const result = buildWechatReply(reply, 'wxid_sender');
        expect(result).toEqual({
            to: 'wxid_sender',
            type: 'image',
            mediaUrl: 'media_001',
        });
    });

    it('builds news reply JSON', () => {
        const reply: ReplyMessage = {
            type: 'news',
            articles: [
                {title: 'Article 1', description: 'Desc 1', url: 'https://example.com/1', picUrl: ''},
                {title: 'Article 2', description: 'Desc 2', url: 'https://example.com/2', picUrl: ''},
            ],
        };
        const result = buildWechatReply(reply, 'wxid_sender');
        expect(result.type).toBe('news');
        expect(result.articles).toHaveLength(2);
    });

    it('returns empty object for unsupported reply type', () => {
        const reply = {type: 'card', cardContent: {}} as ReplyMessage;
        const result = buildWechatReply(reply, 'wxid_sender');
        expect(result).toEqual({});
    });

    it('uses reply.to to override recipient in private chat', () => {
        const reply: ReplyMessage = {type: 'text', content: 'Hi', to: 'wxid_other'};
        const result = buildWechatReply(reply, 'wxid_sender');
        expect(result).toEqual({
            to: 'wxid_other',
            type: 'text',
            content: 'Hi',
        });
    });

    it('uses reply.to to override recipient in group chat', () => {
        const reply: ReplyMessage = {type: 'text', content: 'Hi', to: 'room_456@chatroom'};
        const result = buildWechatReply(reply, 'wxid_sender', 'room_123@chatroom');
        expect(result).toEqual({
            to: 'room_456@chatroom',
            type: 'text',
            content: 'Hi',
        });
    });

    it('includes remind field for mentions in group chat', () => {
        const reply: ReplyMessage = {
            type: 'text',
            content: 'Hello everyone',
            mentions: ['wxid_user1', 'wxid_user2'],
        };
        const result = buildWechatReply(reply, 'wxid_sender', 'room_123@chatroom');
        expect(result).toEqual({
            to: 'room_123@chatroom',
            type: 'text',
            content: 'Hello everyone',
            remind: 'wxid_user1,wxid_user2',
        });
    });

    it('does not include remind field for mentions in private chat without reply.to', () => {
        const reply: ReplyMessage = {
            type: 'text',
            content: 'Hello',
            mentions: ['wxid_user1'],
        };
        const result = buildWechatReply(reply, 'wxid_sender');
        expect(result).toEqual({
            to: 'wxid_sender',
            type: 'text',
            content: 'Hello',
        });
    });

    it('includes remind field when reply.to is set even without roomId', () => {
        const reply: ReplyMessage = {
            type: 'text',
            content: 'Hey',
            to: 'room_999@chatroom',
            mentions: ['wxid_target'],
        };
        const result = buildWechatReply(reply, 'wxid_sender');
        expect(result).toEqual({
            to: 'room_999@chatroom',
            type: 'text',
            content: 'Hey',
            remind: 'wxid_target',
        });
    });

    it('does not include remind field when reply.to is a private user', () => {
        const reply: ReplyMessage = {
            type: 'text',
            content: 'Hey',
            to: 'wxid_other',
            mentions: ['wxid_target'],
        };
        const result = buildWechatReply(reply, 'wxid_sender');
        expect(result).toEqual({
            to: 'wxid_other',
            type: 'text',
            content: 'Hey',
        });
    });

    it('builds multiple reply payloads from an array of replies', () => {
        const replies: ReplyMessage[] = [
            {type: 'text', content: 'Hello'},
            {type: 'image', mediaId: 'media_001'},
        ];
        const payloads = replies.map((r) => buildWechatReply(r, 'wxid_sender'));
        expect(payloads).toHaveLength(2);
        expect(payloads[0]).toEqual({to: 'wxid_sender', type: 'text', content: 'Hello'});
        expect(payloads[1]).toEqual({to: 'wxid_sender', type: 'image', mediaUrl: 'media_001'});
    });
});
