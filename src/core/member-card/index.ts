import type {Env} from '../../types/env.js';
import {resolveBotId} from '../bot.js';
import {logger} from '../../utils/logger.js';
import {rosterSessionId} from '../peer-roster/scope.js';
import {CardQueryUnsafe, loadCardMaterial} from './material.js';
import {askCardText, buildCardPrompt, collectTexts} from './model.js';
import {renderMemberCard} from './render.js';
import {computeStats} from './stats.js';

export interface MemberCardInput {
    /** `group:<群 id>`，和花名册同一种写法。 */
    scope: string;
    /** 画谁。 */
    wxid: string;
    /** 对方给的名字（被 @ 的昵称），没有就用聊天记录里的。 */
    name?: string;
    platform: string;
}

/** 往回看多久。聊天记录本来也只留 30 天。 */
const WINDOW_SECONDS = 30 * 86400;
/** 他在这一批里至少说过几条才画。 */
export const MIN_ROWS = 10;

/**
 * 画一张群友角色卡。统计是代码算的，称号、职业这些是模型写的，写完由代码检查。
 * 没存库：每次现算。返回的 `reply` 就是要发的话，失败也是人话。
 */
export async function buildMemberCard(env: Env, input: MemberCardInput): Promise<{reply: string; ok: boolean}> {
    const sessionId = rosterSessionId(input.scope);
    const targetId = input.wxid.trim();
    if (!sessionId || sessionId.startsWith('private:')) return {ok: false, reply: '这个得在群里玩 😅'};
    if (!targetId) return {ok: false, reply: '画谁？@他，或者引用他一句'};

    const botId = resolveBotId(env, input.platform);
    if (botId && targetId === botId) return {ok: false, reply: '我就不画自己了 😅'};

    const now = Math.floor(Date.now() / 1000);
    let rows;
    try {
        rows = await loadCardMaterial(env, sessionId, now - WINDOW_SECONDS);
    } catch (error) {
        logger.warn('角色卡素材没读成', {
            sessionId,
            unsafe: error instanceof CardQueryUnsafe,
            error: error instanceof Error ? error.message : String(error),
        });
        return {ok: false, reply: '翻不到记录，再试下'};
    }

    const botIds = new Set<string>(botId ? [botId] : []);
    for (const row of rows) if (row.actorType === 'bot' && row.senderId) botIds.add(row.senderId);
    if (botIds.has(targetId)) return {ok: false, reply: '我就不画机器人了 😅'};

    const stats = computeStats(rows, targetId, botIds);
    if (stats.rows < MIN_ROWS) return {ok: false, reply: '他最近没说几句，画不出来 🤔'};

    const latestName = [...rows].reverse().find((row) => row.senderId === targetId && row.senderName)?.senderName;
    const name = input.name?.trim() || latestName || targetId;

    const {hisTexts, allTexts} = collectTexts(rows, targetId, botIds);
    try {
        const parsed = await askCardText(
            env,
            buildCardPrompt(name, stats, rows, targetId, botIds),
            {hisTexts, allTexts, partnerIds: new Set(stats.bonds.map((bond) => bond.id))},
        );
        if (parsed.problems.length) {
            logger.warn('角色卡有项没写对，用了备用词', {sessionId, problems: parsed.problems});
        }
        return {ok: true, reply: renderMemberCard(name, stats, parsed.card)};
    } catch (error) {
        logger.warn('角色卡没写成', {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
        });
        return {ok: false, reply: '画失败了，再试下'};
    }
}
