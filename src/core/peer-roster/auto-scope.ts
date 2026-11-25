import type {Env} from '../../types/env.js';
import {logger} from '../../utils/logger.js';

/**
 * 自动收的范围：哪几类事允许从聊天里自动收进花名册。
 * 只划范围，不写口令：群里别的机器人叫什么，由模型从聊天里看出来，代码再查证（见 memory/peers.ts）。
 */
export interface AutoScope {
    /** 线路名，短而稳，写进花名册的 title。 */
    title: string;
    /** 具体的事，一句话，写进花名册的 about，也是给模型看的范围说明。 */
    about: string;
}

/** KV 里放这张表的键。值是 JSON 数组：`[{"title":"点歌","about":"点歌、放歌曲、来一首歌，说歌名或歌手"}]`。 */
export const AUTO_SCOPES_KEY = 'peer:auto-scopes';

const TITLE_MAX = 12;
const ABOUT_MAX = 80;
const SCOPE_CAP = 50;

/**
 * KV 里没有这个键（或值坏了）时用的默认范围，来自 Golem 自带插件的说明
 * （music、wordcloud、statistics、news、profile），加上纯发一张表情。
 *
 * 没收进来的，是有意的：
 * - meme（表情包，`meme 揍 @某人` 那种组合图）：参数里的 `@某人` 发出去不是真的 @，甩给别人用不了。
 * - 游戏（农场、打劫）：是各人自己的存档，不是谁帮谁办事，甩给别人没意义。
 * - setu 的色图口令：要不要收由你定。
 * - `/pm`、`/cm`、`/ai`：Golem 的管理命令，只有主人能用，且可能带密钥。memory/peers.ts 里还有一道硬挡。
 * 范围以外的事不自动收，对话里说「记下」手动收。
 */
export const DEFAULT_AUTO_SCOPES: readonly AutoScope[] = [
    {title: '点歌', about: '点歌、放歌曲、来一首歌，说歌名或歌手'},
    {title: '发表情', about: '发一张指定的表情，写表情名，如发掌嘴表情'},
    {title: '词云', about: '生成群里的词云图，可以指定时间范围'},
    {title: '发言排行', about: '看群里的发言排行（今日、昨日、本周、本月、总榜），也能看某人的发言详情'},
    {title: '新闻', about: '看今日新闻或今日图卦'},
    {title: '人物画像', about: '给群友画人物画像'},
];

function clean(value: unknown, max: number): string {
    return typeof value === 'string'
        ? Array.from(value.replace(/\s+/gu, ' ').trim()).slice(0, max).join('')
        : '';
}

function defaults(): AutoScope[] {
    return DEFAULT_AUTO_SCOPES.map((entry) => ({...entry}));
}

/**
 * 从 KV 读自动收的范围。没配就用默认表；配成空数组就是一个都不自动收；
 * 值不是合法 JSON、或者一条合法的都没有，记一条日志，退回默认表，不让整理停下来。
 */
export async function loadAutoScopes(env: Env): Promise<AutoScope[]> {
    let raw: string | null = null;
    try {
        raw = await env.XBOT_KV.get(AUTO_SCOPES_KEY);
    } catch (error) {
        logger.warn('自动收的范围没读到，用默认表', {error: error instanceof Error ? error.message : String(error)});
    }
    if (!raw?.trim()) return defaults();
    const parsed = parseAutoScopes(raw);
    if (parsed) return parsed;
    logger.warn('自动收的范围格式不对，用默认表', {key: AUTO_SCOPES_KEY});
    return defaults();
}

/** 解析并清洗。整体不合法返回 null；`[]` 合法。`about` 可省，省了就用 `title`。 */
export function parseAutoScopes(raw: string): AutoScope[] | null {
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!Array.isArray(value)) return null;
    const out: AutoScope[] = [];
    const seen = new Set<string>();
    for (const entry of value.slice(0, SCOPE_CAP)) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const item = entry as Record<string, unknown>;
        const title = clean(item.title, TITLE_MAX);
        if (!title || seen.has(title.toLowerCase())) continue;
        seen.add(title.toLowerCase());
        out.push({title, about: clean(item.about, ABOUT_MAX) || title});
    }
    return out.length || value.length === 0 ? out : null;
}
