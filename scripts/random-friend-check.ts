import assert from 'node:assert/strict';
import type {DirectoryPerson} from '../src/adapter/types.ts';
import {extractMarkedCommand} from '../src/core/command-mark.ts';
import {buildRandomFriendCard, buildProfileSummary} from '../src/plugins/channel/random-friend/card.ts';
import {
    evaluateCandidateQuality,
    generateRandomPhone,
    isRandomFriendCommand,
    pickRandomFriendCandidate,
    searchRandomFriend,
} from '../src/plugins/channel/random-friend/finder.ts';

assert.equal(isRandomFriendCommand('蕉个朋友'), true);
assert.equal(isRandomFriendCommand('帮我捞个好友呗'), true);
assert.equal(isRandomFriendCommand('今天天气'), false);
assert.equal(isRandomFriendCommand('#查记录'), false);
assert.equal(extractMarkedCommand('蕉个朋友'), null);
assert.equal(extractMarkedCommand('#蕉个朋友'), '蕉个朋友');
assert.equal(extractMarkedCommand('＃捞个好友'), '捞个好友');
assert.ok(isRandomFriendCommand(extractMarkedCommand('#蕉个朋友') ?? ''));

{
    const phone = generateRandomPhone();
    assert.match(phone, /^1\d{10}$/u);
}

const good: DirectoryPerson = {
    id: 'wxid_abc@stranger',
    nickname: '路过的猫',
    alias: 'catwalk',
    avatarUrl: 'https://example.com/a.jpg',
    region: '中国 / 浙江 / 杭州',
    sign: '随便看看',
    gender: 2,
    verified: false,
    cardReady: true,
};

assert.equal(evaluateCandidateQuality(good).passed, true);
assert.equal(evaluateCandidateQuality({...good, id: '123@chatroom'}).passed, false);
assert.ok(evaluateCandidateQuality({...good, nickname: '13800138000'}).reasons.includes('昵称像占位标识'));
assert.equal(evaluateCandidateQuality({
    ...good,
    nickname: '13800138000',
    alias: undefined,
    sign: undefined,
    region: undefined,
    avatarUrl: undefined,
    cardReady: false,
}).passed, false);

assert.equal(pickRandomFriendCandidate([{id: 'wxid_abc@stranger', nickname: '路过的猫'}]), null);
assert.equal(pickRandomFriendCandidate([good])?.nickname, '路过的猫');

{
    const summary = buildProfileSummary(good, '13800138000');
    assert.match(summary, /路过的猫/);
    assert.match(summary, /13800138000/);
    const card = buildRandomFriendCard(good, '13800138000', 1_700_000_000_000, '小聪明儿');
    assert.equal(card.type, 'chat-record');
    assert.equal(card.title, '💘 月老小纸条');
    assert.equal(card.items[1]?.nickname, '路过的猫');
}

void searchRandomFriend(async () => []).then((hit) => {
    assert.equal(hit.candidate, null);
    assert.equal(hit.attempts, 12);
    console.log('✓ random-friend');
});
