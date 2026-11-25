import assert from 'node:assert/strict';
import {
    CAMPS,
    CLASSES,
    FALLBACK_CAMP,
    FALLBACK_CLASS,
    FALLBACK_TITLE,
    rarityOf,
    textLength,
} from '../../src/core/member-card/lexicon.ts';
import type {CardRow} from '../../src/core/member-card/material.ts';
import {CARD_SYSTEM, buildCardPrompt, collectTexts, parseCardText} from '../../src/core/member-card/model.ts';
import {renderMemberCard} from '../../src/core/member-card/render.ts';
import {bar, computeStats, rankStars, stepStars} from '../../src/core/member-card/stats.ts';

// ── 名单：名字都是 4 个字，不重复 ───────────────────────────
for (const item of [...CLASSES, ...CAMPS]) assert.equal(textLength(item.name), 4, `名单项要 4 个字：${item.name}`);
assert.equal(new Set(CLASSES.map((item) => item.name)).size, CLASSES.length);
assert.equal(new Set(CAMPS.map((item) => item.name)).size, CAMPS.length);
assert.ok(CLASSES.some((item) => item.name === FALLBACK_CLASS));
assert.ok(CAMPS.some((item) => item.name === FALLBACK_CAMP));
assert.equal(textLength(FALLBACK_TITLE), 6);

// ── 星数 ────────────────────────────────────────────────────
assert.equal(stepStars(0, [0.2, 0.4, 0.6, 0.8]), 1);
assert.equal(stepStars(0.2, [0.2, 0.4, 0.6, 0.8]), 2);
assert.equal(stepStars(0.79, [0.2, 0.4, 0.6, 0.8]), 4);
assert.equal(stepStars(1, [0.2, 0.4, 0.6, 0.8]), 5);
assert.equal(rankStars(10, [1, 5, 10]), 5);
assert.equal(rankStars(1, [1, 5, 10]), 1);
assert.equal(rankStars(5, [1, 5, 10]), 3);
assert.equal(rankStars(10, [10, 1]), 3, '人不到 3 个比不出来');
assert.equal(bar(3), '▰▰▰▱▱');
assert.equal(bar(0), '▱▱▱▱▱');
assert.equal(bar(9), '▰▰▰▰▰');
assert.equal(rarityOf(30), 'SSR');
assert.equal(rarityOf(25), 'SSR');
assert.equal(rarityOf(24), 'SR');
assert.equal(rarityOf(19), 'SR');
assert.equal(rarityOf(13), 'R');
assert.equal(rarityOf(12), 'N');

// ── 统计 ────────────────────────────────────────────────────
// 东八区 11 月 20 日 0 点
const DAY0 = Date.UTC(2026, 10, 20, 0, 0, 0) / 1000 - 8 * 3600;
let seq = 0;
function row(sender: string, text: string, day: number, hour: number, extra: Partial<CardRow> = {}): CardRow {
    seq += 1;
    return {
        messageId: `m${seq}`,
        senderId: sender,
        senderName: sender === 'wxid_a' ? '小满' : sender === 'wxid_b' ? '小王' : sender === 'wxid_c' ? '老李' : '机器人',
        actorType: sender === 'bot' ? 'bot' : 'member',
        msgType: 'text',
        text,
        createdAt: DAY0 + day * 86400 + hour * 3600 + 60,
        referMessageId: '',
        mentionIds: [],
        mentionNames: new Map(),
        ...extra,
    };
}

const aRows: CardRow[] = [];
for (let index = 0; index < 8; index += 1) aRows.push(row('wxid_a', `哈哈哈哈确实${index}`, index % 2, 23));
aRows.push(row('wxid_a', '[表情]', 0, 23, {msgType: 'emoji'}));
aRows.push(row('wxid_a', '[图片]', 1, 23, {msgType: 'image'}));
aRows.push(row('wxid_a', '#点歌 晴天', 1, 23));
aRows.push(row('wxid_a', '我家也这样', 0, 22));
const all: CardRow[] = [...aRows];
// 小王回复小满 4 回，小满 @ 小王 0 回
for (let index = 0; index < 4; index += 1) {
    all.push(row('wxid_b', `回你${index}`, 0, 12, {referMessageId: aRows[index].messageId}));
}
// 老李 @ 小满 1 回，不够羁绊
all.push(row('wxid_c', '在吗', 2, 12, {mentionIds: ['wxid_a']}));
// 机器人 @ 小满：不算人气，也不是羁绊
for (let index = 0; index < 5; index += 1) {
    all.push(row('bot', '好的', 0, 12, {mentionIds: ['wxid_a'], referMessageId: aRows[index].messageId}));
}
all.push(row('wxid_c', '第三天冒个泡', 2, 13));
all.sort((left, right) => left.createdAt - right.createdAt);

const botIds = new Set(['bot']);
const stats = computeStats(all, 'wxid_a', botIds);
assert.equal(stats.rows, aRows.length);
assert.equal(stats.textRows, 9, '口令不算文字：8 句哈哈 + 1 句我家也这样');
assert.equal(stats.botCalls, 1);
assert.ok(Math.abs(stats.imageShare - 2 / aRows.length) < 1e-9, `图片表情占比：${stats.imageShare}`);
assert.ok(stats.nightShare > 0.8, `深夜占比：${stats.nightShare}`);
assert.equal(stats.stars.熬夜, 5);
assert.equal(stats.activeDays, 2);
assert.equal(stats.groupDays, 3);
assert.ok(Math.abs(stats.attendance - 2 / 3) < 1e-9);
assert.equal(stats.stars.鸽王, 2);
assert.equal(stats.peakHour, 23);
assert.equal(stats.speakers, 3, '机器人不算发言人');
assert.deepEqual(stats.bonds.map((bond) => [bond.id, bond.count]), [['wxid_b', 4]], '老李只来往 1 回，机器人不算');
assert.equal(stats.bonds[0].name, '小王');
assert.equal(stats.starSum, Object.values(stats.stars).reduce((sum, value) => sum + value, 0));
assert.equal(stats.rarity, rarityOf(stats.starSum));
for (const value of Object.values(stats.stars)) assert.ok(value >= 1 && value <= 5);

// 他一句没说：不抛，条数为 0
assert.equal(computeStats(all, 'wxid_zzz', botIds).rows, 0);

// ── 材料 ────────────────────────────────────────────────────
const texts = collectTexts(all, 'wxid_a', botIds);
assert.ok(texts.hisTexts.includes('我家也这样'));
assert.ok(!texts.hisTexts.some((text) => text.startsWith('#')), '口令不进台词素材');
assert.ok(!texts.allTexts.includes('好的'), '机器人的话不进素材');
assert.ok(texts.allTexts.includes('回你0'));

const prompt = buildCardPrompt('小满', stats, all, 'wxid_a', botIds);
assert.ok(prompt.includes('★他\t我家也这样'));
assert.ok(prompt.includes('小王\t回你0'));
assert.ok(!prompt.includes('好的'));
assert.ok(prompt.includes('wxid_b'), '伙伴 id 要给模型，羁绊名才对得上');
assert.ok(CARD_SYSTEM.includes('气氛辅助') && CARD_SYSTEM.includes('深夜守群'));

// ── 模型输出的检查 ──────────────────────────────────────────
const check = {
    hisTexts: ['哈哈哈哈确实', '我家也这样', '看这个 https://x.com/a', '我的 token 是 abc'],
    allTexts: ['哈哈哈哈确实', '我家也这样', '一张猫图终结了争论', '回你0'],
    partnerIds: new Set(['wxid_b']),
};
const good = {
    title: '育儿气氛组长',
    class: '气氛辅助',
    camp: '深夜守群',
    blurb: '白天潜水，20 点准时上线',
    skills: [
        {name: '表情终结', text: '一张图终结争论'},
        {name: '深夜陪聊', text: '22 点后回复变多'},
        {name: '潜水回能', text: '白天沉默晚上营业'},
        {name: '第四个技能', text: '会被丢掉'},
    ],
    bonds: {wxid_b: '互怼搭子', wxid_x: '陌生人啊', wxid_y: '太长的羁绊名'},
    highlight: {text: '一张猫图终结争论', quote: '一张猫图终结了争论'},
    quotes: ['“哈哈哈哈确实”', '我家也这样', '回你0', '看这个 https://x.com/a', '我的 token 是 abc', '哈哈哈哈确实'],
    weak: '偶尔鸽',
    role: '气氛组',
};
{
    const {card, problems} = parseCardText(good, check);
    assert.deepEqual(problems, []);
    assert.equal(card.title, '育儿气氛组长');
    assert.equal(card.cls, '气氛辅助');
    assert.equal(card.camp, '深夜守群');
    assert.equal(card.skills.length, 3, '最多 3 个技能');
    assert.deepEqual([...card.bonds.entries()], [['wxid_b', '互怼搭子']], '不在伙伴里的、不是 4 个字的不收');
    assert.equal(card.highlight, '一张猫图终结争论');
    assert.deepEqual(card.quotes, ['哈哈哈哈确实', '我家也这样'], '台词要在他自己的话里，去重，去引号，最多 2 句');
}
{
    const quotes = parseCardText({...good, quotes: ['回你0', '看这个 https://x.com/a', '我的 token 是 abc', '没说过的话']}, check).card.quotes;
    assert.deepEqual(quotes, [], '别人说的、带链接的、带密钥字样的、编的，都不收');
}
{
    const {card, problems} = parseCardText({...good, title: '五个字称号'}, check);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /title/u);
    assert.equal(card.title, FALLBACK_TITLE);
}
{
    const {card, problems} = parseCardText({...good, class: '剑圣', camp: '随便'}, check);
    assert.equal(problems.length, 2);
    assert.equal(card.cls, FALLBACK_CLASS);
    assert.equal(card.camp, FALLBACK_CAMP);
}
{
    const {card} = parseCardText({...good, highlight: {text: '一张猫图终结争论', quote: '编出来的一句原话'}}, check);
    assert.equal(card.highlight, '', '高光查不到出处就去掉');
    const short = parseCardText({...good, highlight: {text: '一张猫图终结争论', quote: '猫图'}}, check).card;
    assert.equal(short.highlight, '', '原话太短不算出处');
}
{
    const {card} = parseCardText({
        ...good,
        skills: [{name: '五个字技能名', text: '字数不对'}, {name: '表情终结', text: '这一句说明超过了十五个字所以不要'}],
        weak: '这个弱点写得实在是太长太长太长太长太长太长了',
    }, check);
    assert.deepEqual(card.skills, [], '技能名、说明字数不对的整条丢掉');
    assert.equal(card.weak, '', '超长的栏目去掉，不截断');
}
{
    const {card, problems} = parseCardText({}, check);
    assert.equal(problems.length, 3, '空输出：称号、职业、阵营三项都有问题');
    assert.equal(card.title, FALLBACK_TITLE);
    assert.deepEqual(card.skills, []);
}

// ── 渲染 ────────────────────────────────────────────────────
{
    const {card} = parseCardText(good, check);
    const text = renderMemberCard('小满', stats, card);
    const lines = text.split('\n');
    assert.equal(lines[0], '🎴【群友角色卡】小满');
    assert.equal(lines[1], '称号：育儿气氛组长');
    assert.equal(lines[2], `${stats.rarity}｜气氛辅助｜深夜守群`);
    assert.ok(text.includes('技能\n· 表情终结：一张图终结争论'));
    assert.ok(text.includes('羁绊\n@小王 互怼搭子，来往 4 回'));
    assert.ok(text.includes('高光：一张猫图终结争论'));
    assert.ok(text.includes('台词：“哈哈哈哈确实”　“我家也这样”'));
    assert.ok(text.includes('弱点：偶尔鸽'));
    assert.ok(text.includes('定位：气氛组'));
    assert.equal(lines.filter((line) => /▰|▱/u.test(line)).length, 3, '六项两列三行');
    assert.ok(lines.length <= 24, `卡不要太长：${lines.length} 行`);
}
{
    const bare = parseCardText({title: '育儿气氛组长', class: '气氛辅助', camp: '深夜守群'}, check).card;
    const text = renderMemberCard('小满', {...stats, bonds: []}, bare);
    for (const label of ['技能', '羁绊', '高光', '台词', '弱点', '定位']) {
        assert.ok(!text.includes(label), `没内容的栏目整行不出现：${label}`);
    }
    const unnamed = renderMemberCard('小满', stats, bare);
    assert.ok(unnamed.includes('@小王 常来常往，来往 4 回'), '羁绊没起名用备用名');
}

console.log('member-card-check ok');
