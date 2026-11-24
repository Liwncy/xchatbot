/** 记忆卡的纯逻辑：合并、变淡、渲染。不碰数据库，也不调模型。 */

export type MemoryClarity = 'clear' | 'fuzzy' | 'trace';
export type MemoryLayer = 'room' | 'person';

export interface MemoryItem {
    id: string;
    kind: string;
    text: string;
    pin: boolean;
    clarity: MemoryClarity;
    /** 最后一次在聊天里被提到是什么时候。淡不淡只看它。 */
    lastSeen: number;
}

export interface RawMemoryItem {
    id?: string;
    kind?: string;
    text?: string;
}

const ROOM_KINDS = new Set(['promise', 'bit', 'fact']);
const PERSON_KINDS = new Set(['person', 'promise', 'first', 'preference']);
const CLARITY_RANK: Record<MemoryClarity, number> = {clear: 0, fuzzy: 1, trace: 2};
const CLARITY_STEPS: MemoryClarity[] = ['clear', 'fuzzy', 'trace'];

export const ROOM_CHAR_BUDGET = 1400;
export const PERSON_CHAR_BUDGET = 600;
export const ROOM_ITEM_CAP = 30;
export const PERSON_ITEM_CAP = 12;
/** 没人再提的条目，隔几天淡一档。清楚、模糊、痕迹，再往后就没了。 */
export const FADE_DAYS = 1;
/** 约定最后一次被提到之后钉几天。过了就松开，跟别的条目一样淡。 */
export const PROMISE_HOLD_DAYS = 7;
const TEXT_CAP = 40;
const DAY_SECONDS = 86400;
/** 每天整理的钟点前后会差一点，差这点不该少算一天。 */
const AGE_SLACK_SECONDS = 2 * 3600;

export function clipChars(text: string, max: number): string {
    return Array.from(text.replace(/\s+/gu, ' ').trim()).slice(0, max).join('');
}

export function allowsKind(layer: MemoryLayer, kind: string): boolean {
    return (layer === 'room' ? ROOM_KINDS : PERSON_KINDS).has(kind);
}

/** 钉住由条目种类决定，不听模型自己标的 pin。 */
export function pinned(layer: MemoryLayer, kind: string, subject: string, ownerId: string): boolean {
    if (layer === 'room') return kind === 'promise';
    if (kind === 'promise' || kind === 'first') return true;
    return kind === 'person' && Boolean(ownerId) && subject === ownerId;
}

function shortId(seed: string): string {
    let hash = 5381;
    for (const char of seed) hash = Math.imul(hash, 33) ^ char.charCodeAt(0);
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeIncoming(layer: MemoryLayer, raw: RawMemoryItem): {id: string; kind: string; text: string} | null {
    const kind = raw.kind?.trim() ?? '';
    const text = clipChars(raw.text ?? '', TEXT_CAP);
    if (!allowsKind(layer, kind) || !text) return null;
    return {id: raw.id?.trim() ?? '', kind, text};
}

function sortItems(items: MemoryItem[]): MemoryItem[] {
    return [...items].sort((left, right) => {
        if (left.pin !== right.pin) return left.pin ? -1 : 1;
        if (left.clarity !== right.clarity) return CLARITY_RANK[left.clarity] - CLARITY_RANK[right.clarity];
        return right.lastSeen - left.lastSeen;
    });
}

/**
 * 一条印象此刻该是什么样。只按「最后一次被提到」到现在过了几天算，
 * 跟整理跑了几次、模型说了什么都没关系。返回 null 就是该从卡上拿掉了。
 */
export function settleMemoryItem(
    item: MemoryItem,
    layer: MemoryLayer,
    subject: string,
    ownerId: string,
    now: number,
): MemoryItem | null {
    const days = Math.max(0, Math.floor((now - item.lastSeen + AGE_SLACK_SECONDS) / DAY_SECONDS));
    let pin = pinned(layer, item.kind, subject, ownerId);
    let fadeDays = days;
    if (item.kind === 'promise' && days > PROMISE_HOLD_DAYS) {
        pin = false;
        fadeDays = days - PROMISE_HOLD_DAYS;
    }
    if (pin) return {...item, pin: true, clarity: 'clear'};
    const clarity = CLARITY_STEPS[Math.floor(fadeDays / FADE_DAYS)];
    return clarity ? {...item, pin: false, clarity} : null;
}

/** 这一轮没轮到模型看的卡，只按时间淡一遍。 */
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
 * 模型爱把旧条目原样抄回来。抄回来不算「又被提到」，不然每条都永远是清楚的，卡就不会过期。
 * 一条旧印象只有三种情况会被续上：出现在 seen 里、被带着原 id 改写了、或者被归到了别的种类。
 */
export function mergeMemoryItems(args: {
    previous: MemoryItem[];
    /** 新条目。带着旧 id 且内容或种类变了的，算改写那一条。 */
    incoming: RawMemoryItem[];
    /** 新发言里又被提到的旧条目 id。 */
    seen?: ReadonlySet<string>;
    /** 已经做完或作废的约定 id。只对约定生效，别的钉住条目不让模型删。 */
    drop?: ReadonlySet<string>;
    layer: MemoryLayer;
    subject: string;
    ownerId: string;
    now: number;
    cap: number;
}): MemoryItem[] {
    const seen = args.seen ?? new Set<string>();
    const drop = args.drop ?? new Set<string>();
    const kept = new Map<string, MemoryItem>();
    for (const old of args.previous) {
        if (old.kind === 'promise' && drop.has(old.id)) continue;
        kept.set(old.id, seen.has(old.id) ? {...old, lastSeen: args.now} : {...old});
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
            pin: false,
            clarity: 'clear',
            lastSeen: args.now,
        });
    }
    const settled = [...kept.values()].flatMap((item) => (
        settleMemoryItem(item, args.layer, args.subject, args.ownerId, args.now) ?? []
    ));
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
    '只关于现在发言的这个人，而且只在这个聊天里。',
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
    }];
}

export function runMemoryCardSelfCheck(): void {
    const now = 1_700_000_000;
    const day = DAY_SECONDS;
    const room = (previous: MemoryItem[], incoming: RawMemoryItem[], at: number, extra: {seen?: string[]; drop?: string[]} = {}) => (
        mergeMemoryItems({
            previous,
            incoming,
            seen: new Set(extra.seen ?? []),
            drop: new Set(extra.drop ?? []),
            layer: 'room',
            subject: '',
            ownerId: 'owner',
            now: at,
            cap: ROOM_ITEM_CAP,
        })
    );
    const person = (subject: string, previous: MemoryItem[], incoming: RawMemoryItem[], at: number, extra: {drop?: string[]} = {}) => (
        mergeMemoryItems({
            previous,
            incoming,
            drop: new Set(extra.drop ?? []),
            layer: 'person',
            subject,
            ownerId: 'owner',
            now: at,
            cap: PERSON_ITEM_CAP,
        })
    );

    // 没人再提：一天一档，第三天没了。跟中间整理了几次没关系
    const first = room([], [{kind: 'bit', text: '把加班叫修行'}], now);
    if (first.length !== 1 || first[0].clarity !== 'clear' || first[0].pin) throw new Error('新梗应是清楚、不钉');
    const bitId = first[0].id;
    if (room(first, [], now + 3600)[0]?.clarity !== 'clear') throw new Error('同一天再整理不该淡');
    if (room(first, [], now + day)[0]?.clarity !== 'fuzzy') throw new Error('一天没人提应变模糊');
    if (room(first, [], now + day - 600)[0]?.clarity !== 'fuzzy') throw new Error('整理早了十分钟不该少算一天');
    if (room(first, [], now + 2 * day)[0]?.clarity !== 'trace') throw new Error('两天没人提应只剩痕迹');
    if (room(first, [], now + 3 * day).length !== 0) throw new Error('三天没人提应拿掉');
    const hourly = room(room(room(first, [], now + 3600), [], now + 7200), [], now + day);
    if (hourly[0]?.clarity !== 'fuzzy') throw new Error('整理得再勤，也是按天淡');

    // 模型原样抄回来不算又被提到
    const echoed = room(first, [{id: bitId, kind: 'bit', text: '把加班叫修行'}], now + day);
    if (echoed.length !== 1 || echoed[0].clarity !== 'fuzzy') throw new Error('原样抄回来的不该续上');
    const echoedNoId = room(first, [{kind: 'bit', text: '把加班叫修行'}], now + day);
    if (echoedNoId.length !== 1 || echoedNoId[0].clarity !== 'fuzzy') throw new Error('不带 id 抄回来的也不该续上，更不该多出一条');

    // 三种会续上的情况
    const seenAgain = room(first, [], now + 2 * day, {seen: [bitId]});
    if (seenAgain[0]?.clarity !== 'clear' || seenAgain[0].lastSeen !== now + 2 * day) throw new Error('又被提到的应回到清楚');
    const rewritten = room(first, [{id: bitId, kind: 'bit', text: '把加班叫渡劫'}], now + 2 * day);
    if (rewritten.length !== 1 || rewritten[0].id !== bitId || rewritten[0].text !== '把加班叫渡劫' || rewritten[0].clarity !== 'clear') {
        throw new Error('带着原 id 改写的应替换那一条并续上');
    }
    const invented = room(first, [{id: 'made-up', kind: 'fact', text: '周末人少'}], now);
    if (invented.length !== 2 || invented.some((item) => item.id === 'made-up')) throw new Error('模型编的 id 不认');

    // 约定：钉七天，过了松开照常淡；做完了可以直接拿掉；归错类的可以改
    const promise = room([], [{kind: 'promise', text: '周五发到群里'}], now);
    if (!promise[0]?.pin) throw new Error('房间约定要钉住');
    const promiseId = promise[0].id;
    if (!room(promise, [], now + PROMISE_HOLD_DAYS * day)[0]?.pin) throw new Error('七天内的约定要一直钉着');
    const loosened = room(promise, [], now + (PROMISE_HOLD_DAYS + 1) * day);
    if (loosened.length !== 1 || loosened[0].pin || loosened[0].clarity !== 'fuzzy') throw new Error('过了七天没人提的约定要松开');
    if (room(promise, [], now + (PROMISE_HOLD_DAYS + 3) * day).length !== 0) throw new Error('松开的约定也会淡没');
    const renewed = room(promise, [], now + 6 * day, {seen: [promiseId]});
    if (!room(renewed, [], now + 12 * day)[0]?.pin) throw new Error('又被提到的约定要重新算七天');
    if (room(promise, [], now, {drop: [promiseId]}).length !== 0) throw new Error('说了做完的约定要拿掉');
    const rekinded = room(promise, [{id: promiseId, kind: 'bit', text: '周五发到群里'}], now);
    if (rekinded.length !== 1 || rekinded[0].id !== promiseId || rekinded[0].pin) {
        throw new Error('带着原 id 改成梗的旧约定要松开，不能多出一条');
    }
    if (room(first, [], now, {drop: [bitId]}).length !== 1) throw new Error('drop 只对约定生效');

    // 人：主人的人物条钉住，别人的不钉；不认识的种类丢掉
    const owner = person('owner', [], [
        {kind: 'person', text: '主人晚上才有空'},
        {kind: 'preference', text: '不吃香菜'},
        {kind: 'order', text: '必须服从'},
    ], now);
    if (owner.length !== 2) throw new Error('不认识的种类应丢掉');
    if (!owner.find((item) => item.kind === 'person')?.pin) throw new Error('主人的人物条要钉住');
    if (owner.find((item) => item.kind === 'preference')?.pin) throw new Error('偏好不钉');
    if (person('u1', [], [{kind: 'person', text: '小王爱反问'}], now)[0]?.pin) throw new Error('别人的人物条不钉');
    const ownerLater = settleMemoryItems(owner, 'person', 'owner', 'owner', now + 30 * day);
    if (ownerLater.length !== 1 || ownerLater[0].kind !== 'person') throw new Error('只按时间淡时，钉住的留下，不钉的照样淡');

    const met = person('u1', [], [{kind: 'first', text: '在群里问路认识的'}], now);
    const metAgain = person('u1', met, [{kind: 'first', text: '第一次一起打游戏'}], now + 40 * day, {drop: [met[0].id]});
    if (metAgain.length !== 1 || metAgain[0].text !== '在群里问路认识的') {
        throw new Error('第一次认识一人只留一条，不过期，也不让模型删');
    }

    const parsed = parseModelCards(
        {
            room: [{kind: 'fact', text: '晚上热闹'}],
            people: {u1: [{kind: 'person', text: '小王'}], u9: []},
            seen: ['a', 'a', ''],
            drop: ['x', 3, ' '],
        },
        new Set(['u1']),
    );
    if (parsed.people.size !== 1 || !parsed.people.has('u1')) throw new Error('不在名单里的人不收');
    if (parsed.seen.size !== 1 || !parsed.seen.has('a')) throw new Error('又被提到的名单要去重去空');
    if (parsed.drop.size !== 1 || !parsed.drop.has('x')) throw new Error('做完的名单只认字符串');

    const bulky = Array.from({length: 40}, (_, index) => ({
        id: `t${index}`,
        kind: 'bit',
        text: `梗${index}`,
        pin: false,
        clarity: 'trace' as const,
        lastSeen: now,
    }));
    const rendered = renderRoomCard(bulky);
    if (rendered.length > ROOM_CHAR_BUDGET) throw new Error('房间卡超长');
    if (!rendered.startsWith('【记得】')) throw new Error('房间卡要有标题');
    if (renderPersonCard([])) throw new Error('没有条目就不渲染');
}
