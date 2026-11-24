/**
 * 记忆卡的纯逻辑：合并、变淡、渲染。不碰数据库，也不调模型。
 *
 * 分工：模型只说「新冒出来什么、归哪一类、该记多久（1-3）、哪几条又被提到」；
 * 重要度怎么算、淡多快、钉不钉、满了丢谁，都在这里按固定公式算。
 * 公式和数字照 SurfCore 的 `targetClarity` 搬过来，没有自己发明。
 */

export type MemoryClarity = 'clear' | 'fuzzy' | 'trace';
export type MemoryLayer = 'room' | 'person';

export interface MemoryItem {
    id: string;
    kind: string;
    text: string;
    /** 只有「第一次认识」钉住，永远在。别的都按分数淡。 */
    pin: boolean;
    clarity: MemoryClarity;
    /** 记下它的那一刻。 */
    createdAt: number;
    /** 最后一次在聊天里被提到。 */
    lastSeen: number;
    /** 1-100，创建时一次算好，之后不变。 */
    importance: number;
    /** 被提到过几次。 */
    recallCount: number;
    /** 上次整理时算出的保留分，只用来排序。 */
    retention: number;
}

export interface RawMemoryItem {
    id?: string;
    kind?: string;
    text?: string;
    /** 模型给的 1-3：该记多久。 */
    weight?: number;
}

const ROOM_KINDS = new Set(['promise', 'bit', 'fact']);
const PERSON_KINDS = new Set(['person', 'promise', 'first', 'preference']);

export const ROOM_CHAR_BUDGET = 1400;
export const PERSON_CHAR_BUDGET = 600;
export const ROOM_ITEM_CAP = 30;
export const PERSON_ITEM_CAP = 12;

/** 下面这些数照 SurfCore 的默认值。要调淡得快慢，改这里。 */
export const FADE = {
    /** 最近这几天的事，至少是「清楚」。 */
    recentDays: 7,
    /** 记下后这几天不扣年龄分。 */
    fuzzyAfterDays: 7,
    /** 超过这么多天、重要度低于 50、又不是主人的重要条目，直接忘掉。 */
    forgetAfterDays: 60,
    /** 主人那张卡里，重要度到这个值的条目，最差也是「清楚」。 */
    minOwnerImportance: 65,
} as const;

/** 模型的 1-3 换成起点分。封在 60 以内：再高必须靠下面这些代码认得出的信号。 */
const WEIGHT_BASE: Record<number, number> = {1: 20, 2: 40, 3: 60};
const PROMISE_BONUS = 16;
const OWNER_BONUS = 32;
const TEXT_CAP = 40;
const DAY_SECONDS = 86400;

export function clipChars(text: string, max: number): string {
    return Array.from(text.replace(/\s+/gu, ' ').trim()).slice(0, max).join('');
}

export function allowsKind(layer: MemoryLayer, kind: string): boolean {
    return (layer === 'room' ? ROOM_KINDS : PERSON_KINDS).has(kind);
}

/** 这张卡是不是主人在这个聊天里的卡。 */
function isOwnerCard(layer: MemoryLayer, subject: string, ownerId: string): boolean {
    return layer === 'person' && Boolean(ownerId) && subject === ownerId;
}

/** 钉住只看种类，模型说什么都不改。 */
export function pinned(layer: MemoryLayer, kind: string): boolean {
    return layer === 'person' && kind === 'first';
}

export function normalizeWeight(value: unknown): number {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return 1; // 没写或写歪了，按最不重要的算
    return Math.max(1, Math.min(3, n));
}

/** 一条新条目的起点分：模型的 1-3 加上代码认得出的信号。 */
export function startImportance(
    layer: MemoryLayer,
    subject: string,
    ownerId: string,
    kind: string,
    weight: number,
): number {
    let value = WEIGHT_BASE[normalizeWeight(weight)];
    if (kind === 'promise') value += PROMISE_BONUS;
    if (isOwnerCard(layer, subject, ownerId)) value += OWNER_BONUS;
    return Math.max(1, Math.min(100, value));
}

function shortId(seed: string): string {
    let hash = 5381;
    for (const char of seed) hash = Math.imul(hash, 33) ^ char.charCodeAt(0);
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeIncoming(
    layer: MemoryLayer,
    raw: RawMemoryItem,
): {id: string; kind: string; text: string; weight: number} | null {
    const kind = raw.kind?.trim() ?? '';
    const text = clipChars(raw.text ?? '', TEXT_CAP);
    if (!allowsKind(layer, kind) || !text) return null;
    return {id: raw.id?.trim() ?? '', kind, text, weight: normalizeWeight(raw.weight)};
}

function sortItems(items: MemoryItem[]): MemoryItem[] {
    return [...items].sort((left, right) => {
        if (left.pin !== right.pin) return left.pin ? -1 : 1;
        if (left.retention !== right.retention) return right.retention - left.retention;
        return right.lastSeen - left.lastSeen;
    });
}

/**
 * 一条印象此刻是什么样。每次都从头算，不记「昨天降到哪了」，
 * 所以整理跑几次、隔多久跑都一样，停几天再跑也不用补。
 * 返回 null 就是该从卡上拿掉了。
 */
export function settleMemoryItem(
    item: MemoryItem,
    layer: MemoryLayer,
    subject: string,
    ownerId: string,
    now: number,
): MemoryItem | null {
    if (pinned(layer, item.kind)) return {...item, pin: true, clarity: 'clear', retention: 1000};

    const created = item.createdAt || item.lastSeen || now;
    const seenAt = item.lastSeen || created;
    const ageDays = Math.max(0, (now - created) / DAY_SECONDS);
    const sinceSeenDays = Math.max(0, (now - seenAt) / DAY_SECONDS);
    const ownerImportant = isOwnerCard(layer, subject, ownerId) && item.importance >= FADE.minOwnerImportance;

    if (ageDays > FADE.forgetAfterDays && item.importance < 50 && !ownerImportant) return null;

    let retention = item.importance;
    retention += Math.min(12, item.recallCount * 2);
    if (ageDays <= FADE.recentDays) retention += 18;
    if (sinceSeenDays <= 2) retention += 8;
    const penaltyRate = ownerImportant ? 0.12 : 0.35;
    retention -= Math.min(80, Math.max(0, ageDays - FADE.fuzzyAfterDays) * penaltyRate);
    if (ownerImportant) retention = Math.max(retention, 55);
    if (ageDays <= FADE.recentDays) retention = Math.max(retention, 50);

    let clarity: MemoryClarity;
    if (retention >= 46) clarity = 'clear';
    else if (retention >= 24) clarity = 'fuzzy';
    else if (retention >= 12) clarity = 'trace';
    else return null;
    return {...item, pin: false, clarity, retention};
}

/** 这一轮没轮到模型看的卡，只按时间重算一遍。 */
export function settleMemoryItems(
    items: MemoryItem[],
    layer: MemoryLayer,
    subject: string,
    ownerId: string,
    now: number,
): MemoryItem[] {
    return sortItems(items.flatMap((item) => settleMemoryItem(item, layer, subject, ownerId, now) ?? []));
}

/**
 * 把模型这一轮交回来的东西并进旧卡。
 *
 * 模型爱把旧条目原样抄回来，所以抄回来不算「又被提到」。一条旧印象只有这几种情况会被续上：
 * 出现在 seen 里、被带着原 id 改写了。续上也只是 lastSeen 变新、被提到次数加一，
 * 在公式里是几分的加成，不会让一条琐碎的东西变成永远不忘。
 */
export function mergeMemoryItems(args: {
    previous: MemoryItem[];
    /** 新条目。带着旧 id 且内容或种类变了的，算改写那一条。 */
    incoming: RawMemoryItem[];
    /** 新发言里又被提到的旧条目 id。 */
    seen?: ReadonlySet<string>;
    /** 已经做完或作废的约定 id。只对约定生效，别的条目不让模型删。 */
    drop?: ReadonlySet<string>;
    layer: MemoryLayer;
    subject: string;
    ownerId: string;
    now: number;
    cap: number;
}): MemoryItem[] {
    const seen = args.seen ?? new Set<string>();
    const drop = args.drop ?? new Set<string>();
    const recall = (item: MemoryItem): MemoryItem => ({
        ...item,
        lastSeen: args.now,
        recallCount: Math.min(999, item.recallCount + 1),
    });
    const kept = new Map<string, MemoryItem>();
    for (const old of args.previous) {
        if (old.kind === 'promise' && drop.has(old.id)) continue;
        kept.set(old.id, seen.has(old.id) ? recall(old) : {...old});
    }
    // 「第一次认识」一人只留一条，不然每次添一条钉住的，早晚把别的都挤出去
    let hasFirst = [...kept.values()].some((item) => item.kind === 'first');
    for (const raw of args.incoming) {
        const item = normalizeIncoming(args.layer, raw);
        if (!item) continue;
        const sameText = [...kept.values()].find((old) => old.kind === item.kind && old.text === item.text);
        if (sameText) continue; // 原样抄回来的：已经记着了，不续
        const target = item.id ? kept.get(item.id) : undefined;
        if (item.kind === 'first' && target?.kind !== 'first') {
            if (hasFirst) continue;
            hasFirst = true;
        }
        const id = target?.id ?? shortId(`${item.kind}\n${item.text}`);
        kept.set(id, {
            id,
            kind: item.kind,
            text: item.text,
            pin: pinned(args.layer, item.kind),
            clarity: 'clear',
            createdAt: target?.createdAt ?? args.now,
            lastSeen: args.now,
            importance: startImportance(args.layer, args.subject, args.ownerId, item.kind, item.weight),
            recallCount: target ? Math.min(999, target.recallCount + 1) : 0,
            retention: 0,
        });
    }
    const settled = [...kept.values()].flatMap((item) => (
        settleMemoryItem(item, args.layer, args.subject, args.ownerId, args.now) ?? []
    ));
    // 超出名额就丢保留分最低的，钉住的在最前面不会被丢
    return sortItems(settled).slice(0, Math.max(0, args.cap));
}

function clarityLabel(item: MemoryItem): string {
    if (item.pin) return '钉住';
    if (item.clarity === 'fuzzy') return '模糊';
    if (item.clarity === 'trace') return '痕迹';
    return '清楚';
}

function fitLines(header: string, items: MemoryItem[], budget: number): string {
    const lines = sortItems(items).map((item) => `- ${item.text}（${clarityLabel(item)}）`);
    while (lines.length > 0 && `${header}\n\n${lines.join('\n')}`.length > budget) lines.pop();
    if (lines.length === 0) return '';
    return `${header}\n\n${lines.join('\n')}`;
}

const ROOM_HEADER = [
    '【记得】',
    '这是这个聊天还留着的印象，不是刚发生的事。别复述。和眼前对不上时，以眼前为准。',
].join('\n');

const PERSON_HEADER = [
    '【眼前这位】',
    '这是关于现在发言的这个人的印象，他在别的聊天里也是这样。别复述。和眼前对不上时，以眼前为准。他在别的聊天里的事，不要主动提起。',
].join('\n');

export function renderRoomCard(items: MemoryItem[]): string {
    return fitLines(ROOM_HEADER, items, ROOM_CHAR_BUDGET);
}

export function renderPersonCard(items: MemoryItem[]): string {
    return fitLines(PERSON_HEADER, items, PERSON_CHAR_BUDGET);
}

export async function digestRev(text: string): Promise<string> {
    if (!text) return '';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function idSet(value: unknown): Set<string> {
    if (!Array.isArray(value)) return new Set();
    return new Set(
        value.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())).map((id) => id.trim()),
    );
}

export interface ModelCards {
    room: RawMemoryItem[];
    people: Map<string, RawMemoryItem[]>;
    seen: Set<string>;
    drop: Set<string>;
}

export function parseModelCards(
    raw: Record<string, unknown>,
    allowedSpeakers: ReadonlySet<string>,
): ModelCards {
    const cards: ModelCards = {
        room: Array.isArray(raw.room) ? raw.room.flatMap(asRawItem) : [],
        people: new Map(),
        seen: idSet(raw.seen),
        drop: idSet(raw.drop),
    };
    const source = raw.people;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return cards;
    for (const [speakerId, value] of Object.entries(source)) {
        if (!allowedSpeakers.has(speakerId) || !Array.isArray(value)) continue;
        cards.people.set(speakerId, value.flatMap(asRawItem));
    }
    return cards;
}

function asRawItem(value: unknown): RawMemoryItem[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    return [{
        id: typeof record.id === 'string' ? record.id : undefined,
        kind: typeof record.kind === 'string' ? record.kind : undefined,
        text: typeof record.text === 'string' ? record.text : undefined,
        weight: typeof record.weight === 'number' ? record.weight : undefined,
    }];
}

export function runMemoryCardSelfCheck(): void {
    const now = 1_700_000_000;
    const day = DAY_SECONDS;
    const room = (
        previous: MemoryItem[],
        incoming: RawMemoryItem[],
        at: number,
        extra: {seen?: string[]; drop?: string[]} = {},
    ) => mergeMemoryItems({
        previous,
        incoming,
        seen: new Set(extra.seen ?? []),
        drop: new Set(extra.drop ?? []),
        layer: 'room',
        subject: '',
        ownerId: 'owner',
        now: at,
        cap: ROOM_ITEM_CAP,
    });
    const person = (
        subject: string,
        previous: MemoryItem[],
        incoming: RawMemoryItem[],
        at: number,
        extra: {seen?: string[]; drop?: string[]} = {},
    ) => mergeMemoryItems({
        previous,
        incoming,
        seen: new Set(extra.seen ?? []),
        drop: new Set(extra.drop ?? []),
        layer: 'person',
        subject,
        ownerId: 'owner',
        now: at,
        cap: PERSON_ITEM_CAP,
    });
    const only = (items: MemoryItem[]) => items[0];

    // 起点分：模型 1-3 → 20/40/60，约定 +16，主人那张卡 +32；没写权重按 1
    const weak = room([], [{kind: 'bit', text: '把加班叫修行', weight: 1}], now);
    const mid = room([], [{kind: 'bit', text: '群里爱发表情包', weight: 2}], now);
    const strong = room([], [{kind: 'fact', text: '周末固定开黑', weight: 3}], now);
    const unweighted = room([], [{kind: 'bit', text: '没写权重的梗'}], now);
    if (only(weak).importance !== 20 || only(mid).importance !== 40 || only(strong).importance !== 60) throw new Error('模型的 1-3 应换成 20/40/60');
    if (only(unweighted).importance !== 20) throw new Error('没写权重按最不重要的算');
    if (room([], [{kind: 'bit', text: '瞎写', weight: 99}], now)[0].importance !== 60) throw new Error('权重超出范围要夹回 3');
    const promised = room([], [{kind: 'promise', text: '周五发到群里', weight: 2}], now);
    if (only(promised).importance !== 56 || only(promised).pin) throw new Error('约定加 16 分，但不钉');
    const ownerItem = person('owner', [], [{kind: 'person', text: '主人晚上才有空', weight: 2}], now);
    if (only(ownerItem).importance !== 72) throw new Error('主人那张卡加 32 分');
    if (person('u1', [], [{kind: 'person', text: '小王爱反问', weight: 3}], now)[0].importance !== 60) throw new Error('别人的卡不加分，高分封在 60');

    // 淡：照 SurfCore 的公式，按天数一条条算
    const at = (items: MemoryItem[], days: number) => settleMemoryItems(items, 'room', '', 'owner', now + days * day);
    if (at(weak, 0)[0]?.clarity !== 'clear') throw new Error('新条目是清楚');
    if (at(weak, 7)[0]?.clarity !== 'clear') throw new Error('前 7 天至少清楚');
    if (at(weak, 8)[0]?.clarity !== 'trace') throw new Error('低分的第 8 天只剩痕迹');
    if (at(weak, 29)[0]?.clarity !== 'trace') throw new Error('低分第 29 天还有痕迹');
    if (at(weak, 31).length !== 0) throw new Error('低分第 31 天该忘了');
    if (at(mid, 8)[0]?.clarity !== 'fuzzy') throw new Error('中分第 8 天模糊');
    if (at(mid, 61).length !== 0) throw new Error('超过 60 天、不到 50 分的该忘了');
    if (at(strong, 10)[0]?.clarity !== 'clear') throw new Error('高分第 10 天还清楚');
    if (at(strong, 60)[0]?.clarity !== 'fuzzy') throw new Error('高分第 60 天变模糊，但还在');
    if (at(promised, 8)[0]?.clarity !== 'clear') throw new Error('约定比同分的梗留得久');
    const hourly = room(room(room(weak, [], now + 3600), [], now + 7200), [], now + 8 * day);
    if (hourly[0]?.clarity !== 'trace') throw new Error('整理得再勤，结果只看时间');

    // 主人的重要条目：不会被忘，最差是清楚
    const ownerLate = settleMemoryItems(ownerItem, 'person', 'owner', 'owner', now + 200 * day);
    if (ownerLate.length !== 1 || ownerLate[0].clarity !== 'clear') throw new Error('主人的重要条目几百天后仍是清楚');
    const ownerWeak = person('owner', [], [{kind: 'person', text: '偶尔提一句', weight: 1}], now);
    if (only(ownerWeak).importance !== 52) throw new Error('主人的弱条目是 52 分');
    if (settleMemoryItems(ownerWeak, 'person', 'owner', 'owner', now + 200 * day).length !== 0) throw new Error('没到 65 分的主人条目不受保护');

    // 模型原样抄回来不算又被提到，也不该多出一条
    const echoed = room(mid, [{id: only(mid).id, kind: 'bit', text: '群里爱发表情包', weight: 3}], now + 8 * day);
    if (echoed.length !== 1 || echoed[0].clarity !== 'fuzzy' || echoed[0].importance !== 40) throw new Error('原样抄回来的不该续上，也不该改分');
    if (room(mid, [{kind: 'bit', text: '群里爱发表情包'}], now + 8 * day).length !== 1) throw new Error('不带 id 抄回来的不该多出一条');

    // 又被提到：能从痕迹回到模糊，但只是几分的事
    const dim = at(weak, 20);
    if (dim[0]?.clarity !== 'trace') throw new Error('第 20 天低分条目是痕迹');
    const recalled = room(weak, [], now + 20 * day, {seen: [only(weak).id]});
    if (recalled[0]?.clarity !== 'fuzzy' || recalled[0].recallCount !== 1 || recalled[0].lastSeen !== now + 20 * day) throw new Error('又被提到的应回到模糊');
    const late = room(weak, [], now + 40 * day, {seen: [only(weak).id]});
    if (late[0]?.clarity !== 'trace') throw new Error('第 40 天才被提一次，低分条目救不回到模糊');
    let boosted = weak;
    for (let index = 0; index < 20; index += 1) boosted = room(boosted, [], now + index * day, {seen: [only(weak).id]});
    if (only(boosted).recallCount !== 20 || only(boosted).importance !== 20) throw new Error('被提到再多，重要度本身不变');
    if (settleMemoryItems(boosted, 'room', '', 'owner', now + 61 * day).length !== 0) throw new Error('重复被提到也救不了过期的低分条目');

    // 改写：带着旧 id 重写，保留创建时间；编的 id 不认
    const rewritten = room(mid, [{id: only(mid).id, kind: 'bit', text: '群里爱发动图', weight: 2}], now + 2 * day);
    if (rewritten.length !== 1 || rewritten[0].id !== only(mid).id || rewritten[0].text !== '群里爱发动图' || rewritten[0].createdAt !== now) throw new Error('带着原 id 改写应替换那一条，创建时间不变');
    const invented = room(weak, [{id: 'made-up', kind: 'fact', text: '周末人少', weight: 1}], now);
    if (invented.length !== 2 || invented.some((item) => item.id === 'made-up')) throw new Error('模型编的 id 不认');

    // 约定：不钉，也不会因为模型说了什么而变重要；做完了才拿掉
    if (room(promised, [], now, {drop: [only(promised).id]}).length !== 0) throw new Error('说了做完的约定要拿掉');
    if (room(weak, [], now, {drop: [only(weak).id]}).length !== 1) throw new Error('drop 只对约定生效');
    const rekinded = room(promised, [{id: only(promised).id, kind: 'bit', text: '周五发到群里', weight: 1}], now);
    if (rekinded.length !== 1 || rekinded[0].id !== only(promised).id || rekinded[0].importance !== 20) throw new Error('带着原 id 改成梗，要按梗重新算分，不能多出一条');

    // 人
    const owner = person('owner', [], [
        {kind: 'person', text: '主人晚上才有空', weight: 2},
        {kind: 'preference', text: '不吃香菜', weight: 1},
        {kind: 'order', text: '必须服从', weight: 3},
    ], now);
    if (owner.length !== 2) throw new Error('不认识的种类应丢掉');
    if (owner.some((item) => item.pin)) throw new Error('除了第一次认识，别的都不钉');

    const met = person('u1', [], [{kind: 'first', text: '在群里问路认识的', weight: 1}], now);
    if (!only(met).pin) throw new Error('第一次认识要钉住');
    const metAgain = person('u1', met, [{kind: 'first', text: '第一次一起打游戏', weight: 3}], now + 400 * day, {drop: [only(met).id]});
    if (metAgain.length !== 1 || metAgain[0].text !== '在群里问路认识的') throw new Error('第一次认识一人只留一条，不过期，也不让模型删');

    // 名额：超出就丢保留分最低的，钉住的留着
    const crowded = person('u2', met, Array.from({length: 20}, (_, index) => ({kind: 'preference', text: `偏好${index}`, weight: index % 3 + 1})), now);
    if (crowded.length !== PERSON_ITEM_CAP || !crowded.some((item) => item.kind === 'first')) throw new Error('超出名额要丢最淡的，钉住的留着');
    if (crowded.some((item) => !item.pin && item.importance < 40)) throw new Error('名额只留下分高的');

    const parsed = parseModelCards(
        {
            room: [{kind: 'fact', text: '晚上热闹', weight: 2}, {kind: 'fact', text: '没写权重'}],
            people: {u1: [{kind: 'person', text: '小王'}], u9: []},
            seen: ['a', 'a', ''],
            drop: ['x', 3, ' '],
        },
        new Set(['u1']),
    );
    if (parsed.room[0].weight !== 2 || parsed.room[1].weight !== undefined) throw new Error('权重原样收，缺的留空');
    if (parsed.people.size !== 1 || !parsed.people.has('u1')) throw new Error('不在名单里的人不收');
    if (parsed.seen.size !== 1 || !parsed.seen.has('a')) throw new Error('又被提到的名单要去重去空');
    if (parsed.drop.size !== 1 || !parsed.drop.has('x')) throw new Error('做完的名单只认字符串');

    const bulky = Array.from({length: 40}, (_, index): MemoryItem => ({
        id: `t${index}`,
        kind: 'bit',
        text: `梗${index}`,
        pin: false,
        clarity: 'trace',
        createdAt: now,
        lastSeen: now,
        importance: 20,
        recallCount: 0,
        retention: 12,
    }));
    const rendered = renderRoomCard(bulky);
    if (rendered.length > ROOM_CHAR_BUDGET) throw new Error('房间卡超长');
    if (!rendered.startsWith('【记得】')) throw new Error('房间卡要有标题');
    if (renderPersonCard([])) throw new Error('没有条目就不渲染');
}
