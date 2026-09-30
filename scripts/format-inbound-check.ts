import assert from 'node:assert/strict';
import {resolveMentions} from '../src/adapter/golem/parse-mentions.ts';
import {finishInbound, formatCurrentInbound, prependRecentContext} from '../src/core/inbound.ts';
import type {IncomingMessage} from '../src/core/message.ts';
import type {Env} from '../src/types/env.ts';

const env = {
    BOT_OWNER_WECHAT_ID: 'wxid_owner',
    XBOT_KV: {
        get: async () => null,
        put: async () => undefined,
        delete: async () => undefined,
    },
} as unknown as Env;

const base: IncomingMessage = {
    platform: 'golem',
    type: 'text',
    source: 'group',
    chatId: '123@chatroom',
    senderId: 'wxid_a',
    senderName: '张三',
    to: '123@chatroom',
    timestamp: 1,
    messageId: 'm1',
    content: '你好',
    raw: {},
};

{
    const mentions = resolveMentions(
        '@李四\u2005来一下',
        '<msgsource><atuserlist>wxid_b</atuserlist></msgsource>',
    );
    assert.deepEqual(mentions, [{id: 'wxid_b', name: '李四'}]);
}

async function main(): Promise<void> {
    {
        const text = await formatCurrentInbound({
            ...base,
            senderId: 'wxid_owner',
            senderName: '李芈仙',
            quote: {
                title: '昨天那张',
                referType: 3,
                referContent: '看这图',
                referFrom: 'wxid_b',
                referSenderName: '李四',
                media: {md5: '0123456789abcdef0123456789abcdef', url: 'https://cdn.example/a.jpg'},
            },
            mentions: [{id: 'wxid_b', name: '李四'}],
        }, env, {url: 'https://cdn.example/a.jpg', kind: 'image'});
        assert.match(text, /^\[wxid_owner\/李芈仙 owner scope=group:123@chatroom]/);
        assert.match(text, /\[引用:image 李四] 看这图 md5=0123456789abcdef0123456789abcdef/);
        assert.match(text, /\[被@ 1 wxid_b\/李四]/);
    }

    {
        const image = await formatCurrentInbound({...base, type: 'image', content: ''}, env);
        assert.match(image, /\[图片]$/);
        const voice = await formatCurrentInbound({...base, type: 'voice', content: ''}, env);
        assert.match(voice, /\[语音]$/);
        const video = await formatCurrentInbound({...base, type: 'video', content: ''}, env);
        assert.match(video, /\[视频]$/);
        const emoji = await formatCurrentInbound({...base, type: 'emoji', content: ''}, env, {
            url: 'https://file.example/sticker.jpg',
            kind: 'emoji',
        });
        assert.match(emoji, /\[表情] url=https:\/\/file\.example\/sticker\.jpg$/);
        const borrowed = await formatCurrentInbound({
            ...base,
            type: 'link',
            content: '就等你这声才轮到我？',
            quote: {
                title: '嗯，睡了。',
                referType: 1,
                referContent: '嗯，睡了。',
                referSenderName: '小聪明儿',
            },
        }, env, {url: 'https://file.example/old.jpg', kind: 'emoji'});
        assert.match(borrowed, /就等你这声才轮到我？/);
        assert.match(borrowed, /\[引用 小聪明儿] 嗯，睡了。/);
        assert.doesNotMatch(borrowed, /url=/);
    }

    {
        const wrapped = prependRecentContext('[wxid_a scope=user:wxid_a] 本条', [{
            id: 1,
            messageId: 'old',
            platform: 'golem',
            sessionId: 's',
            sessionType: 'group',
            direction: 'inbound',
            actorType: 'member',
            senderId: 'wxid_b',
            senderName: '李四',
            msgType: 'text',
            contentText: '刚才说的',
            payloadJson: '{}',
            charCount: 4,
            referMessageId: null,
            causedByMessageId: null,
            replyIndex: 0,
            pluginName: null,
            replyStatus: null,
            createdAt: 1,
            ingestedAt: 1,
        }]);
        assert.match(wrapped, /^\[近10分钟上下文，不是本条指令]/);
        assert.match(wrapped, /wxid_b\/李四: 刚才说的/);
        assert.match(wrapped, /---\n\[本条]\n\[wxid_a scope=user:wxid_a] 本条/);
        assert.equal(finishInbound(wrapped), `${wrapped}\n[本条完]`);
        assert.equal(finishInbound(`${wrapped}\n[本条完]`), `${wrapped}\n[本条完]`);
    }

    console.log('✓ inbound format');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
