/**
 * 猫娘按群开关，默认关。开了的群才能玩，没开的群对 `#猫娘…` 装作没这回事（走「没听懂」）。
 *
 * 开关记在 XBOT_KV，一个群一条：`neko:on:<platform>:<chatId>`。
 * 主人在群里发 `#猫娘开` / `#猫娘关` 切换。
 */
import {resolveOwnerId} from '../../../core/bot.js';
import type {IncomingMessage} from '../../../core/message.js';
import {textReply, type HandlerResponse} from '../../../core/reply.js';
import type {Env} from '../../../types/env.js';
import type {CallCtx} from './catalog.js';

const ON = new Set(['开', '开启', '启用']);
const OFF = new Set(['关', '关闭', '停用']);

function switchKey(message: IncomingMessage): string {
    return `neko:on:${message.platform}:${message.chatId}`;
}

function isBotOwner(message: IncomingMessage, env: Env): boolean {
    const ownerId = resolveOwnerId(env, message.platform);
    return Boolean(ownerId && message.senderId.trim() === ownerId);
}

export async function isNekoEnabled(message: IncomingMessage, env: Env): Promise<boolean> {
    return Boolean(await env.XBOT_KV.get(switchKey(message)));
}

/** 放行返回 true；其余原样当回复。返回 null 表示装作没这个口令。 */
export async function nekoGate(ctx: CallCtx): Promise<true | HandlerResponse> {
    const {message, env} = ctx;
    const tail = ctx.command.trim().replace(/^猫娘\s*/u, '');
    const turnOn = ON.has(tail);
    const turnOff = OFF.has(tail);

    if (turnOn || turnOff) {
        if (!isBotOwner(message, env)) return textReply('这事只有主人能定');
        if (message.source !== 'group') return textReply('得在群里说');
        if (turnOn) {
            await env.XBOT_KV.put(switchKey(message), '1');
            return textReply('这群开了，发 #猫娘帮助 看玩法');
        }
        await env.XBOT_KV.delete(switchKey(message));
        return textReply('这群关了');
    }

    // 私聊交给后面的参数检查提示「得在群里玩」，不查开关。
    if (message.source !== 'group') return true;
    return (await isNekoEnabled(message, env)) ? true : null;
}
