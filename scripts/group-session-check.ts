import assert from 'node:assert/strict';
import type {IncomingMessage} from '../src/core/message.ts';
import {isBotMentioned} from '../src/plugins/channel/session/mention.ts';
import {
    allowsGroupMessage,
    DEFAULT_GROUP_SETTINGS,
    DEFAULT_REPLY_CHANCE,
    followUpApplies,
    matchesKeyword,
    matchesRuleUser,
    modeLabel,
    normalizeSettings,
    parseGroupCommand,
    parseMode,
    rollChance,
} from '../src/plugins/channel/session/policy.ts';
import {RANDOM_REPLY_STAMP, stampRandomPrompt} from '../src/plugins/channel/session/index.ts';

assert.equal(parseMode('点名'), 'mention');
assert.equal(parseMode('MENTION'), 'mention');
assert.equal(parseMode('智能模式'), 'smart');
assert.equal(parseMode('nope'), null);
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
assert.deepEqual(parseGroupCommand('随机模式'), {kind: 'set-mode', mode: 'random'});
assert.deepEqual(parseGroupCommand('模式 随机 20'), {kind: 'set-chance', percent: 20});
assert.deepEqual(parseGroupCommand('概率 8%'), {kind: 'set-chance', percent: 8});
assert.deepEqual(parseGroupCommand('随机 100'), {kind: 'set-chance', percent: 100});
assert.deepEqual(parseGroupCommand('跟聊 60'), {kind: 'set-follow', seconds: 60});
assert.deepEqual(parseGroupCommand('跟聊开'), {kind: 'set-follow', seconds: 60});
assert.deepEqual(parseGroupCommand('跟聊关'), {kind: 'set-follow', seconds: 0});
assert.deepEqual(parseGroupCommand('规则 用户 wxid_a，wxid_b'), {
    kind: 'set-users',
    userIds: ['wxid_a', 'wxid_b'],
});
assert.deepEqual(parseGroupCommand('规则 关键词 原神 崩铁'), {
    kind: 'set-keywords',
    keywords: ['原神', '崩铁'],
});
assert.deepEqual(parseGroupCommand('规则 清空'), {kind: 'clear-rule'});
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
assert.equal(followUpApplies('smart'), true);
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
    from: 'wxid_a',
    to: '123@chatroom',
    timestamp: 1,
    messageId: 'm1',
    content: '你好',
    room: {id: '123@chatroom'},
    raw: {},
};
assert.equal(isBotMentioned(message, '小聪明儿', 'bot'), false);
assert.equal(isBotMentioned({...message, content: '@小聪明儿 在吗'}, '小聪明儿', 'bot'), true);
assert.equal(isBotMentioned({...message, mentions: [{id: 'bot'}]}, '小聪明儿', 'bot'), true);
assert.equal(isBotMentioned({
    ...message,
    quote: {title: '嗯', referType: 1, referFrom: 'bot', referSenderName: '小聪明儿'},
}, '小聪明儿', 'bot'), true);

stampRandomPrompt(message);
assert.equal(message.content, `${RANDOM_REPLY_STAMP}\n你好`);
stampRandomPrompt(message);
assert.equal(message.content, `${RANDOM_REPLY_STAMP}\n你好`);

console.log('✓ group session policy');
