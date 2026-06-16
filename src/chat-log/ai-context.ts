import type {Env} from '../types/env.js';
import type {IncomingMessage} from '../types/message.js';
import {buildInboundSpeakerLine, isAiContextMsgType, isChatLogEnabled, toAiDialogLine} from './normalize.js';
import {ChatLogRepository} from './repository.js';
import {resolveChatSession} from './session.js';

export interface AiContextMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface LoadAiDialogContextOptions {
    maxHistoryCount: number;
    maxChars?: number;
}

function resolveMessageLimit(maxHistoryCount: number): number {
    if (maxHistoryCount <= 0) return 0;
    return Math.max(2, maxHistoryCount * 2);
}

export async function loadAiDialogContextFromChatLog(
    env: Env,
    message: IncomingMessage,
    options: LoadAiDialogContextOptions,
): Promise<AiContextMessage[]> {
    if (!isChatLogEnabled(env) || options.maxHistoryCount <= 0) {
        return [];
    }

    const session = resolveChatSession(message);
    const limit = resolveMessageLimit(options.maxHistoryCount);
    const recent = await ChatLogRepository.getRecentMessages(env.XBOT_DB, session.sessionId, {
        limit,
        maxChars: options.maxChars ?? 8000,
        excludeMessageId: message.messageId,
    });

    const history: AiContextMessage[] = [];
    for (const row of recent) {
        if (!isAiContextMsgType(row.msgType)) continue;
        const converted = toAiDialogLine({
            actorType: row.actorType,
            direction: row.direction,
            senderName: row.senderName,
            contentText: row.contentText,
            sessionType: row.sessionType,
        });
        if (converted) {
            history.push(converted);
        }
    }

    return history;
}

export function buildCurrentAiDialogUserLine(
    message: IncomingMessage,
    prompt: string,
): AiContextMessage {
    const contentText = prompt.trim();
    return {
        role: 'user',
        content: buildInboundSpeakerLine(message, contentText),
    };
}

export async function buildAiDialogMessagesFromChatLog(
    env: Env,
    message: IncomingMessage,
    prompt: string,
    options: LoadAiDialogContextOptions,
): Promise<AiContextMessage[]> {
    const history = await loadAiDialogContextFromChatLog(env, message, options);
    const currentLine = buildCurrentAiDialogUserLine(message, prompt);

    const last = history.at(-1);
    if (last?.role === 'user' && last.content === currentLine.content) {
        return history;
    }

    return [...history, currentLine];
}
