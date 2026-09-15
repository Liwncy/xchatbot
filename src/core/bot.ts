import type {Env} from '../types/env.js';

const DEFAULT_BOT_NAME = '小聪明儿';

/** 所有适配器共用的对外名。没配 BOT_NAME 时回退 BOT_WECHAT_NAME。 */
export function resolveBotName(env: Env): string {
    return env.BOT_NAME?.trim() || env.BOT_WECHAT_NAME?.trim() || DEFAULT_BOT_NAME;
}

/** 协议侧账号。微信走 BOT_WECHAT_ID，其它适配器以后各自加。 */
export function resolveBotId(env: Env, platform: string): string {
    if (platform === 'golem') return env.BOT_WECHAT_ID?.trim() ?? '';
    return '';
}

export function resolveOwnerId(env: Env, platform: string): string {
    if (platform === 'golem') {
        return env.BOT_OWNER_ID?.trim() || env.BOT_OWNER_WECHAT_ID?.trim() || '';
    }
    return env.BOT_OWNER_ID?.trim() ?? '';
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 去掉开头的 @机器人名 / 机器人 id，给通道口令用。 */
export function stripBotPrefix(content: string, botName?: string, botId?: string): string {
    let text = content.trim();
    for (const token of [botName?.trim(), botId?.trim()]) {
        if (!token) continue;
        text = text.replace(new RegExp(`^[@＠]?\\s*${escapeRegExp(token)}[\\s,，:：]*`, 'u'), '').trim();
    }
    return text;
}
