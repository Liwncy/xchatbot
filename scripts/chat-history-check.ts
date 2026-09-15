import assert from 'node:assert/strict';
import {formatHistoryList} from '../src/core/chat-log/format-history.ts';
import {
    resolveHistoryWindow,
    sanitizeHistoryLimit,
    sessionIdFromScope,
} from '../src/core/chat-log/query.ts';
import type {ChatMessageRecord} from '../src/core/chat-log/types.ts';

assert.equal(sessionIdFromScope('group:123@chatroom'), '123@chatroom');
assert.equal(sessionIdFromScope('scope=group:123@chatroom'), '123@chatroom');
assert.equal(sessionIdFromScope('user:wxid_abc'), 'private:wxid_abc');
assert.equal(sessionIdFromScope('123@chatroom'), '123@chatroom');
assert.equal(sessionIdFromScope(''), '');
assert.equal(sanitizeHistoryLimit(undefined, false), 20);
assert.equal(sanitizeHistoryLimit(undefined, true), 200);
assert.equal(sanitizeHistoryLimit(999, false), 200);

{
    const {window, error} = resolveHistoryWindow({date: '2026-08-29'});
    assert.equal(error, undefined);
    assert.equal(window.sinceUnix, Date.parse('2026-08-29T00:00:00+08:00') / 1000);
    assert.equal(window.untilUnix, Date.parse('2026-08-30T00:00:00+08:00') / 1000);
    assert.match(window.label, /2026-08-29 00:00:00 ~ 2026-08-30 00:00:00/);
}

{
    const {window} = resolveHistoryWindow({date: '2026-08-31'});
    assert.equal(window.sinceUnix, Date.parse('2026-08-31T00:00:00+08:00') / 1000);
    assert.equal(window.untilUnix, Date.parse('2026-09-01T00:00:00+08:00') / 1000);
}

{
    const {window} = resolveHistoryWindow({date: '2026-08-29 14:30:05'});
    assert.equal(window.sinceUnix, Date.parse('2026-08-29T14:30:05+08:00') / 1000);
    assert.equal(window.untilUnix, Date.parse('2026-08-30T00:00:00+08:00') / 1000);
}

{
    const {window} = resolveHistoryWindow({from: '2026-08-29 17:00:00', until: '2026-08-29 18:00:00'});
    assert.equal(window.sinceUnix, Date.parse('2026-08-29T17:00:00+08:00') / 1000);
    assert.equal(window.untilUnix, Date.parse('2026-08-29T18:00:00+08:00') / 1000);
}

{
    const {error} = resolveHistoryWindow({date: '不是日期'});
    assert.match(error ?? '', /date 认不出来/);
}

{
    const empty = formatHistoryList([], '最近', 20, false);
    assert.match(empty, /没有找到记录/);
    const row: ChatMessageRecord = {
        id: 9,
        messageId: 'm9',
        platform: 'golem',
        sessionId: '123@chatroom',
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
        createdAt: Date.parse('2026-08-29T10:00:00+08:00') / 1000,
        ingestedAt: 1,
    };
    const list = formatHistoryList([row], '最近', 20, false);
    assert.match(list, /共 1 条（旧→新）/);
    assert.match(list, /inbound wxid_b\/李四 type=text id=m9: 刚才说的/);
}

console.log('✓ chat history query');
