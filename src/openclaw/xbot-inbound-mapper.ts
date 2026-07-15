import type {IncomingMessage} from '../types/message.js';
import type {Env} from '../types/env.js';
import {resolveXbotChannelClientId} from './xbot-channel-config.js';

export interface XbotInboundPayload {
    accountId: string;
    clientId: string;
    connId: string;
    messageId: string;
    source: 'private' | 'group';
    from: string;
    senderName?: string;
    conversationId: string;
    roomId?: string;
    type: string;
    content?: string;
    timestamp: number;
    mentions?: string[];
    botMentioned?: boolean;
    wechatApiBaseUrl?: string;
}

function detectBotMention(content: string, env: Env): {mentions: string[]; botMentioned: boolean} {
    const mentions: string[] = [];
    let botMentioned = false;
    const botWechatId = env.BOT_WECHAT_ID?.trim() ?? '';
    const botName = env.BOT_WECHAT_NAME?.trim() || '小聪明儿';

    if (botWechatId) {
        if (content.includes(botWechatId)) {
            mentions.push(botWechatId);
            botMentioned = true;
        }
        if (content.includes(`@${botWechatId}`)) {
            botMentioned = true;
        }
    }
    if (botName) {
        if (content.includes(botName)) {
            botMentioned = true;
        }
        if (content.includes(`@${botName}`)) {
            botMentioned = true;
        }
    }
    return {mentions, botMentioned};
}

export function mapIncomingMessageToXbotInbound(
    message: IncomingMessage,
    env: Env,
    options?: {wechatApiBaseUrl?: string},
): XbotInboundPayload {
    const clientId = resolveXbotChannelClientId(env);
    const content = message.content?.trim() ?? '';
    const {mentions, botMentioned} = detectBotMention(content, env);
    const isGroup = message.source === 'group';
    const roomId = message.room?.id?.trim();
    const conversationId = isGroup ? (roomId ?? '') : message.from.trim();

    return {
        accountId: 'Primary',
        clientId,
        connId: clientId,
        messageId: message.messageId,
        source: isGroup ? 'group' : 'private',
        from: message.from,
        ...(message.senderName?.trim() ? {senderName: message.senderName.trim()} : {}),
        conversationId,
        ...(roomId ? {roomId} : {}),
        type: message.type,
        ...(content ? {content} : {}),
        timestamp: message.timestamp > 1_000_000_000_000
            ? message.timestamp
            : message.timestamp * 1000,
        mentions,
        botMentioned,
        ...(options?.wechatApiBaseUrl?.trim()
            ? {wechatApiBaseUrl: options.wechatApiBaseUrl.trim()}
            : {}),
    };
}
