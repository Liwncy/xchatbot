import type {Env} from '../types/env.js';
import type {IncomingMessage} from '../types/message.js';

const DEFAULT_BOT_WECHAT_NAME = '小聪明儿';

/** 机器人微信 ID（全局配置 `BOT_WECHAT_ID`）。 */
export function getBotWechatId(env: Env, message?: IncomingMessage): string {
    const configured = env.BOT_WECHAT_ID?.trim();
    if (configured) return configured;

    if (message?.source === 'private') {
        const botId = message.to.trim();
        if (botId) return botId;
    }

    return 'bot';
}

/** 机器人显示名称（全局配置 `BOT_WECHAT_NAME`）。 */
export function getBotWechatName(env: Env): string {
    return env.BOT_WECHAT_NAME?.trim() || DEFAULT_BOT_WECHAT_NAME;
}
