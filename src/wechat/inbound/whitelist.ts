import type {IncomingMessage} from '../../types/message.js';
import type {Env} from '../../types/env.js';
import {logger} from '../../utils/logger.js';
import {ContactRepository} from '../../plugins/system/contact-admin';

const SYSTEM_SENDER_IDS = new Set(['weixin', 'fmessage', 'medianote', 'floatbottle']);

function isLikelySystemOrOfficialSender(wxid: string): boolean {
    const id = wxid.trim();
    if (!id) return false;
    if (SYSTEM_SENDER_IDS.has(id)) return true;
    if (id.startsWith('gh_')) return true;
    return false;
}

export async function shouldAllowWechatMessage(
    message: IncomingMessage,
    env: Env,
    options?: { apiBaseUrl?: string },
): Promise<boolean> {
    const ownerWxid = env.BOT_OWNER_WECHAT_ID?.trim() ?? '';
    const apiBaseUrl = options?.apiBaseUrl ?? env.WECHAT_API_BASE_URL ?? '';

    if (ownerWxid && message.from === ownerWxid) {
        return true;
    }

    if (message.source === 'official' || isLikelySystemOrOfficialSender(message.from)) {
        logger.debug('消息被白名单过滤（公众号/系统号）', {
            source: message.source,
            from: message.from,
        });
        return false;
    }

    if (message.source === 'private') {
        if (!apiBaseUrl) {
            logger.debug('消息被白名单过滤（私聊缺少 API 配置）', {
                source: message.source,
                from: message.from,
            });
            return false;
        }
        const allowed = await ContactRepository.isUserContactAllowed(env.XBOT_DB, message.from);
        if (!allowed) {
            logger.debug('消息被白名单过滤（私聊联系人未开启）', {
                source: message.source,
                from: message.from,
            });
            return false;
        }
        return true;
    }

    if (message.source === 'group') {
        if (!apiBaseUrl || !message.room?.id) {
            logger.debug('消息被白名单过滤（群聊缺少配置或群ID）', {
                source: message.source,
                roomId: message.room?.id,
                hasApiBaseUrl: Boolean(apiBaseUrl),
            });
            return false;
        }
        const allowed = await ContactRepository.isGroupContactAllowed(env.XBOT_DB, message.room.id);
        if (!allowed) {
            logger.debug('消息被白名单过滤（群聊不在联系人列表）', {
                source: message.source,
                roomId: message.room.id,
            });
            return false;
        }
        return true;
    }

    logger.debug('消息被白名单过滤（非私聊且非联系人群聊）', {
        source: message.source,
        from: message.from,
    });
    return false;
}
