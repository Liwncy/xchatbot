import assert from 'node:assert/strict';
import type {IncomingMessage} from '../../src/core/message.ts';
import {isBotMentioned} from '../../src/plugins/channel/session/mention.ts';
import {parseJoinAnswer} from '../../src/plugins/channel/session/auto-reply.ts';
import {
    allowsGroupMessage,
    DEFAULT_GROUP_SETTINGS,
    DEFAULT_REPLY_CHANCE,
    editRuleList,
    followUpApplies,
    matchesKeyword,
    matchesRuleUser,
    modeLabel,
    normalizeSettings,
    parseGroupCommand,
    parseMode,
    rollChance,
} from '../../src/plugins/channel/session/policy.ts';

assert.equal(parseMode('点名'), 'mention');
assert.equal(parseMode('MENTION'), 'mention');
assert.equal(parseMode('智能模式'), 'smart');
assert.equal(parseMode('自主'), 'auto');
assert.equal(parseMode('自主模式'), 'auto');
assert.equal(parseMode('nope'), null);
assert.equal(modeLabel('auto'), '自主');
assert.equal(modeLabel('random'), '随机');
assert.equal(normalizeSettings({}).replyChancePercent, DEFAULT_REPLY_CHANCE);
assert.equal(normalizeSettings({replyChancePercent: 0}).replyChancePercent, 0);
assert.deepEqual(normalizeSettings({mode: '点名', userIds: [' a ', 'a']}).userIds, ['a']);

assert.deepEqual(parseGroupCommand('开始'), {kind: 'enable'});
assert.deepEqual(parseGroupCommand('结束'), {kind: 'disable'});
assert.deepEqual(parseGroupCommand('状态'), {kind: 'status'});
assert.deepEqual(parseGroupCommand('模式'), {kind: 'unknown-help'});
assert.deepEqual(parseGroupCommand('跟聊'), {kind: 'unknown-help'});
assert.deepEqual(parseGroupCommand('概率'), {kind: 'unknown-help'});
assert.deepEqual(parseGroupCommand('模式 随机'), {kind: 'set-mode', mode: 'random'});
assert.deepEqual(parseGroupCommand('模式 自主'), {kind: 'set-mode', mode: 'auto'});
assert.deepEqual(parseGroupCommand('自主模式'), {kind: 'set-mode', mode: 'auto'});
assert.deepEqual(parseGroupCommand('随机模式'), {kind: 'set-mode', mode: 'random'});
assert.deepEqual(parseGroupCommand('模式 随机 20'), {kind: 'set-chance', percent: 20});
assert.deepEqual(parseGroupCommand('概率 8%'), {kind: 'set-chance', percent: 8});
assert.deepEqual(parseGroupCommand('随机 100'), {kind: 'set-chance', percent: 100});
assert.deepEqual(parseGroupCommand('跟聊 60'), {kind: 'set-follow', seconds: 60});
assert.deepEqual(parseGroupCommand('跟聊开'), {kind: 'set-follow', seconds: 60});
assert.deepEqual(parseGroupCommand('跟聊关'), {kind: 'set-follow', seconds: 0});
assert.deepEqual(parseGroupCommand('规则 用户 wxid_a，wxid_b'), {
    kind: 'edit-list', field: 'userIds', op: 'set', values: ['wxid_a', 'wxid_b'],
});
assert.deepEqual(parseGroupCommand('规则 关键词 原神 崩铁'), {
    kind: 'edit-list', field: 'keywords', op: 'set', values: ['原神', '崩铁'],
});
assert.deepEqual(parseGroupCommand('规则 清空'), {kind: 'clear-rule'});

assert.deepEqual(parseGroupCommand('放行'), {kind: 'rule-help'});
assert.deepEqual(parseGroupCommand('放行帮助'), {kind: 'rule-help'});
assert.deepEqual(parseGroupCommand('放行名单'), {kind: 'list-rule'});
assert.deepEqual(parseGroupCommand('放行清空'), {kind: 'clear-rule'});
assert.deepEqual(parseGroupCommand('放行用户'), {kind: 'rule-help'});
assert.deepEqual(parseGroupCommand('放行词语 加'), {kind: 'rule-help'});
assert.deepEqual(parseGroupCommand('放行用户 wxid_a wxid_b'), {
    kind: 'edit-list', field: 'userIds', op: 'set', values: ['wxid_a', 'wxid_b'],
});
assert.deepEqual(parseGroupCommand('放行词语 加 原神 崩铁'), {
    kind: 'edit-list', field: 'keywords', op: 'add', values: ['原神', '崩铁'],
});
assert.deepEqual(parseGroupCommand('放行词语 删 原神'), {
    kind: 'edit-list', field: 'keywords', op: 'remove', values: ['原神'],
});
assert.deepEqual(parseGroupCommand('放行词语 清空'), {
    kind: 'edit-list', field: 'keywords', op: 'clear', values: [],
});
assert.deepEqual(parseGroupCommand('放行用户 清空'), {
    kind: 'edit-list', field: 'userIds', op: 'clear', values: [],
});
assert.deepEqual(editRuleList(['a', 'B'], 'add', ['b', 'c']), ['a', 'B', 'c']);
assert.deepEqual(editRuleList(['a', 'B'], 'remove', ['b']), ['a']);
assert.deepEqual(editRuleList(['a'], 'set', ['x', 'x']), ['x']);
assert.equal(parseGroupCommand('随便聊聊'), null);

const mention = {...DEFAULT_GROUP_SETTINGS, mode: 'mention' as const};
assert.equal(allowsGroupMessage(mention, {mentioned: true, followActive: false, listed: false, chanceHit: true}), true);
assert.equal(allowsGroupMessage(mention, {mentioned: false, followActive: true, listed: false, chanceHit: true}), true);
assert.equal(allowsGroupMessage(mention, {mentioned: false, followActive: false, listed: true, chanceHit: false}), true);
assert.equal(allowsGroupMessage(mention, {mentioned: false, followActive: false, listed: false, chanceHit: true}), false);

const full = {...DEFAULT_GROUP_SETTINGS, mode: 'full' as const};
assert.equal(allowsGroupMessage(full, {mentioned: false, followActive: false, listed: false, chanceHit: false}), true);

const rule = {...DEFAULT_GROUP_SETTINGS, mode: 'rule' as const};
assert.equal(allowsGroupMessage(rule, {mentioned: false, followActive: false, listed: false, chanceHit: true}), false);
assert.equal(allowsGroupMessage(rule, {mentioned: true, followActive: false, listed: false, chanceHit: false}), true);

const random = {...DEFAULT_GROUP_SETTINGS, mode: 'random' as const};
assert.equal(allowsGroupMessage(random, {mentioned: true, followActive: false, listed: false, chanceHit: false}), false);
assert.equal(allowsGroupMessage(random, {mentioned: false, followActive: false, listed: false, chanceHit: true}), true);
assert.equal(allowsGroupMessage(random, {mentioned: false, followActive: false, listed: true, chanceHit: false}), true);

const smart = {...DEFAULT_GROUP_SETTINGS, mode: 'smart' as const};
assert.equal(allowsGroupMessage(smart, {mentioned: true, followActive: false, listed: false, chanceHit: false}), true);
assert.equal(allowsGroupMessage(smart, {mentioned: false, followActive: false, listed: false, chanceHit: true}), true);
assert.equal(allowsGroupMessage(smart, {mentioned: false, followActive: false, listed: false, chanceHit: false}), false);

assert.equal(followUpApplies('random'), false);
assert.equal(followUpApplies('auto'), true);
assert.equal(followUpApplies('smart'), true);

const auto = {...DEFAULT_GROUP_SETTINGS, mode: 'auto' as const};
assert.equal(allowsGroupMessage(auto, {mentioned: false, followActive: false, listed: false, chanceHit: false}), true);

assert.equal(parseJoinAnswer('回'), true);
assert.equal(parseJoinAnswer('不回'), false);
assert.equal(parseJoinAnswer('不回。'), false);
assert.equal(parseJoinAnswer('<think>看看</think>\n回'), true);
assert.equal(parseJoinAnswer('回复一下'), null);
assert.equal(parseJoinAnswer(''), null);
assert.equal(rollChance(0, () => 0), false);
assert.equal(rollChance(15, () => 0.149), true);
assert.equal(rollChance(15, () => 0.15), false);

const listedSettings = normalizeSettings({userIds: ['wxid_A'], keywords: ['原神']});
assert.equal(matchesRuleUser(listedSettings, 'wxid_a'), true);
assert.equal(matchesKeyword(listedSettings, '今天原神呢'), true);
assert.equal(matchesKeyword(listedSettings, '崩铁'), false);

const message: IncomingMessage = {
    platform: 'golem',
    type: 'text',
    source: 'group',
    chatId: '123@chatroom',
    senderId: 'wxid_a',
    to: '123@chatroom',
    timestamp: 1,
    messageId: 'm1',
    content: '你好',
    raw: {},
};
assert.equal(isBotMentioned(message, '小聪明儿', 'bot'), false);
assert.equal(isBotMentioned({...message, content: '@小聪明儿 在吗'}, '小聪明儿', 'bot'), true);
assert.equal(isBotMentioned({...message, mentions: [{id: 'bot'}]}, '小聪明儿', 'bot'), true);
assert.equal(isBotMentioned({
    ...message,
    quote: {title: '嗯', referType: 1, referFrom: 'bot', referSenderName: '小聪明儿'},
}, '小聪明儿', 'bot'), true);

console.log('✓ group session policy');
