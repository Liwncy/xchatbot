/** 记忆卡的纯逻辑：合并、衰减、渲染。不碰数据库，也不调模型。 */

export type MemoryClarity = 'clear' | 'fuzzy' | 'trace';
export type MemoryLayer = 'room' | 'person';

export interface MemoryItem {
    id: string;
    kind: string;
    text: string;
    pin: boolean;
    clarity: MemoryClarity;
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
const TEXT_CAP = 40;

export function clipChars(text: string, max: number): string {
    return Array.from(text.replace(/\s+/gu, ' ').trim()).slice(0, max).join('');
}

export function decaySteps(updatedAt: number, now: number): number {
    if (!updatedAt) return 1;
    const days = Math.floor((now - updatedAt) / 86400);
    if (days <= 0) return 0;
    return Math.min(7, days);
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
    const id = raw.id?.trim() && /^[a-zA-Z0-9_-]{1,40}$/u.test(raw.id.trim())
        ? raw.id.trim()
        : shortId(`${kind}\n${text}`);
    return {id, kind, text};
}

function sortItems(items: MemoryItem[]): MemoryItem[] {
    return [...items].sort((left, right) => {
        if (left.pin !== right.pin) return left.pin ? -1 : 1;
        return CLARITY_RANK[left.clarity] - CLARITY_RANK[right.clarity];
    });
}

export function decayMemoryItems(items: MemoryItem[], steps: number): MemoryItem[] {
    if (steps <= 0) return items.map((item) => ({...item}));
    const next: MemoryItem[] = [];
    for (const item of items) {
        if (item.pin) {
            next.push({...item});
            continue;
        }
        const index = CLARITY_STEPS.indexOf(item.clarity);
        const landed = (index < 0 ? 0 : index) + steps;
        const clarity = CLARITY_STEPS[landed];
        if (!clarity) continue;
        next.push({...item, clarity});
    }
    return next;
}

export function mergeMemoryItems(args: {
    previous: MemoryItem[];
    incoming: RawMemoryItem[];
    layer: MemoryLayer;
    subject: string;
    ownerId: string;
    steps: number;
    now: number;
    cap: number;
    /** 整理时明说已经做完或作废的约定 id。只对约定生效。 */
    drop?: ReadonlySet<string>;
}): MemoryItem[] {
    const drop = args.drop ?? new Set<string>();
    // 钉住的约定不会自己淡掉，只有这里能拿掉；别的钉住条目不让模型删
    const previous = args.previous.filter((old) => !(old.kind === 'promise' && drop.has(old.id)));
    // 「第一次认识」一人只留一条，不然每天添一条钉住的，早晚把别的都挤出去
    let hasFirst = previous.some((old) => old.kind === 'first');
    const used = new Set<string>();
    const next: MemoryItem[] = [];
    for (const raw of args.incoming) {
        const item = normalizeIncoming(args.layer, raw);
        if (!item) continue;
        const match = previous.find((old) => !used.has(old.id) && (old.id === item.id || (old.kind === item.kind && old.text === item.text)));
        if (item.kind === 'first' && match?.kind !== 'first') {
            if (hasFirst) continue;
            hasFirst = true;
        }
        if (match) used.add(match.id);
        next.push({
            id: match?.id ?? item.id,
            kind: item.kind,
            text: item.text,
            pin: pinned(args.layer, item.kind, args.subject, args.ownerId),
            clarity: 'clear',
            lastSeen: args.now,
        });
    }
    for (const old of previous) {
        if (used.has(old.id)) continue;
        const faded = decayMemoryItems([old], args.steps);
        if (faded[0]) next.push(faded[0]);
    }
    return sortItems(next).slice(0, Math.max(0, args.cap));
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

export function parseModelCards(
    raw: Record<string, unknown>,
    allowedSpeakers: ReadonlySet<string>,
): {room: RawMemoryItem[]; people: Map<string, RawMemoryItem[]>; drop: Set<string>} {
    const room = Array.isArray(raw.room) ? raw.room.flatMap(asRawItem) : [];
    const people = new Map<string, RawMemoryItem[]>();
    const drop = new Set<string>(
        Array.isArray(raw.drop) ? raw.drop.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())).map((id) => id.trim()) : [],
    );
    const source = raw.people;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return {room, people, drop};
    for (const [speakerId, value] of Object.entries(source)) {
        if (!allowedSpeakers.has(speakerId) || !Array.isArray(value)) continue;
        people.set(speakerId, value.flatMap(asRawItem));
    }
    return {room, people, drop};
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
    if (decaySteps(0, now) !== 1) throw new Error('没整理过应降一档');
    if (decaySteps(now - 3600, now) !== 0) throw new Error('同一天不再降');
    if (decaySteps(now - 3 * 86400, now) !== 3) throw new Error('漏掉的天数要补上');
    if (decaySteps(now - 30 * 86400, now) !== 7) throw new Error('一次最多降七档');

    const trace = decayMemoryItems(
        [{id: 'a', kind: 'bit', text: '梗', pin: false, clarity: 'trace', lastSeen: now}],
        1,
    );
    if (trace.length !== 0) throw new Error('痕迹再降一档应该删掉');
    const pinnedItem = decayMemoryItems(
        [{id: 'b', kind: 'promise', text: '约定', pin: true, clarity: 'clear', lastSeen: now}],
        7,
    );
    if (pinnedItem.length !== 1) throw new Error('钉住的不过期');

    const merged = mergeMemoryItems({
        previous: [
            {id: 'keep', kind: 'fact', text: '晚上热闹', pin: false, clarity: 'clear', lastSeen: now},
            {id: 'fade', kind: 'bit', text: '旧梗', pin: false, clarity: 'clear', lastSeen: now},
        ],
        incoming: [{id: 'keep', kind: 'fact', text: '晚上热闹'}],
        layer: 'room',
        subject: '',
        ownerId: 'owner',
        steps: 1,
        now,
        cap: ROOM_ITEM_CAP,
    });
    const kept = merged.find((item) => item.id === 'keep');
    const faded = merged.find((item) => item.id === 'fade');
    if (kept?.clarity !== 'clear' || kept.pin) throw new Error('还在用的应回到清楚，事实不钉');
    if (faded?.clarity !== 'fuzzy') throw new Error('模型没提的应降一档');

    const owner = mergeMemoryItems({
        previous: [],
        incoming: [
            {kind: 'person', text: '主人晚上才有空'},
            {kind: 'preference', text: '不吃香菜'},
            {kind: 'order', text: '必须服从'},
        ],
        layer: 'person',
        subject: 'owner',
        ownerId: 'owner',
        steps: 1,
        now,
        cap: PERSON_ITEM_CAP,
    });
    if (owner.length !== 2) throw new Error('不认识的种类应丢掉');
    if (!owner.find((item) => item.kind === 'person')?.pin) throw new Error('主人的人物条要钉住');
    if (owner.find((item) => item.kind === 'preference')?.pin) throw new Error('偏好不钉');

    const promise = mergeMemoryItems({
        previous: [],
        incoming: [{kind: 'promise', text: '周五发到群里'}],
        layer: 'room',
        subject: '',
        ownerId: 'owner',
        steps: 1,
        now,
        cap: ROOM_ITEM_CAP,
    });
    if (!promise[0]?.pin) throw new Error('房间约定要钉住');

    const promiseId = promise[0].id;
    const stillThere = mergeMemoryItems({
        previous: promise,
        incoming: [],
        layer: 'room',
        subject: '',
        ownerId: 'owner',
        steps: 7,
        now,
        cap: ROOM_ITEM_CAP,
    });
    if (stillThere.length !== 1) throw new Error('没说做完的约定要留着');
    const done = mergeMemoryItems({
        previous: promise,
        incoming: [],
        layer: 'room',
        subject: '',
        ownerId: 'owner',
        steps: 0,
        now,
        cap: ROOM_ITEM_CAP,
        drop: new Set([promiseId]),
    });
    if (done.length !== 0) throw new Error('说了做完的约定要拿掉');
    const rekinded = mergeMemoryItems({
        previous: promise,
        incoming: [{id: promiseId, kind: 'bit', text: promise[0].text}],
        layer: 'room',
        subject: '',
        ownerId: 'owner',
        steps: 0,
        now,
        cap: ROOM_ITEM_CAP,
    });
    if (rekinded.length !== 1 || rekinded[0].id !== promiseId || rekinded[0].pin) {
        throw new Error('带着原 id 改成梗的旧约定要松开，不能多出一条');
    }

    const met = mergeMemoryItems({
        previous: [],
        incoming: [{kind: 'first', text: '在群里问路认识的'}],
        layer: 'person',
        subject: 'u1',
        ownerId: 'owner',
        steps: 0,
        now,
        cap: PERSON_ITEM_CAP,
    });
    const metAgain = mergeMemoryItems({
        previous: met,
        incoming: [{kind: 'first', text: '第一次一起打游戏'}],
        layer: 'person',
        subject: 'u1',
        ownerId: 'owner',
        steps: 1,
        now,
        cap: PERSON_ITEM_CAP,
        drop: new Set([met[0].id]),
    });
    if (metAgain.length !== 1 || metAgain[0].text !== '在群里问路认识的') {
        throw new Error('第一次认识一人只留一条，也不让模型删');
    }

    const parsed = parseModelCards(
        {room: [{kind: 'fact', text: '晚上热闹'}], people: {u1: [{kind: 'person', text: '小王'}], u9: []}, drop: ['x', 3, ' ']},
        new Set(['u1']),
    );
    if (parsed.people.size !== 1 || !parsed.people.has('u1')) throw new Error('不在名单里的人不收');
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
