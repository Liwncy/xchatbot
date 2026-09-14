import assert from 'node:assert/strict';
import {resolveMentions} from '../src/adapter/golem/parse-mentions.ts';
import {formatCurrentInbound, prependRecentContext} from '../src/plugins/agent/openclaw/format-inbound.ts';
import type {IncomingMessage} from '../src/core/message.ts';
import type {Env} from '../src/types/env.ts';

const env = {
    BOT_OWNER_WECHAT_ID: 'wxid_owner',
} as Env;

const base: IncomingMessage = {
    platform: 'golem',
    type: 'text',
    source: 'group',
    from: 'wxid_a',
    senderName: '张三',
    to: '123@chatroom',
    timestamp: 1,
    messageId: 'm1',
    content: '你好',
    room: {id: '123@chatroom'},
    raw: {},
};

{
    const mentions = resolveMentions(
        '@李四\u2005来一下',
        '<msgsource><atuserlist>wxid_b</atuserlist></msgsource>',
    );
    assert.deepEqual(mentions, [{id: 'wxid_b', name: '李四'}]);
}

{
    const text = formatCurrentInbound({
        ...base,
        from: 'wxid_owner',
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
}

console.log('✓ inbound format');
