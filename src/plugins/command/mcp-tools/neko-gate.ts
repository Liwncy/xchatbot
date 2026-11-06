/**
 * 猫娘按群开关，默认关。开了的群才能玩，没开的群对 `#猫娘…` 装作没这回事（走「没听懂」）。
 *
 * 主人在群里发：
 * - `#猫娘开` / `#猫娘关`  切换
 * - `#猫娘设置`            看这群的接话概率和冷却，后面跟 `出现 10 接话 5 冷却 3` 改，`默认` 恢复
 *
 * KV 怎么存见 core/neko/store.ts。
 */
import {resolveOwnerId} from '../../../core/bot.js';
import type {IncomingMessage} from '../../../core/message.js';
import {
    clearChimeOverride,
    disableNeko,
    enableNeko,
    loadChimeConfig,
    readNekoGroup,
    saveChimeOverride,
    syncNekoOwner,
    type NekoChimeConfig,
} from '../../../core/neko/store.js';
import {textReply, type HandlerResponse} from '../../../core/reply.js';
import type {McpToolResult} from '../../../mcp/client.js';
import type {Env} from '../../../types/env.js';
import type {CallCtx} from './catalog.js';

const ON = new Set(['开', '开启', '启用']);
const OFF = new Set(['关', '关闭', '停用']);
const SETTING_ITEM = /(出现|接话|冷却)\s*(\d+(?:\.\d+)?)\s*%?/gu;

function isBotOwner(message: IncomingMessage, env: Env): boolean {
    const ownerId = resolveOwnerId(env, message.platform);
    return Boolean(ownerId && message.senderId.trim() === ownerId);
}

export async function isNekoEnabled(message: IncomingMessage, env: Env): Promise<boolean> {
    return Boolean(await readNekoGroup(env, message.platform, message.chatId));
}

function settingsText(config: NekoChimeConfig): string {
    return [
        `@ 到猫娘本人，她冒出来的概率 ${config.mentionPercent}%`,
        `猫娘本人说话，她接一句的概率 ${config.speakPercent}%`,
        config.cooldownMinutes > 0 ? `两次接话至少隔 ${config.cooldownMinutes} 分钟` : '接话不设冷却',
    ].join('\n');
}

async function handleSettings(ctx: CallCtx, rest: string): Promise<HandlerResponse> {
    const {message, env} = ctx;
    if (!isBotOwner(message, env)) return textReply('这事只有主人能定');
    if (message.source !== 'group') return textReply('得在群里说');
    const {platform, chatId} = message;

    if (!rest) {
        const config = await loadChimeConfig(env, platform, chatId);
        return textReply([
            settingsText(config),
            '想改就发 #猫娘设置 出现 10 接话 5 冷却 3，#猫娘设置 默认 恢复',
        ].join('\n'));
    }
    if (rest === '默认') {
        const config = await clearChimeOverride(env, platform, chatId);
        return textReply(`好了，恢复默认 👌\n${settingsText(config)}`);
    }

    const patch: Partial<NekoChimeConfig> = {};
    for (const match of rest.matchAll(SETTING_ITEM)) {
        const value = Number.parseFloat(match[2] ?? '');
        if (!Number.isFinite(value)) continue;
        if (match[1] === '出现') patch.mentionPercent = Math.min(100, value);
        else if (match[1] === '接话') patch.speakPercent = Math.min(100, value);
        else patch.cooldownMinutes = Math.min(24 * 60, value);
    }
    if (Object.keys(patch).length === 0) {
        return textReply('没看懂，比如 #猫娘设置 出现 10 接话 5 冷却 3');
    }
    const config = await saveChimeOverride(env, platform, chatId, patch);
    return textReply(`改好了 👌\n${settingsText(config)}`);
}

/** 放行返回 true；其余原样当回复。返回 null 表示装作没这个口令。 */
export async function nekoGate(ctx: CallCtx): Promise<true | HandlerResponse> {
    const {message, env} = ctx;
    const tail = ctx.command.trim().replace(/^猫娘\s*/u, '');

    if (tail.startsWith('设置')) return handleSettings(ctx, tail.slice(2).trim());

    const turnOn = ON.has(tail);
    const turnOff = OFF.has(tail);
    if (turnOn || turnOff) {
        if (!isBotOwner(message, env)) return textReply('这事只有主人能定');
        if (message.source !== 'group') return textReply('得在群里说');
        if (turnOn) {
            await enableNeko(env, message.platform, message.chatId);
            return textReply('这群开了，发 #猫娘帮助 看玩法');
        }
        await disableNeko(env, message.platform, message.chatId);
        return textReply('这群关了');
    }

    // 私聊交给后面的参数检查提示「得在群里玩」，不查开关。
    if (message.source !== 'group') return true;
    return (await isNekoEnabled(message, env)) ? true : null;
}

/**
 * 口令跑完后，把工具回包里的当前猫娘记进开关缓存。
 * 群里的 ambient 监听器靠它判断「谁是猫娘」，不用每条消息都去查库。
 */
export async function syncNekoOwnerFromResult(ctx: CallCtx, result: McpToolResult): Promise<void> {
    const {message, env} = ctx;
    if (message.source !== 'group') return;
    const raw = result.raw as {owner?: {id?: unknown; name?: unknown} | null} | null;
    const id = typeof raw?.owner?.id === 'string' ? raw.owner.id : '';
    if (!id) return;
    const name = typeof raw?.owner?.name === 'string' ? raw.owner.name : '';
    await syncNekoOwner(env, message.platform, message.chatId, {id, name});
}
