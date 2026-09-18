import assert from 'node:assert/strict';
import {emitChatRecordLine} from '../src/adapter/golem/chat-record.ts';
import {parseRosterSnapshot} from '../src/adapter/golem/roster.ts';
import {chatRecordReply} from '../src/core/reply.ts';
import {buildFakeForwardCard} from '../src/plugins/channel/fake-forward/card.ts';
import {parseFakeForwardCommand} from '../src/plugins/channel/fake-forward/command.ts';
import {
    FakeForwardAskError,
    parseFakeForwardScript,
    parseTime,
} from '../src/plugins/channel/fake-forward/script.ts';
import type {ChannelAdapter} from '../src/adapter/types.ts';
import type {Env} from '../src/types/env.ts';

const now = Date.parse('2026-09-18T03:00:00.000Z');

{
    const lines = parseFakeForwardScript('张三|09:12|你到了吗\n李四||快了', now);
    assert.equal(lines.length, 2);
    assert.equal(lines[0]?.name, '张三');
    assert.equal(lines[0]?.timestampMs, parseTime('09:12', now));
    assert.equal(lines[1]?.name, '李四');
    assert.equal(lines[1]?.timestampMs, (lines[0]?.timestampMs ?? 0) + 60_000);
}

{
    const lines = parseFakeForwardScript('路过的猫|内容里有|竖线', now);
    assert.equal(lines[0]?.content, '内容里有|竖线');
}

assert.throws(() => parseFakeForwardScript(''), FakeForwardAskError);
assert.throws(() => parseFakeForwardScript('只有名字'), FakeForwardAskError);

{
    const snapshot = parseRosterSnapshot({
        data: {
            result: {
                list: [
                    {
                        username: 'wxid_a',
                        nickname: '张三',
                        display_name: '群里的张三',
                        big_avatar_url: 'https://example.com/a.jpg',
                    },
                    {
                        username: 'wxid_c',
                        nickname: '重名',
                        display_name: '重名',
                    },
                    {
                        username: 'wxid_d',
                        nickname: '重名',
                        display_name: '另一个重名',
                    },
                ],
            },
        },
    }, now);
    assert.equal(snapshot.byName.get('群里的张三')?.id, 'wxid_a');
    assert.equal(snapshot.byName.get('张三')?.avatar, 'https://example.com/a.jpg');
    assert.equal(snapshot.byName.has('重名'), false);
}

{
    const line = emitChatRecordLine([
        {nickname: '张三', content: '你到了吗', timestampMs: now, avatarUrl: 'https://example.com/a.jpg'},
    ], '测试卡');
    assert.match(line, /^app:19 </u);
    assert.match(line, /测试卡/);
    assert.equal(line.includes('\n'), false);
}

{
    const lines = parseFakeForwardScript('张三|09:12|你到了吗\n李四|09:13|快了', now);
    const reply = chatRecordReply(
        lines.map((line) => ({
            nickname: line.name,
            content: line.content,
            timestampMs: line.timestampMs,
        })),
        {title: '昨晚群聊'},
    );
    const outbound = emitChatRecordLine(reply.items, reply.title);
    assert.equal(reply.type, 'chat-record');
    assert.match(outbound, /^app:19 </u);
    assert.match(outbound, /昨晚群聊/);
}

assert.equal(parseFakeForwardCommand('随机朋友'), null);
assert.equal(parseFakeForwardCommand('伪转'), null);
assert.deepEqual(parseFakeForwardCommand('伪转发'), {kind: 'help'});
assert.deepEqual(parseFakeForwardCommand('伪转发 帮助'), {kind: 'help'});
assert.deepEqual(parseFakeForwardCommand('伪转发帮助'), {kind: 'help'});
assert.deepEqual(
    parseFakeForwardCommand('伪转发 张三|09:12|你到了吗\n李四||快了'),
    {kind: 'script', script: '张三|09:12|你到了吗\n李四||快了'},
);
assert.deepEqual(
    parseFakeForwardCommand('伪转发 昨晚群聊\n张三|09:12|你到了吗'),
    {kind: 'script', title: '昨晚群聊', script: '张三|09:12|你到了吗'},
);

void (async function checkFakeForwardCard() {
    const adapter = {
        platform: 'golem',
        async findRoomMember(_roomId: string, name: string) {
            if (name !== '张三') return null;
            return {id: 'wxid_a', name: '张三', nickname: '群里的张三', avatarUrl: 'https://example.com/a.jpg'};
        },
    } as ChannelAdapter;
    const reply = await buildFakeForwardCard(adapter, {} as Env, {
        script: '张三|09:12|你到了吗\n路人||在吗',
        title: '昨晚群聊',
        group: '123@chatroom',
    });
    assert.equal(reply.type, 'chat-record');
    assert.equal(reply.title, '昨晚群聊');
    assert.equal(reply.items[0]?.nickname, '群里的张三');
    assert.equal(reply.items[0]?.avatarUrl, 'https://example.com/a.jpg');
    assert.equal(reply.items[1]?.nickname, '路人');
    console.log('✓ fake-forward');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
