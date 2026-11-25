import assert from 'node:assert/strict';
import {parseRepliesFromText} from '../../src/core/outbound.ts';
import {
    looksLikePeerShout,
    parsePeerShout,
    pendingKvKey,
    stripLeadAt,
} from '../../src/core/peer-roster/collect.ts';
import {pickPeerRoute} from '../../src/core/peer-roster/service.ts';
import {
    extractAsk,
    inferShoutType,
    normalizeShoutTemplate,
    outboundLine,
    renderShout,
} from '../../src/core/peer-roster/template.ts';
import type {PeerRoute} from '../../src/core/peer-roster/types.ts';

assert.equal(inferShoutType('golem::info'), 'fixed');
assert.equal(inferShoutType('一言'), 'fixed');
assert.equal(inferShoutType('music {问}'), 'param');
assert.equal(inferShoutType('music 老鼠爱大米'), 'param');
assert.equal(inferShoutType(''), 'chat');

assert.deepEqual(normalizeShoutTemplate('golem::info'), {
    type: 'fixed',
    template: 'golem::info',
    example: '',
});
assert.deepEqual(normalizeShoutTemplate('music {问}'), {
    type: 'param',
    template: 'music {问}',
    example: '',
});
assert.deepEqual(normalizeShoutTemplate('music 老鼠爱大米'), {
    type: 'param',
    template: 'music {问}',
    example: '老鼠爱大米',
});
assert.deepEqual(normalizeShoutTemplate(''), {type: 'chat', template: '', example: ''});

assert.equal(extractAsk('来首老鼠爱大米', 'music {问}'), '来首老鼠爱大米');
assert.equal(extractAsk('music 老鼠爱大米', 'music {问}'), '老鼠爱大米');
assert.equal(extractAsk('@火 music 老鼠爱大米', 'music {问}'), '老鼠爱大米');
// 夹心模板：整句、只有词、只有尾、表情名自己带头字
assert.equal(extractAsk('发掌嘴表情', '发{问}表情'), '掌嘴');
assert.equal(extractAsk('@火 发掌嘴表情', '发{问}表情'), '掌嘴');
assert.equal(extractAsk('掌嘴', '发{问}表情'), '掌嘴');
assert.equal(extractAsk('掌嘴表情', '发{问}表情'), '掌嘴');
assert.equal(extractAsk('发呆', '发{问}表情'), '发呆');
assert.deepEqual(renderShout({type: 'param', template: '发{问}表情', mention: true, name: '火'}, '摊手'), {
    ok: true,
    text: '@火 发摊手表情',
});

assert.deepEqual(renderShout({type: 'fixed', template: 'golem::info', mention: false, name: 'Golem'}, ''), {
    ok: true,
    text: 'golem::info',
});
assert.deepEqual(renderShout({type: 'param', template: 'music {问}', mention: false, name: '火'}, '老鼠爱大米'), {
    ok: true,
    text: 'music 老鼠爱大米',
});
assert.deepEqual(renderShout({type: 'param', template: '@火 发{问}表情', mention: true, name: '火'}, '掌嘴'), {
    ok: true,
    text: '@火 发掌嘴表情',
});
assert.deepEqual(renderShout({type: 'chat', template: '', mention: true, name: 'ccff'}, '写个查日期的脚本'), {
    ok: true,
    text: '@ccff 写个查日期的脚本',
});
assert.deepEqual(renderShout({type: 'param', template: 'music {问}', mention: false, name: '火'}, ''), {
    ok: false,
    text: '',
});

assert.equal(outboundLine('wxid_qh0zt0a3xtrb29', '@陌私语 帮看下'), 'at:wxid_qh0zt0a3xtrb29|@陌私语 帮看下');

const replies = parseRepliesFromText('喊了\nat:wxid_abc|@火 发掌嘴表情');
assert.equal(replies.length, 2);
assert.deepEqual(replies[0], {type: 'text', content: '喊了'});
assert.deepEqual(replies[1], {type: 'text', content: '@火 发掌嘴表情', mentions: ['wxid_abc']});

const mashed = parseRepliesFromText('喊她了 at:wxid_qh0zt0a3xtrb29 · @陌私语 发个老牛子的表情');
assert.equal(mashed.length, 2);
assert.deepEqual(mashed[0], {type: 'text', content: '喊她了'});
assert.deepEqual(mashed[1], {
    type: 'text',
    content: '@陌私语 发个老牛子的表情',
    mentions: ['wxid_qh0zt0a3xtrb29'],
});

assert.equal(stripLeadAt('@火 music 老鼠爱大米'), 'music 老鼠爱大米');
assert.equal(looksLikePeerShout('golem::info'), true);
assert.equal(looksLikePeerShout('music 老鼠爱大米'), true);
assert.equal(looksLikePeerShout('@火 一言'), true);
assert.equal(looksLikePeerShout('今日发言排行'), true);
assert.equal(looksLikePeerShout('帮我看下这个'), false);
assert.equal(looksLikePeerShout('哈哈'), false);
assert.equal(looksLikePeerShout('来首老鼠爱大米'), false);
assert.deepEqual(parsePeerShout('@火 music 老鼠爱大米'), {title: 'music', template: 'music {问}'});
assert.deepEqual(parsePeerShout('golem::info'), {title: 'golem::info', template: 'golem::info'});
assert.equal(pendingKvKey('golem', '561@chatroom', 'wxid_x'), 'peer:pending:golem:561@chatroom:wxid_x');

function route(partial: Partial<PeerRoute> & Pick<PeerRoute, 'title' | 'memberName'>): PeerRoute {
    return {
        id: 1,
        sessionId: '1@chatroom',
        memberId: 'wxid_ma',
        about: partial.title,
        type: 'chat',
        template: '',
        mention: true,
        example: '',
        status: 'active',
        source: 'manual',
        createdAt: 0,
        updatedAt: 0,
        ...partial,
    };
}

const draw = route({id: 1, title: '画画', memberName: '老马'});
const music = route({
    id: 2, title: '点歌', memberName: '火', memberId: 'wxid_huo', type: 'param', template: 'music {问}',
});
const fallback = route({id: 3, title: '兜底', memberName: '老马'});
const roster = [draw, music, fallback];

assert.equal(pickPeerRoute(roster, {id: 2})?.id, 2);
assert.equal(pickPeerRoute(roster, {id: 999}), undefined);
assert.equal(pickPeerRoute(roster, {title: '画画'})?.id, 1);
assert.equal(pickPeerRoute(roster, {title: '兜底'})?.id, 3);
assert.equal(pickPeerRoute(roster, {})?.id, 3);
assert.equal(pickPeerRoute(roster, {title: '来张图'})?.id, 3);
assert.equal(pickPeerRoute(roster, {name: '火', title: '点歌'})?.id, 2);
assert.equal(pickPeerRoute([draw, music], {title: '兜底'}), undefined);

console.log('peer-roster-check ok');
