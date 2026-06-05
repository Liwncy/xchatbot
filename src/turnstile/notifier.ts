import type {Env} from '../types/env.js';
import {logger} from '../utils/logger.js';
import {WechatApi} from '../wechat';
import type {HumanVerifySession} from './shared.js';

export async function notifyUser(env: Env, session: HumanVerifySession): Promise<void> {
    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
    if (!apiBaseUrl) return;

    const api = new WechatApi(apiBaseUrl);
    const baseContent = session.status === 'human'
        ? `🎉 恭喜，经权威认证 TA 是人类！\n会话ID: ${session.id}`
        : `🤖 很遗憾，TA 未能证明自己是人类。\n会话ID: ${session.id}\n错误: ${(session.verifyErrorCodes ?? []).join(', ') || 'unknown'}`;

    const isGroupSource = Boolean(session.roomId?.trim());
    const receiver = isGroupSource ? (session.roomId?.trim() ?? session.requesterId) : session.requesterId;
    const remind = isGroupSource ? session.requesterId : undefined;
    const mentionName = session.requesterName?.trim() || '你';
    const content = isGroupSource ? `@${mentionName}\n${baseContent}` : baseContent;

    try {
        const result = await api.sendText({receiver, content, remind});
        if (result.code !== 0) {
            logger.warn('Turnstile 验证结果通知发送失败', {
                receiver,
                remind,
                code: result.code,
                message: result.message,
            });
        }
    } catch (error) {
        logger.warn('Turnstile 验证结果通知异常', {
            receiver,
            remind,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

