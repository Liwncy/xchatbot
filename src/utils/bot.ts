import type {Env} from '../types/env.js';
import type {IncomingMessage} from '../types/message.js';

const DEFAULT_BOT_WECHAT_NAME = '小聪明儿';

/** 小聪明儿默认头像（帮助 / 表情 / 聊天记录卡片共用）。 */
export const DEFAULT_BOT_AVATAR_URL =
    'https://wx.qlogo.cn/mmhead/ver_1/t4vmY8hTfx0rJnTygqKyIIX9PicUDwaEhib5Ex843gTJk7UVSKTcic4mlPt9rq2U7vMOJdXdHpdOSXoL0Ez8CicxWB3ojMh107wzggmTmKQn4bnxcL6lDVKx0mX91koST8x2/132';

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

/** 无 env 时的默认昵称（聊天记录卡片等）。 */
export function getDefaultBotWechatName(): string {
    return DEFAULT_BOT_WECHAT_NAME;
}
