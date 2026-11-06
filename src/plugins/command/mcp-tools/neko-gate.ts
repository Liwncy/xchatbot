/**
 * 猫娘按群开关，默认关。开了的群才能玩，没开的群对 `#猫娘…` 装作没这回事（走「没听懂」）。
 *
 * 主人在群里发：
 * - `#猫娘开机` / `#猫娘关机`  切换
 * - `#猫娘设置`            看这群的接话概率和冷却，后面跟 `出现 10 接话 5 冷却 3` 改，`默认` 恢复
 *
 * KV 怎么存见 neko-store.ts。
 */
import type {ChannelAdapter} from '../../../adapter/types.js';
import {resolveBotId, resolveOwnerId} from '../../../core/bot.js';
import type {IncomingMessage} from '../../../core/message.js';
import {
    clearChimeOverride,
    clearNekoOwner,
    disableNeko,
    enableNeko,
    loadChimeConfig,
    nekoGamePlatform,
    readNekoGroup,
    saveChimeOverride,
    syncNekoOwner,
    type NekoChimeConfig,
} from './neko-store.js';
import {textReply, type HandlerResponse} from '../../../core/reply.js';
import type {McpToolResult} from '../../../mcp/client.js';
import type {Env} from '../../../types/env.js';
import {logger} from '../../../utils/logger.js';
import {callCfTool} from '../../channel/ambient/guard.js';
import type {CallCtx} from './catalog.js';

const POWER_ON = '开机';
const POWER_OFF = '关机';
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

type AdoptResult =
    | {kind: 'adopted'; name: string}
    /** 群里本来就有猫娘，没动。 */
    | {kind: 'existing'}
    /** 没认成：适配器查不到群主、群主是机器人自己、或者工具没接通。 */
    | {kind: 'none'};

/**
 * 开机时给群里认一位猫娘：群主。
 * 群主靠适配器的 findRoomOwner 查，平台没这个能力或者查不到就不附身，让群里自己发 #猫娘附身@某人。
 * 群里已经有猫娘时工具什么都不做，所以重复开机、关了再开都不会换人。
 */
async function adoptRoomOwner(ctx: CallCtx): Promise<AdoptResult> {
    const {message, env, adapter} = ctx;
    const none: AdoptResult = {kind: 'none'};

    // 缓存里已经有猫娘（开着没关过），不用再去问。
    if ((await readNekoGroup(env, message.platform, message.chatId))?.ownerId) return {kind: 'existing'};
    if (!adapter?.findRoomOwner) return none;

    let owner: Awaited<ReturnType<NonNullable<ChannelAdapter['findRoomOwner']>>> = null;
    try {
        owner = await adapter.findRoomOwner(message.chatId, env);
    } catch (error) {
        logger.warn('查群主失败', {chatId: message.chatId, error: error instanceof Error ? error.message : String(error)});
        return none;
    }
    if (!owner?.id) return none;
    // 群主是机器人自己，就别让猫娘附到机器人身上。
    if (owner.id === resolveBotId(env, message.platform)) return none;

    const result = await callCfTool(env, 'neko_action', {
        platform: nekoGamePlatform(env),
        userId: message.senderId,
        userName: message.senderName ?? '',
        requestId: `${message.platform}:${message.messageId}:adopt`,
        chatId: message.chatId,
        isAdmin: true,
        mentionId: owner.id,
        mentionName: owner.name,
        adopt: true,
    }, 10_000);
    if (!result?.ok) return none;

    await syncNekoOwnerFromResult(ctx, result).catch(() => undefined);
    // 工具只在真的附身时才有话说；群里本来就有猫娘时是空串。
    return result.text?.trim() ? {kind: 'adopted', name: owner.name} : {kind: 'existing'};
}

/** 放行返回 true；其余原样当回复。返回 null 表示装作没这个口令。 */
export async function nekoGate(ctx: CallCtx): Promise<true | HandlerResponse> {
    const {message, env} = ctx;
    const tail = ctx.command.trim().replace(/^猫娘\s*/u, '');

    if (tail.startsWith('设置')) return handleSettings(ctx, tail.slice(2).trim());

    const turnOn = tail === POWER_ON;
    const turnOff = tail === POWER_OFF;
    if (turnOn || turnOff) {
        if (!isBotOwner(message, env)) return textReply('这事只有主人能定');
        if (message.source !== 'group') return textReply('得在群里说');
        if (turnOn) {
            await enableNeko(env, message.platform, message.chatId);
            const adopted = await adoptRoomOwner(ctx);
            if (adopted.kind === 'adopted') {
                return textReply(`开机啦，猫娘先附到群主「${adopted.name}」身上了 🐱 发 #猫娘帮助 看玩法`);
            }
            if (adopted.kind === 'existing') return textReply('开机啦，发 #猫娘帮助 看玩法 👌');
            return textReply('开机啦，发 #猫娘附我 就能让猫娘落到你身上 👌');
        }
        await disableNeko(env, message.platform, message.chatId);
        return textReply('关机了，数据都留着');
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
    // owner 明确是 null：工具确认群里没有猫娘（刚全清）。没有这个字段则是不知道，不动缓存。
    if (raw && raw.owner === null) {
        await clearNekoOwner(env, message.platform, message.chatId);
        return;
    }
    const id = typeof raw?.owner?.id === 'string' ? raw.owner.id : '';
    if (!id) return;
    const name = typeof raw?.owner?.name === 'string' ? raw.owner.name : '';
    await syncNekoOwner(env, message.platform, message.chatId, {id, name});
}
