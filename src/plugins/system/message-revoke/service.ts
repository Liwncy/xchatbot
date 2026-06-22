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
    if (!owner) return '这个我还不能听你的';
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

function hasCompleteReferRevokeIds(
    referMessageId: NonNullable<NonNullable<IncomingMessage['quote']>['referMessageId']>,
): boolean {
    return referMessageId.newId > 0 && referMessageId.clientId != null && referMessageId.clientId > 0;
}

function buildRevokeParamFromQuote(
    receiver: string,
    referMessageId: NonNullable<NonNullable<IncomingMessage['quote']>['referMessageId']>,
): RevokeParam | null {
    if (!hasCompleteReferRevokeIds(referMessageId)) return null;
    return buildRevokeParam(
        receiver,
        referMessageId.clientId,
        referMessageId.newId,
        referMessageId.createTime,
    );
}

async function revokeOne(api: WechatApi, param: RevokeParam): Promise<boolean> {
    const result = await api.revokeMessage(param);
    return result.code === 0;
}

async function revokeQuotedMessage(
    message: IncomingMessage,
    env: Env,
): Promise<string> {
    if (!isQuotedBotMessage(message, env)) {
        return '只能撤我发的，别人的撤不了 🤔';
    }

    const quote = message.quote!;
    const referMessageId = quote.referMessageId;

    if (!referMessageId?.newId) {
        return '引用里没带消息 id，撤不了 🤔';
    }
    if (!hasCompleteReferRevokeIds(referMessageId)) {
        return '引用里 id 不全，撤不了 🤔';
    }

    const session = resolveChatSession(message);
    const receiver = resolveRevokeReceiver(message);
    const api = new WechatApi(env.WECHAT_API_BASE_URL!.trim());

    const tracked = await ChatLogRepository.findRevokableOutboundByNewId(
        env.XBOT_DB,
        session.sessionId,
        referMessageId.newId,
    );
    const param = tracked
        ? parseWechatRevokeFromPayload(tracked.payloadJson)
        : buildRevokeParamFromQuote(receiver, referMessageId);
    if (!param) {
        return '这条撤不了，引用信息不对';
    }

    const ok = await revokeOne(api, param);
    if (ok && tracked) {
        await ChatLogRepository.clearWechatRevokeMeta(env.XBOT_DB, tracked.messageId);
    }
    return ok ? '嗯，这条撤了 👌' : '撤不了，太久了 😅';
}

export async function revokeBotMessages(
    message: IncomingMessage,
    env: Env,
    count: number,
): Promise<string> {
    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
    if (!apiBaseUrl) {
        return '这会儿撤不了，等一下';
    }

    if (message.quote) {
        return revokeQuotedMessage(message, env);
    }

    if (!isChatLogEnabled(env)) {
        return '我这边记不太清，撤不了';
    }

    const session = resolveChatSession(message);
    const receiver = resolveRevokeReceiver(message);
    const api = new WechatApi(apiBaseUrl);

    const records = await ChatLogRepository.listRevokableOutbound(
        env.XBOT_DB,
        session.sessionId,
        count,
        {textOnly: true},
    );
    if (records.length === 0) {
        return '没找着能撤的文字 🤔 图片那些要引用再撤';
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
        return '撤不了，可能太久了 😅';
    }
    if (failed > 0) {
        return `撤了 ${success} 条，还有 ${failed} 条不行 😅`;
    }
    if (success === 1) {
        return '好了，撤了 👌';
    }
    return `好了，${success} 条都撤了 👌`;
}

export function buildRevokeHelpText(): string {
    return [
        '撤我发的：',
        '「撤回」— 最近一条文字',
        '「撤回 3」— 最近几条文字（最多十条）',
        '图片、表情这类 — 引用我发的那条，再发「撤回」',
        '',
        '只能撤我自己的，太久的不行哈',
    ].join('\n');
}
