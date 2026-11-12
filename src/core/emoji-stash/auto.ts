import {resolveChatSession} from '../chat-log/session.js';
import {requestLlmJson} from '../llm/index.js';
import type {IncomingMessage} from '../message.js';
import {currentPersona} from '../persona/service.js';
import {emojiReply, type ReplyMessage} from '../reply.js';
import type {Env} from '../../types/env.js';
import {logger} from '../../utils/logger.js';
import type {EmojiStashCategory} from './categories.js';
import {emojiPickRandom} from './service.js';

/** 回复配图：按会话、平台、全部三层存开关和概率，越靠前越优先。 */
export type AutoScope = 'session' | 'platform' | 'global';

export interface AutoSetting {
    on?: boolean;
    chance?: number;
}

export interface AutoConfig {
    on: boolean;
    chance: number;
    onFrom: AutoScope | 'default';
    chanceFrom: AutoScope | 'default';
}

export const DEFAULT_AUTO_CHANCE = 30;
/** 超过这个字数的回复多半是在办事，不配图。 */
const MAX_REPLY_CHARS = 80;
/** 小模型判标签最多等这么久，超了就走关键词。 */
const MOOD_TIMEOUT_MS = 5_000;

function settingKey(scope: AutoScope, platform: string, sessionId: string): string {
    if (scope === 'global') return 'emoji:auto:g';
    if (scope === 'platform') return `emoji:auto:p:${platform}`;
    return `emoji:auto:s:${platform}:${sessionId}`;
}

function clampChance(value: unknown): number | undefined {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n)) return undefined;
    return Math.min(100, Math.max(0, n));
}

function parseSetting(raw: string | null): AutoSetting {
    if (!raw) return {};
    try {
        const data = JSON.parse(raw) as {on?: unknown; chance?: unknown};
        const out: AutoSetting = {};
        if (typeof data.on === 'boolean') out.on = data.on;
        const chance = data.chance === undefined ? undefined : clampChance(data.chance);
        if (chance !== undefined) out.chance = chance;
        return out;
    } catch {
        return {};
    }
}

export async function readAutoSetting(
    env: Env,
    scope: AutoScope,
    platform: string,
    sessionId: string,
): Promise<AutoSetting> {
    return parseSetting(await env.XBOT_KV.get(settingKey(scope, platform, sessionId)));
}

export async function writeAutoSetting(
    env: Env,
    scope: AutoScope,
    platform: string,
    sessionId: string,
    patch: AutoSetting,
): Promise<AutoSetting> {
    const current = await readAutoSetting(env, scope, platform, sessionId);
    const next: AutoSetting = {...current};
    if (patch.on !== undefined) next.on = patch.on;
    if (patch.chance !== undefined) next.chance = clampChance(patch.chance) ?? current.chance;
    await env.XBOT_KV.put(settingKey(scope, platform, sessionId), JSON.stringify(next));
    return next;
}

export async function clearAutoSetting(
    env: Env,
    scope: AutoScope,
    platform: string,
    sessionId: string,
): Promise<void> {
    await env.XBOT_KV.delete(settingKey(scope, platform, sessionId));
}

export async function resolveAutoConfig(
    env: Env,
    platform: string,
    sessionId: string,
): Promise<{config: AutoConfig; layers: Record<AutoScope, AutoSetting>}> {
    const [session, platformLayer, global] = await Promise.all([
        readAutoSetting(env, 'session', platform, sessionId),
        readAutoSetting(env, 'platform', platform, sessionId),
        readAutoSetting(env, 'global', platform, sessionId),
    ]);
    const layers = {session, platform: platformLayer, global};
    const order: AutoScope[] = ['session', 'platform', 'global'];
    const config: AutoConfig = {on: false, chance: DEFAULT_AUTO_CHANCE, onFrom: 'default', chanceFrom: 'default'};
    for (const scope of order) {
        if (layers[scope].on !== undefined) {
            config.on = layers[scope].on === true;
            config.onFrom = scope;
            break;
        }
    }
    for (const scope of order) {
        if (layers[scope].chance !== undefined) {
            config.chance = layers[scope].chance ?? DEFAULT_AUTO_CHANCE;
            config.chanceFrom = scope;
            break;
        }
    }
    return {config, layers};
}

/** 带人格时，这个人格放行哪些标签和分类。 */
export interface PersonaOpen {
    tags: string[];
    categories: string[];
}

function openKey(roleKey: string): string {
    return `emoji:open:${roleKey.trim().toLowerCase()}`;
}

export async function readPersonaOpen(env: Env, roleKey: string): Promise<PersonaOpen | null> {
    const raw = await env.XBOT_KV.get(openKey(roleKey));
    if (!raw) return null;
    try {
        const data = JSON.parse(raw) as {tags?: unknown; categories?: unknown};
        const list = (value: unknown): string[] =>
            Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
        const open = {tags: list(data.tags), categories: list(data.categories)};
        return open.tags.length || open.categories.length ? open : null;
    } catch {
        return null;
    }
}

export async function writePersonaOpen(env: Env, roleKey: string, open: PersonaOpen): Promise<void> {
    await env.XBOT_KV.put(openKey(roleKey), JSON.stringify(open));
}

export async function clearPersonaOpen(env: Env, roleKey: string): Promise<void> {
    await env.XBOT_KV.delete(openKey(roleKey));
}

interface Mood {
    tag: string;
    category: EmojiStashCategory;
}

/** 小模型只能在这些里面挑，库里这些标签的图最多。 */
const MOODS: Mood[] = [
    {tag: '搞笑', category: 'funny'},
    {tag: '大笑', category: 'funny'},
    {tag: '沙雕', category: 'funny'},
    {tag: '嘲讽', category: 'funny'},
    {tag: '无语', category: 'react'},
    {tag: '尴尬', category: 'react'},
    {tag: '发呆', category: 'react'},
    {tag: '斜眼', category: 'react'},
    {tag: '点赞', category: 'react'},
    {tag: '胜利', category: 'react'},
    {tag: '委屈', category: 'sad'},
    {tag: '伤心', category: 'sad'},
    {tag: '生气', category: 'angry'},
    {tag: '害羞', category: 'cute'},
    {tag: '卖萌', category: 'cute'},
    {tag: '开心', category: 'cute'},
    {tag: '爱心', category: 'love'},
    {tag: '打工人', category: 'work'},
    {tag: '躺平', category: 'work'},
    {tag: '猫咪', category: 'animal'},
    {tag: '狗狗', category: 'animal'},
    {tag: '熊猫头', category: 'meme'},
];

interface Rule {
    pattern: RegExp;
    tag: string;
}

/** 小模型没接上或出错时的兜底：回复里出现这些词，就按对应的标签配图。靠前的优先。 */
const RULES: Rule[] = [
    {pattern: /哈哈|笑死|绷不住|乐死|hhh|233/iu, tag: '大笑'},
    {pattern: /加班|打工|上班|搬砖|摸鱼|下班/u, tag: '打工人'},
    {pattern: /抱抱|心疼|太惨|好惨|委屈|难受|难过|伤心|呜呜|哭了/u, tag: '委屈'},
    {pattern: /气死|生气|烦死|可恶|太过分/u, tag: '生气'},
    {pattern: /无语|绝了|服了|离谱|醉了|行吧/u, tag: '无语'},
    {pattern: /尴尬|社死|不好意思/u, tag: '尴尬'},
    {pattern: /害羞|羞羞|脸红/u, tag: '害羞'},
    {pattern: /呵呵|就这|活该|笑你/u, tag: '嘲讽'},
    {pattern: /躺平|摆烂|懒得|佛了/u, tag: '躺平'},
    {pattern: /发呆|愣住|懵了/u, tag: '发呆'},
    {pattern: /赢了|夺冠|胜利|拿下/u, tag: '胜利'},
    {pattern: /厉害|点赞|真行|太强/u, tag: '点赞'},
    {pattern: /爱你|喜欢你|想你|么么|比心/u, tag: '爱心'},
    {pattern: /撒娇|卖萌|可爱|乖乖/u, tag: '卖萌'},
    {pattern: /开心|太好了|好耶|恭喜|太棒/u, tag: '开心'},
    {pattern: /猫|喵/u, tag: '猫咪'},
    {pattern: /狗|汪汪/u, tag: '狗狗'},
];

function moodOf(tag: string): Mood | null {
    return MOODS.find((item) => item.tag === tag) ?? null;
}

export function matchEmojiRule(text: string): Mood | null {
    for (const rule of RULES) {
        if (rule.pattern.test(text)) return moodOf(rule.tag);
    }
    return null;
}

/** 只给纯文字的短闲聊配图。带图、链接、点名、办事结果的一律不配。 */
function chatterText(replies: ReplyMessage[]): string | null {
    if (replies.length === 0) return null;
    const parts: string[] = [];
    for (const reply of replies) {
        if (reply.type !== 'text' || reply.mentions?.length) return null;
        parts.push(reply.content);
    }
    const text = parts.join('\n').trim();
    if (!text || [...text].length > MAX_REPLY_CHARS || /https?:\/\//iu.test(text)) return null;
    return text;
}

type Judged = {kind: 'tag'; mood: Mood} | {kind: 'none'} | {kind: 'failed'};

/** 让小模型从候选里挑一个标签。挑「不配」也算成功；没接上、超时、答非所问算失败。 */
async function judgeMood(env: Env, text: string, userText: string, candidates: Mood[]): Promise<Judged> {
    try {
        const raw = await requestLlmJson(env, {
            type: 'chat',
            system: [
                '你在给聊天回复挑表情包。会给你对方说的话和要发出去的回复，看整段对话的气氛和回复的语气，从候选标签里挑一个最贴的。',
                '闲聊、玩笑、吐槽、安慰、夸奖、卖萌、随口一句，这些都可以配，情绪淡一点就挑最接近的。',
                '只有这两种不配：在认真办事、查资料、讲道理；候选里没有一个对得上、硬配会很怪。',
                '只输出一个 JSON 对象，不要解释，不要 markdown：{"tag":"标签"}，不配就写 {"tag":""}。',
                `候选：${candidates.map((item) => item.tag).join('、')}`,
            ].join('\n'),
            user: userText ? `对方说：${userText}\n回复：${text}` : `回复：${text}`,
            timeoutMs: MOOD_TIMEOUT_MS,
        });
        if (!raw || typeof raw.tag !== 'string') return {kind: 'failed'};
        const tag = raw.tag.trim();
        if (!tag) return {kind: 'none'};
        const mood = candidates.find((item) => item.tag === tag);
        return mood ? {kind: 'tag', mood} : {kind: 'failed'};
    } catch (error) {
        logger.warn('配图判标签没成', {error: error instanceof Error ? error.message : String(error)});
        return {kind: 'failed'};
    }
}

/**
 * 给大脑的回复挑一张配图，没得配返回 null。开关、概率、人格放行范围都在这里判断。
 * 先让小模型判标签，它没接上或出错才走关键词规则。
 * 任何一步出错都当没得配，配图只是锦上添花。
 */
export async function planEmojiAuto(
    env: Env,
    message: IncomingMessage,
    replies: ReplyMessage[],
    options?: {random?: () => number},
): Promise<ReplyMessage | null> {
    try {
        if (!env.XBOT_DB) return null;
        const text = chatterText(replies);
        if (!text) return null;

        const {sessionId} = resolveChatSession(message);
        const {config} = await resolveAutoConfig(env, message.platform, sessionId);
        if (!config.on || config.chance <= 0) return null;

        // 带人格时只能用这个人格放行的；没放行就不用往下问了
        let candidates = MOODS;
        let allowed = (_mood: Mood): boolean => true;
        let categoryAllowed = (_category: EmojiStashCategory): boolean => true;
        const persona = await currentPersona(env, message);
        if (persona) {
            const open = await readPersonaOpen(env, persona.roleKey);
            if (!open) return null;
            allowed = (mood) => open.tags.includes(mood.tag) || open.categories.includes(mood.category);
            categoryAllowed = (category) => open.categories.includes(category);
            candidates = MOODS.filter(allowed);
            if (candidates.length === 0) return null;
        }

        const random = options?.random ?? Math.random;
        if (random() * 100 >= config.chance) return null;

        let mood: Mood | null = null;
        const judged = await judgeMood(env, text, (message.content ?? '').trim().slice(0, 200), candidates);
        if (judged.kind === 'none') return null;
        if (judged.kind === 'tag') {
            mood = judged.mood;
        } else {
            const byRule = matchEmojiRule(text);
            if (byRule && allowed(byRule)) mood = byRule;
        }
        if (!mood) return null;

        let picked = await emojiPickRandom(env, {tag: mood.tag});
        if (!picked.ok && categoryAllowed(mood.category)) {
            picked = await emojiPickRandom(env, {category: mood.category});
        }
        if (!picked.ok || !picked.item.md5) return null;
        return emojiReply(picked.item.md5, picked.item.imgUrl || undefined);
    } catch (error) {
        logger.warn('回复配图没成', {error: error instanceof Error ? error.message : String(error)});
        return null;
    }
}

/** 配好图直接拼在回复后面。要先发文字再补图的，用 planEmojiAuto。 */
export async function applyEmojiAuto(
    env: Env,
    message: IncomingMessage,
    replies: ReplyMessage[],
    options?: {random?: () => number},
): Promise<ReplyMessage[]> {
    const extra = await planEmojiAuto(env, message, replies, options);
    return extra ? [...replies, extra] : replies;
}
