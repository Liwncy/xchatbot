import {resolveBotId, resolveBotName} from '../../../core/bot.js';
import {getRecentChatMessages} from '../../../core/chat-log/index.js';
import {resolveChatSession} from '../../../core/chat-log/session.js';
import type {ChatMessageRecord} from '../../../core/chat-log/types.js';
import {LLM_PROMPTS} from '../../../core/llm/prompts.js';
import {requestLlmText} from '../../../core/llm/client.js';
import type {IncomingMessage} from '../../../core/message.js';
import type {Env} from '../../../types/env.js';
import {logger} from '../../../utils/logger.js';

const WINDOW_MS = 10 * 60 * 1000;
const RECENT_LIMIT = 8;
const CLIP = 80;
const TIMEOUT_MS = 8_000;

const TYPE_LABEL: Record<string, string> = {
    image: '图片',
    emoji: '表情',
    voice: '语音',
    video: '视频',
    link: '链接',
    hongbao: '红包',
};

/** 只认整词「回」或「不回」。答非所问返回 null，调用方当不回。 */
export function parseJoinAnswer(raw: string): boolean | null {
    const stripped = raw.replace(/<think>[\s\S]*?<\/think>/giu, '').trim();
    const line = stripped.split(/\r?\n/u).map((item) => item.trim()).find(Boolean) ?? '';
    const word = line
        .replace(/^["'「『]|["'」』。.!！]+$/gu, '')
        .replace(/[。.!！\s]+$/u, '')
        .trim();
    if (word === '不回') return false;
    if (word === '回') return true;
    return null;
}

function clip(text: string): string {
    const flat = text.replace(/\s+/gu, ' ').trim();
    if (!flat || /^([a-z]:\\|\/|file:)/iu.test(flat)) return '';
    if (flat.length <= CLIP) return flat;
    return `${flat.slice(0, CLIP)}…`;
}

function spoken(type: string, content: string): string {
    const text = clip(content);
    const label = TYPE_LABEL[type] ?? '';
    if (text && type && type !== 'text') return `[${label || type}] ${text}`;
    if (text) return text;
    return `[${label || '消息'}]`;
}

function speakerOf(row: ChatMessageRecord, botName: string, botId: string): string {
    if (row.actorType === 'bot' || (botId && row.senderId === botId)) return botName;
    return row.senderName.trim() || '有人';
}

function judgeUser(recent: string[], current: string): string {
    const head = recent.length ? `近几句：\n${recent.join('\n')}\n\n` : '';
    return `${head}本条：\n${current}`;
}

/**
 * 自主模式里，没点名、不在跟聊窗、也不在名单上的消息先问小模型。
 * 回才继续进大脑；不回、超时、答非所问都当先不接。
 */
export async function shouldJoinChat(env: Env, message: IncomingMessage): Promise<boolean> {
    const botName = resolveBotName(env);
    const botId = resolveBotId(env, message.platform);
    try {
        const sinceUnix = Math.floor((Date.now() - WINDOW_MS) / 1000);
        const rows = await getRecentChatMessages(env, resolveChatSession(message).sessionId, {
            sinceUnix,
            limit: RECENT_LIMIT,
            excludeMessageId: message.messageId,
        });
        const recent = rows.map((row) => `${speakerOf(row, botName, botId)}: ${spoken(row.msgType, row.contentText)}`);
        const who = message.senderName?.trim() || '有人';
        const current = `${who}: ${spoken(message.type, message.content ?? '')}`;
        const raw = await requestLlmText(env, {
            type: 'chat',
            system: LLM_PROMPTS.groupJoin.replaceAll('小聪明儿', botName),
            user: judgeUser(recent, current),
            timeoutMs: TIMEOUT_MS,
        });
        if (!raw) {
            logger.warn('自主模式没判出来', {chatId: message.chatId});
            return false;
        }
        const answer = parseJoinAnswer(raw);
        if (answer == null) {
            logger.warn('自主模式答非所问', {chatId: message.chatId, raw: raw.slice(0, 40)});
            return false;
        }
        logger.info('自主模式看过了', {chatId: message.chatId, join: answer});
        return answer;
    } catch (error) {
        logger.warn('自主模式没问成', {
            chatId: message.chatId,
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}
