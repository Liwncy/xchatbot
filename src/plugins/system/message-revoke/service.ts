import type {Env} from '../../../types/env.js';
import type {IncomingMessage} from '../../../types/message.js';
import {NO_PERMISSION_REPLY} from '../../../constants/messages.js';
import {ChatLogRepository, isChatLogEnabled, resolveChatSession} from '../../../chat-log/index.js';
import {parseWechatRevokeFromPayload} from '../../../chat-log/revoke-meta.js';
import {getBotWechatId} from '../../../utils/bot.js';
import {WechatApi} from '../../../wechat';
import type {RevokeParam} from '../../../wechat/api/types.js';
import {buildRevokeParam} from '../../../wechat/outbound/extract-revoke-param.js';

const MAX_REVOKE_COUNT = 10;

export function ensureOwner(messageFrom: string, ownerWxid?: string): string | null {
    const owner = ownerWxid?.trim() ?? '';
    if (!owner) return '撤回功能还没找到主人，暂时不能操作哦';
    if (messageFrom.trim() !== owner) return NO_PERMISSION_REPLY;
    return null;
}

export function parseRevokeCount(content: string, quoteTitle?: string): number {
    const text = quoteTitle?.trim() || content.trim();
    const matched = text.match(/^撤回(?:\s+(\d+))?$/u);
    if (!matched) return 1;
    const parsed = matched[1] ? Number.parseInt(matched[1], 10) : 1;
    if (!Number.isFinite(parsed) || parsed <= 0) return 1;
    return Math.min(parsed, MAX_REVOKE_COUNT);
}

function resolveRevokeReceiver(message: IncomingMessage): string {
    const session = resolveChatSession(message);
    if (session.sessionType === 'group') {
        return session.sessionId;
    }
    return message.from.trim();
}

function isQuotedBotMessage(message: IncomingMessage, env: Env): boolean {
    const quote = message.quote;
    if (!quote) return false;

    const botId = getBotWechatId(env, message).trim();
    const referFrom = quote.referFrom?.trim() ?? '';
    if (botId && referFrom && referFrom === botId) {
        return true;
    }

    const botName = env.BOT_WECHAT_NAME?.trim();
    const referSenderName = quote.referSenderName?.trim();
    return Boolean(botName && referSenderName && referSenderName === botName);
}

async function revokeOne(api: WechatApi, param: RevokeParam): Promise<boolean> {
    const result = await api.revokeMessage(param);
    return result.code === 0;
}

export async function revokeBotMessages(
    message: IncomingMessage,
    env: Env,
    count: number,
): Promise<string> {
    if (!isChatLogEnabled(env)) {
        return '会话记录功能未开启，无法查找可撤回的消息。请开启 CHAT_LOG_ENABLE 后重试';
    }

    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
    if (!apiBaseUrl) {
        return '撤回功能还没接好线，稍等一下吧';
    }

    const session = resolveChatSession(message);
    const receiver = resolveRevokeReceiver(message);
    const api = new WechatApi(apiBaseUrl);

    if (message.quote && isQuotedBotMessage(message, env)) {
        const referMessageId = message.quote.referMessageId;
        if (!referMessageId?.newId) {
            return '引用的消息缺少撤回所需的信息，请改用「撤回」撤回最近发送的内容';
        }

        const tracked = await ChatLogRepository.findRevokableOutboundByNewId(
            env.XBOT_DB,
            session.sessionId,
            referMessageId.newId,
        );
        const param = tracked
            ? parseWechatRevokeFromPayload(tracked.payloadJson)
            : buildRevokeParam(
                receiver,
                referMessageId.newId,
                referMessageId.newId,
                referMessageId.createTime,
            );
        if (!param) {
            return '无法解析引用消息的撤回参数';
        }

        const ok = await revokeOne(api, param);
        if (ok && tracked) {
            await ChatLogRepository.clearWechatRevokeMeta(env.XBOT_DB, tracked.messageId);
        }
        return ok ? '✅ 已撤回引用的机器人消息' : '撤回失败了，这条消息可能已超过撤回时限';
    }

    const records = await ChatLogRepository.listRevokableOutbound(env.XBOT_DB, session.sessionId, count);
    if (records.length === 0) {
        return '没有找到可撤回的机器人消息。只能撤回机器人最近发送、且已被会话记录保存的消息';
    }

    let success = 0;
    let failed = 0;
    for (const record of records) {
        const param = parseWechatRevokeFromPayload(record.payloadJson);
        if (!param) {
            failed += 1;
            continue;
        }

        try {
            const ok = await revokeOne(api, {
                receiver: param.receiver || receiver,
                client_id: param.client_id,
                new_id: param.new_id,
                create_time: param.create_time,
            });
            if (ok) {
                success += 1;
                await ChatLogRepository.clearWechatRevokeMeta(env.XBOT_DB, record.messageId);
            } else {
                failed += 1;
            }
        } catch {
            failed += 1;
        }
    }

    if (success === 0) {
        return '撤回失败了，这些消息可能已超过撤回时限';
    }
    if (failed > 0) {
        return `✅ 已撤回 ${success} 条消息，另有 ${failed} 条撤回失败`;
    }
    return `✅ 已撤回 ${success} 条机器人消息`;
}

export function buildRevokeHelpText(): string {
    return [
        '机器人消息撤回（仅主人可用）：',
        '1) 撤回 — 撤回当前会话里机器人最近 1 条消息',
        '2) 撤回 3 — 撤回最近 3 条（最多 10 条）',
        '3) 引用机器人消息后发送「撤回」— 撤回指定消息',
        '',
        '说明：',
        '- 私聊和群聊均可使用',
        '- 只能撤回机器人自己发出的消息',
        '- 依赖会话记录（chat log）保存的微信消息 ID',
        '- 受微信撤回时限限制，过久的历史消息可能撤不回',
    ].join('\n');
}
