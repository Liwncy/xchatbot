import type {Env} from '../../types/env.js';
import {logger} from '../../utils/logger.js';
import {type AutoScope, DEFAULT_AUTO_SCOPES, parseAutoScopes} from '../peer-roster/auto-scope.js';
import {stripLeadAt} from '../peer-roster/collect.js';
import {assertPeerTargetAllowed, peerSave} from '../peer-roster/service.js';
import {normalizeShoutTemplate} from '../peer-roster/template.js';
import type {PeerShoutType} from '../peer-roster/types.js';
import type {MemoryMaterialRow} from './store.js';

/** 模型交回来的「谁会办什么事」，已经按证据把过一遍关。 */
export interface PeerCandidate {
    wxid: string;
    name: string;
    /** 线路名：必定是范围表里的某一项，不是模型起的名字。 */
    title: string;
    /** 具体的事：取范围表里的说明。 */
    about: string;
    /** 别人叫他办时说的原话，已经查到它真在这批聊天里出现过。 */
    shout: string;
    /** 以下三项：模型给了合格的 `{问}` 模板就用它，否则由 normalizeShoutTemplate 按原话算。 */
    type: PeerShoutType;
    template: string;
    example: string;
}

export interface ParsedPeers {
    peers: PeerCandidate[];
    /** 模型提了、但被代码挡掉的条数。试跑时看它，就知道门槛是不是太严。 */
    dropped: number;
}

/** 查证用的素材行，是整理时读出来的整段聊天（含图片、表情、音乐这类非文字）。 */
export type EvidenceRow = Pick<MemoryMaterialRow, 'senderId' | 'actorType' | 'msgType' | 'contentText'>;

const SHOUT_MAX = 32;
const PEER_CAP = 6;
const ASK = '{问}';
/** `发{问}表情` 这种后面还有字的模板，中间那段最多这么长；`music {问}` 这种 `{问}` 在最后的，可以长一点（歌名）。 */
const WRAP_INNER_MAX = 8;
const TRAIL_INNER_MAX = 20;
/** 被叫的人要在这句话之后的多少行之内回过话（任何类型：文字、歌、图、表情）。 */
const REPLY_WINDOW = 15;

/** 管理口令和带密钥的话，范围里写了也不收：收进花名册，模型和别的群友都看得到。 */
const FORBIDDEN = [
    /^[/／]\s*(pm|cm|ai|plugin|reload|config|set)\b/iu,
    /sk-[a-z0-9]/iu,
    /\b(api[_-]?key|token|secret|password)\b/iu,
    /密钥|口令是|密码/u,
];

function clean(value: unknown, max: number): string {
    return typeof value === 'string'
        ? Array.from(value.replace(/\s+/gu, ' ').trim()).slice(0, max).join('')
        : '';
}

function squash(text: string): string {
    return text.replace(/\s+/gu, ' ').trim().toLowerCase();
}

/** 接在整理提示词后面，只对群聊带，且范围不空才带。 */
export function peerRules(scopes: readonly AutoScope[]): string {
    const known = scopes.map((entry) => `${entry.title}（${entry.about}）`).join('；');
    return [
        '另外在 JSON 里加一个 peers 数组：{"peers":[{"id":"被叫去办事的人的id","title":"线路名","shout":"原话","template":"可省"}]}。',
        'peers 记的是「这个群里谁会办某类事」，以后有人想办这类事时可以把活甩给他。',
        `只认下面这些事，title 只能从这里选，括号里是说明：${known}。不在里面的事一概不收，哪怕看起来像口令。`,
        '只收有证据的：有人 @ 他，或者明说叫他办这类事（原话在聊天里能找到）。随口提、玩梗、演戏、斗嘴、剧情台词都不收。',
        '你看不到他回的图片、歌、表情，所以他有没有应不用你管，系统会另外核对；但他明显没接茬、或者别人在拿这件事开玩笑的，不要收。',
        'id 是被叫去办事的那个人，不是叫他的人，也不能是他自己叫自己。',
        'shout 写别人叫他办时的原话，一字不改，不要加引号或解释，不要自己编。',
        `template：原话里变的那一小段换成 ${ASK}，比如原话「发掌嘴表情」写「发${ASK}表情」，「点歌 晴天」写「点歌 ${ASK}」；整句固定不变的不用写。`,
        '一件事只挂一个人。几个人都会同一类事，只写最近一次办的那个人；如果都要写，按他们在聊天里出现的先后写，后出现的写在后面。',
        '身份是 bot 的行不要收。没有就给空数组，宁缺毋滥，一次最多 6 个。peers 只能使用「peers 可选的发言人 id」里的 id。',
    ].join('\n');
}

export function describePeerIds(rows: Array<{senderId: string; senderName: string; actorType: string}>): string {
    const names = new Map<string, string>();
    for (const row of rows) {
        const id = row.senderId.trim();
        if (!id || id === 'unknown' || row.actorType === 'bot') continue;
        const name = row.senderName.replace(/\s+/gu, ' ').trim();
        if (!names.has(id) || name) names.set(id, name || names.get(id) || '');
    }
    return [...names.entries()].map(([id, name]) => (name ? `${id}（${name}）` : id)).join('、');
}

export function peerIdSet(rows: Array<{senderId: string; actorType: string}>): Set<string> {
    const ids = new Set<string>();
    for (const row of rows) {
        const id = row.senderId.trim();
        if (id && id !== 'unknown' && row.actorType !== 'bot') ids.add(id);
    }
    return ids;
}

/**
 * 模型给的 `{问}` 模板能不能用：必须能还原成原话。
 * - `发{问}表情`：开头结尾都要对上，中间一小段（不超过 8 个字，不含空格和 @）；
 * - `点歌 {问}`：`{问}` 在最后，前面必须以空白结尾，中间可以长一点（歌名）。
 * 前面太短、太泛的（只有一个字、没有空白隔开）不收，不然「点{问}」会认下所有以「点」开头的话。
 * 不合格返回 undefined，调用方退回按原话自己算。
 */
export function fitTemplate(shout: string, template: string): {template: string; example: string} | undefined {
    const text = template.trim();
    const at = text.indexOf(ASK);
    if (at < 0 || text.indexOf(ASK, at + ASK.length) >= 0) return undefined;
    const head = text.slice(0, at);
    const tail = text.slice(at + ASK.length);
    if (!head.trim()) return undefined;
    if (!tail.trim() && !/\s$/u.test(head)) return undefined;
    const lower = shout.toLowerCase();
    if (shout.length < head.length + tail.length) return undefined;
    if (!lower.startsWith(head.toLowerCase()) || !lower.endsWith(tail.toLowerCase())) return undefined;
    const rawInner = shout.slice(head.length, shout.length - tail.length);
    const inner = rawInner.trim();
    const size = Array.from(inner).length;
    if (!size) return undefined;
    if (tail.trim()) {
        // 中间那段紧贴着前后两段，不带空白
        if (size > WRAP_INNER_MAX || /[\s@＠]/u.test(rawInner)) return undefined;
    } else if (size > TRAIL_INNER_MAX || /[@＠]/u.test(inner)) {
        return undefined;
    }
    return {
        template: `${shout.slice(0, head.length)}${ASK}${shout.slice(shout.length - tail.length)}`,
        example: inner,
    };
}

/**
 * 查证：原话真在这批聊天里被别人说过（不是他自己说的），他随后在 15 行之内回过话。
 * 模型靠不住：第一次在一个演戏的群里试，它把「记账」「盯人」这种剧情台词当成了本事。
 * 编出来的原话查不到，没人应的也过不了。
 */
export function hasEvidence(shout: string, targetId: string, material: readonly EvidenceRow[]): boolean {
    const needle = squash(shout);
    if (!needle) return false;
    for (let index = 0; index < material.length; index += 1) {
        const row = material[index];
        if (row.msgType !== 'text' || row.actorType === 'bot') continue;
        const sender = row.senderId.trim();
        if (!sender || sender === 'unknown' || sender === targetId) continue;
        if (!squash(stripLeadAt(row.contentText)).includes(needle)) continue;
        const end = Math.min(material.length, index + 1 + REPLY_WINDOW);
        for (let next = index + 1; next < end; next += 1) {
            const reply = material[next];
            if (reply.senderId.trim() === targetId && reply.actorType !== 'bot') return true;
        }
    }
    return false;
}

/**
 * 模型说「谁、哪一类、原话」，代码把关：
 * 线路名必须在范围表里（不让模型自己起名）；人必须在场，机器人和主人不收；原话要查得到、他要应过；
 * 管理口令和密钥不收；模板要能还原原话。
 *
 * 一件事只挂一个人，所以同一个 title（不管几个人）只留最后一条：提示词要求模型按聊天里出现的先后写，
 * 后写的就是后出现的。后来者挪到队尾，写库时也是它最后落下，和跨次整理「新的覆盖旧的」一致。
 */
export function parseModelPeers(
    env: Env,
    platform: string,
    raw: Record<string, unknown>,
    allowedIds: ReadonlySet<string>,
    names: ReadonlyMap<string, string>,
    scopes: readonly AutoScope[],
    material: readonly EvidenceRow[],
): ParsedPeers {
    if (!Array.isArray(raw.peers)) return {peers: [], dropped: 0};
    const byTitle = new Map<string, PeerCandidate>();
    let dropped = 0;
    for (const entry of raw.peers) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            dropped += 1;
            continue;
        }
        const item = entry as Record<string, unknown>;
        const wxid = clean(item.id, 80);
        const wanted = clean(item.title, 40).toLowerCase();
        const scope = scopes.find((candidate) => candidate.title.toLowerCase() === wanted);
        const shout = stripLeadAt(clean(item.shout, SHOUT_MAX + 16)).trim();
        const template = clean(item.template, 40);
        const name = names.get(wxid) ?? '';
        let reason = '';
        if (!wxid || !allowedIds.has(wxid)) reason = '人不在场';
        else if (!scope) reason = '不在范围里';
        else if (!shout || Array.from(shout).length > SHOUT_MAX) reason = '原话不合格';
        else if (FORBIDDEN.some((pattern) => pattern.test(shout) || pattern.test(template))) reason = '管理口令或密钥';
        else if (assertPeerTargetAllowed(env, platform, wxid, name)) reason = '机器人或主人';
        else if (!hasEvidence(shout, wxid, material)) reason = '查不到原话或他没应';
        const key = scope?.title.toLowerCase() ?? '';
        if (!reason && !byTitle.has(key) && byTitle.size >= PEER_CAP) reason = '超过上限';
        if (reason || !scope) {
            dropped += 1;
            // 攒着看：常被挡掉的，要么是范围该补，要么是门槛太严
            if (shout) logger.info('花名册没收', {platform, title: item.title, shout, reason});
            continue;
        }
        if (byTitle.has(key)) {
            dropped += 1;
            byTitle.delete(key);
        }
        const fit = template ? fitTemplate(shout, template) : undefined;
        const shape = fit
            ? {type: 'param' as const, template: fit.template, example: fit.example}
            : normalizeShoutTemplate(shout);
        byTitle.set(key, {wxid, name, title: scope.title, about: scope.about, shout, ...shape});
    }
    return {peers: [...byTitle.values()], dropped};
}

/** 写进花名册（source=auto）。一条失败不影响别的，也不影响记忆卡。 */
export async function savePeerCandidates(
    env: Env,
    platform: string,
    scope: string,
    candidates: PeerCandidate[],
): Promise<number> {
    let saved = 0;
    for (const item of candidates) {
        try {
            await peerSave(env, {
                scope,
                wxid: item.wxid,
                name: item.name || item.wxid,
                title: item.title,
                about: item.about,
                template: item.template,
                platform,
                source: 'auto',
            });
            saved += 1;
        } catch (error) {
            logger.warn('花名册自动整理没写成一条', {
                scope,
                wxid: item.wxid,
                title: item.title,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return saved;
}

function check(condition: boolean, label: string): void {
    if (!condition) throw new Error(`peers self-check 失败：${label}`);
}

function line(senderId: string, text: string, msgType = 'text', actorType = 'member'): EvidenceRow {
    return {senderId, actorType, msgType, contentText: text};
}

/** 编的几组：真口令、没人应、编造的、演戏台词、范围外、管理口令、机器人和主人、不在场的人、模板对不上、窗口、坏的配置。 */
export function runPeerSelfCheck(): void {
    const env = {BOT_WECHAT_ID: 'wxid_bot', BOT_OWNER_ID: 'wxid_owner'} as unknown as Env;
    const allowed = new Set(['wxid_a', 'wxid_b', 'wxid_c', 'wxid_owner']);
    const names = new Map([['wxid_a', '阿火'], ['wxid_b', '小乙'], ['wxid_c', '丙'], ['wxid_owner', '李芈仙']]);
    const scopes = DEFAULT_AUTO_SCOPES;
    const parse = (
        peers: unknown[],
        material: readonly EvidenceRow[],
        table: readonly AutoScope[] = scopes,
    ) => parseModelPeers(env, 'golem', {peers}, allowed, names, table, material);

    // 一段聊天：丙叫阿火点歌，阿火回了张音乐卡；丙叫阿火发表情，阿火回了表情；小乙叫词云但没人应
    const chat: EvidenceRow[] = [
        line('wxid_c', '@阿火 点歌 老鼠爱大米'),
        line('wxid_a', '[音乐]', 'music'),
        line('wxid_c', '@阿火 发掌嘴表情'),
        line('wxid_a', '[表情]', 'emoji'),
        line('wxid_b', '词云 本周'),
        line('wxid_c', '哈哈'),
        line('wxid_owner', '你个糟老头子又来了啊'),
        line('wxid_a', '记账！'),
        line('wxid_c', '@阿火 /pm reload farm'),
        line('wxid_a', 'ok'),
    ];

    // 有人叫、他应了：收；title 取范围表里的写法，about 取表里的说明
    const good = parse([
        {id: 'wxid_a', title: '点歌', shout: '@阿火 点歌 老鼠爱大米', template: '点歌 {问}'},
    ], chat);
    check(good.peers.length === 1 && good.dropped === 0, '真口令收一条');
    check(good.peers[0].title === '点歌' && good.peers[0].about === scopes[0].about, 'title 和 about 取范围表的');
    check(good.peers[0].type === 'param' && good.peers[0].template === '点歌 {问}', '带空口令收成带参');
    check(good.peers[0].example === '老鼠爱大米' && good.peers[0].shout === '点歌 老鼠爱大米', '例子保留，开头的 @ 去掉');
    check(parse([{id: 'wxid_a', title: ' 点歌 ', shout: '点歌 老鼠爱大米'}], chat).peers.length === 1, 'title 前后空白不碍事');
    check(parse([{id: 'wxid_a', title: 'ＤＩＹ', shout: '点歌 老鼠爱大米'}], chat).dropped === 1, '范围外的 title');

    // 夹心模板：发掌嘴表情 → 发{问}表情
    const wrap = parse([{id: 'wxid_a', title: '发表情', shout: '发掌嘴表情', template: '发{问}表情'}], chat);
    check(wrap.peers[0]?.type === 'param' && wrap.peers[0].template === '发{问}表情' && wrap.peers[0].example === '掌嘴', '夹心模板收成带参，留 {问}');
    check(parse([{id: 'wxid_a', title: '发表情', shout: '发掌嘴表情'}], chat).peers[0]?.type === 'fixed', '没给模板就照念');
    check(parse([{id: 'wxid_a', title: '发表情', shout: '发掌嘴表情', template: '点{问}情'}], chat).peers[0]?.type === 'fixed', '模板还原不了原话，退回按原话算');

    // 查证：编的、没人应的、他自己说的
    check(parse([{id: 'wxid_a', title: '点歌', shout: '点歌 周杰伦'}], chat).dropped === 1, '编造的原话挡掉');
    check(parse([{id: 'wxid_b', title: '词云', shout: '词云 本周'}], chat).peers.length === 0, '没人应的挡掉');
    check(parse([{id: 'wxid_c', title: '点歌', shout: '点歌 老鼠爱大米'}], chat).dropped === 1, '原话是他自己说的，不算');
    check(parse([{id: 'wxid_a', title: '点歌', shout: '记账！'}], chat).dropped === 1, '剧情台词挡掉');
    check(parse([{id: 'wxid_a', title: '点歌', shout: '/pm reload farm'}], chat).dropped === 1, '管理口令挡掉');
    check(parse([{id: 'wxid_a', title: '点歌', shout: '点歌 老鼠爱大米', template: 'sk-abc {问}'}], chat).dropped === 1, '模板带密钥挡掉');
    check(parse([{id: 'wxid_a', title: '点歌', shout: '点歌 老鼠爱大米'}], [line('wxid_c', '点歌 老鼠爱大米')]).dropped === 1, '没有任何回应');
    const far: EvidenceRow[] = [line('wxid_c', '点歌 老鼠爱大米')];
    for (let index = 0; index < 20; index += 1) far.push(line('wxid_b', `闲聊${index}`));
    far.push(line('wxid_a', '[音乐]', 'music'));
    check(parse([{id: 'wxid_a', title: '点歌', shout: '点歌 老鼠爱大米'}], far).dropped === 1, '隔得太远的回应不算');
    check(parse([{id: 'wxid_a', title: '点歌', shout: '点歌 老鼠爱大米'}], [
        line('wxid_c', '点歌 老鼠爱大米'), line('wxid_a', '收到', 'text', 'bot'),
    ]).dropped === 1, '机器人行不算他应的');

    // 人：机器人、主人、不在场、缺字段
    const withOthers: EvidenceRow[] = [
        line('wxid_c', '点歌 主人'), line('wxid_owner', '好'),
        line('wxid_c', '点歌 自己'), line('wxid_bot', '好', 'text', 'bot'),
        line('wxid_c', '点歌 幽灵'), line('wxid_ghost', '好'),
    ];
    const blocked = parse([
        {id: 'wxid_owner', title: '点歌', shout: '点歌 主人'},
        {id: 'wxid_bot', title: '点歌', shout: '点歌 自己'},
        {id: 'wxid_ghost', title: '点歌', shout: '点歌 幽灵'},
        {title: '点歌', shout: '点歌 幽灵'},
        'junk',
    ], withOthers);
    check(blocked.peers.length === 0 && blocked.dropped === 5, `主人、机器人、不在场、缺 id、坏条目都不收，实际 ${blocked.dropped}`);

    // 一件事只挂一个人：同一个 title 后写的覆盖先写的；被挡掉的不能靠排在后面把别人挤掉
    const both: EvidenceRow[] = [
        line('wxid_c', '点歌 稻香'), line('wxid_a', '[音乐]', 'music'),
        line('wxid_c', '点歌 晴天'), line('wxid_b', '[音乐]', 'music'),
    ];
    const two = parse([
        {id: 'wxid_a', title: '点歌', shout: '点歌 稻香'},
        {id: 'wxid_b', title: '点歌', shout: '点歌 晴天'},
    ], both);
    check(two.peers.length === 1 && two.peers[0].wxid === 'wxid_b', '不同人同一件事，后写的覆盖先写的');
    const guard = parse([
        {id: 'wxid_a', title: '点歌', shout: '点歌 稻香'},
        {id: 'wxid_owner', title: '点歌', shout: '点歌 主人'},
    ], [...both, ...withOthers]);
    check(guard.peers.length === 1 && guard.peers[0].wxid === 'wxid_a', '被挡掉的不能挤掉别人');

    // 一次最多 6 件事
    const wide: AutoScope[] = Array.from({length: 8}, (_, index) => ({title: `事${index}`, about: `办事${index}`}));
    const wideChat: EvidenceRow[] = [];
    for (const entry of wide) {
        wideChat.push(line('wxid_c', `${entry.title} 参`), line('wxid_a', '好'));
    }
    check(
        parse(wide.map((entry) => ({id: 'wxid_a', title: entry.title, shout: `${entry.title} 参`})), wideChat, wide).peers.length
            === PEER_CAP,
        '一次最多 6 个',
    );

    // 模板还原
    check(fitTemplate('发掌嘴表情', '发{问}表情')?.example === '掌嘴', '夹心还原');
    check(fitTemplate('发了一大堆乱七八糟的表情', '发{问}表情') === undefined, '夹心中间太长不收');
    check(fitTemplate('发 掌嘴 表情', '发{问}表情') === undefined, '夹心中间有空格不收');
    check(fitTemplate('点歌 老鼠爱大米', '点歌 {问}')?.template === '点歌 {问}', '空白隔开的尾部 {问}');
    check(fitTemplate('点歌手好听', '点{问}') === undefined, '没有空白隔开的尾部 {问} 不收');
    check(fitTemplate('点歌 a', '{问}') === undefined, '只有 {问} 不收');
    check(fitTemplate('点歌 a', 'x{问}y{问}') === undefined, '两个 {问} 不收');

    // 提示词和字段
    check(parseModelPeers(env, 'golem', {}, allowed, names, scopes, chat).peers.length === 0, '没有 peers 字段不报错');
    check(parseModelPeers(env, 'golem', {peers: 'x'}, allowed, names, scopes, chat).dropped === 0, 'peers 不是数组不报错');
    check(peerRules(scopes).includes('点歌（点歌、放歌曲'), '提示词里列出范围和说明');

    // 范围表的读取：合法、空、坏的
    check(parseAutoScopes('[{"title":"天气","about":"查天气"},{"title":"天气"}]')?.length === 1, '重复的 title 只留第一个');
    check(parseAutoScopes('[{"title":"天气"}]')?.[0].about === '天气', 'about 省了用 title');
    check(parseAutoScopes('[]')?.length === 0, '空数组合法，表示一个都不自动收');
    check(parseAutoScopes('not json') === null, '不是 JSON');
    check(parseAutoScopes('{"title":"x"}') === null, '不是数组');
    check(parseAutoScopes('[{"title":""},{"about":"x"}]') === null, '一条合法的都没有就当坏的');
    check(parseAutoScopes('[{"title":"x"},"junk"]')?.length === 1, '坏条目跳过，好的留下');
}
