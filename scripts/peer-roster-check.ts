import assert from 'node:assert/strict';
import {parseRepliesFromText} from '../src/core/outbound.ts';
import {
    looksLikePeerShout,
    parsePeerShout,
    pendingKvKey,
    stripLeadAt,
} from '../src/core/peer-roster/collect.ts';
import {
    extractAsk,
    inferShoutType,
    normalizeShoutTemplate,
    outboundLine,
    renderShout,
} from '../src/core/peer-roster/template.ts';

assert.equal(inferShoutType('golem::info'), 'fixed');
assert.equal(inferShoutType('一言'), 'fixed');
assert.equal(inferShoutType('music {问}'), 'tail');
assert.equal(inferShoutType('music 老鼠爱大米'), 'tail');
assert.equal(inferShoutType(''), 'talk');

assert.deepEqual(normalizeShoutTemplate('golem::info'), {
    type: 'fixed',
    template: 'golem::info',
    example: '',
});
assert.deepEqual(normalizeShoutTemplate('music {问}'), {
    type: 'tail',
    template: 'music {问}',
    example: '',
});
assert.deepEqual(normalizeShoutTemplate('music 老鼠爱大米'), {
    type: 'tail',
    template: 'music {问}',
    example: '老鼠爱大米',
});
assert.deepEqual(normalizeShoutTemplate(''), {type: 'talk', template: '', example: ''});

assert.equal(extractAsk('来首老鼠爱大米', 'music {问}'), '来首老鼠爱大米');
assert.equal(extractAsk('music 老鼠爱大米', 'music {问}'), '老鼠爱大米');
assert.equal(extractAsk('@火 music 老鼠爱大米', 'music {问}'), '老鼠爱大米');

assert.deepEqual(renderShout({type: 'fixed', template: 'golem::info', mention: false, name: 'Golem'}, ''), {
    ok: true,
    text: 'golem::info',
});
assert.deepEqual(renderShout({type: 'tail', template: 'music {问}', mention: false, name: '火'}, '老鼠爱大米'), {
    ok: true,
    text: 'music 老鼠爱大米',
});
assert.deepEqual(renderShout({type: 'tail', template: '@火 发{问}表情', mention: true, name: '火'}, '掌嘴'), {
    ok: true,
    text: '@火 发掌嘴表情',
});
assert.deepEqual(renderShout({type: 'talk', template: '', mention: true, name: 'ccff'}, '写个查日期的脚本'), {
    ok: true,
    text: '@ccff 写个查日期的脚本',
});
assert.deepEqual(renderShout({type: 'tail', template: 'music {问}', mention: false, name: '火'}, ''), {
    ok: false,
    text: '',
});

assert.equal(outboundLine('wxid_qh0zt0a3xtrb29', '@陌私语 帮看下'), 'at:wxid_qh0zt0a3xtrb29|@陌私语 帮看下');

const replies = parseRepliesFromText('喊了\nat:wxid_abc|@火 发掌嘴表情');
assert.equal(replies.length, 2);
assert.deepEqual(replies[0], {type: 'text', content: '喊了'});
assert.deepEqual(replies[1], {type: 'text', content: '@火 发掌嘴表情', mentions: ['wxid_abc']});

assert.equal(stripLeadAt('@火 music 老鼠爱大米'), 'music 老鼠爱大米');
assert.equal(looksLikePeerShout('golem::info'), true);
assert.equal(looksLikePeerShout('music 老鼠爱大米'), true);
assert.equal(looksLikePeerShout('@火 一言'), true);
assert.equal(looksLikePeerShout('今日发言排行'), true);
assert.equal(looksLikePeerShout('帮我看下这个'), false);
assert.equal(looksLikePeerShout('哈哈'), false);
assert.equal(looksLikePeerShout('来首老鼠爱大米'), false);
assert.deepEqual(parsePeerShout('@火 music 老鼠爱大米'), {topic: 'music', template: 'music {问}'});
assert.deepEqual(parsePeerShout('golem::info'), {topic: 'golem::info', template: 'golem::info'});
assert.equal(pendingKvKey('golem', '561@chatroom', 'wxid_x'), 'peer:pending:golem:561@chatroom:wxid_x');

console.log('peer-roster-check ok');
