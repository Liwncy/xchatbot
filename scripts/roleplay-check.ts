import assert from 'node:assert/strict';
import {formatCurrentInbound} from '../src/core/inbound.ts';
import {matchCommandId, tryHandleRoleplay, wrapUserContent} from '../src/core/roleplay/index.ts';
import type {IncomingMessage} from '../src/core/message.ts';
import type {Env} from '../src/types/env.ts';

const kv = new Map<string, string>();
const env = {
    BOT_OWNER_WECHAT_ID: 'wxid_owner',
    XBOT_KV: {
        get: async (key: string) => kv.get(key) ?? null,
        put: async (key: string, value: string) => {
            kv.set(key, value);
        },
        delete: async (key: string) => {
            kv.delete(key);
        },
    },
} as unknown as Env;

function msg(partial: Partial<IncomingMessage> = {}): IncomingMessage {
    return {
        platform: 'golem',
        type: 'text',
        source: 'group',
        from: 'wxid_owner',
        senderName: '李芈仙',
        to: '123@chatroom',
        timestamp: 1,
        messageId: 'm1',
        content: '你好',
        room: {id: '123@chatroom'},
        raw: {},
        ...partial,
    };
}

assert.equal(await tryHandleRoleplay(env, msg({from: 'wxid_other'}), '加角色 猫娘 你是猫娘'), '这个我加不了');
assert.equal(await tryHandleRoleplay(env, msg(), '加角色'), '名字和演法写一起，换行也行');
assert.equal(await tryHandleRoleplay(env, msg(), '加角色 猫娘 你是猫娘，短句。'), '好，记下了。说扮演猫娘就行');
assert.equal(await tryHandleRoleplay(env, msg(), '加角色 猫娘 再写一遍'), '已经有这个了');
assert.equal(await matchCommandId(env, '扮演猫娘'), '猫娘');
assert.equal(await matchCommandId(env, '今天天气'), null);
assert.equal(await tryHandleRoleplay(env, msg(), '今天天气'), null);
assert.equal(await tryHandleRoleplay(env, msg(), '扮演猫娘'), '好，猫娘。');
assert.equal(await tryHandleRoleplay(env, msg(), '现在演谁'), '现在演猫娘');

{
    const inbound = await formatCurrentInbound(msg({content: '在吗'}), env);
    assert.match(inbound, /role=猫娘/);
    assert.match(inbound, /scope=group:123@chatroom/);
    const wrapped = wrapUserContent(inbound, {id: '猫娘', name: '猫娘', triggers: [], instruction: '你是猫娘，短句。', ack: '好，猫娘。'});
    assert.equal(wrapped, `你是猫娘，短句。\n\n${inbound}`);
}

assert.equal(await tryHandleRoleplay(env, msg(), '不当了'), '好，不当了。');
assert.equal(await tryHandleRoleplay(env, msg(), '当前角色'), '现在没演');

console.log('✓ roleplay');
