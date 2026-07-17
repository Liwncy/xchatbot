import type {IncomingMessage} from '../../../../types/message.js';
import {isHandledReply} from '../../../../types/reply.js';
import type {HandlerResponse, ReplyMessage, TextReply} from '../../../../types/reply.js';
import {DEFAULT_BOT_AVATAR_URL, getDefaultBotWechatName} from '../../../../utils/bot.js';
import {splitTextForChatRecord} from '../../../../utils/chat-record-chunks.js';
import {buildWechatChatRecordAppReply} from '../../../../wechat';
import type {XiuxianCommand} from '../core/types';

const LONG_TEXT_MIN_LENGTH = 220;
const LONG_TEXT_MIN_LINES = 12;
const MAX_CHUNK_LENGTH = 260;
const MAX_CHUNK_LINES = 10;

const CHAT_RECORD_COMMAND_TYPES = new Set<XiuxianCommand['type']>([
    'help',
    'bag',
    'ledger',
    'auctionList',
    'task',
    'achievement',
    'petPool',
    'petBag',
    'battleLog',
    'battleDetail',
    'bossRank',
    'bossLog',
    'bossDetail',
    'towerRank',
    'towerSeasonRank',
    'towerSeasonReward',
    'towerLog',
    'towerDetail',
    'bondLog',
    'npcEncounterLog',
]);

const COMMAND_TITLE_MAP: Partial<Record<XiuxianCommand['type'], string>> = {
    help: '修仙帮助',
    bag: '修仙背包',
    ledger: '修仙流水',
    auctionList: '修仙拍卖',
    task: '修仙任务',
    achievement: '修仙成就',
    petPool: '修仙卡池',
    petBag: '修仙宠包',
    battleLog: '修仙战报',
    battleDetail: '修仙战详',
    bossRank: '修仙伐榜',
    bossLog: '修仙伐报',
    bossDetail: '修仙伐详',
    towerRank: '修仙塔榜',
    towerSeasonRank: '修仙季榜',
    towerSeasonReward: '修仙季奖',
    towerLog: '修仙塔报',
    towerDetail: '修仙塔详',
    bondLog: '修仙情录',
    npcEncounterLog: '修仙奇录',
};

export function finalizeXiuxianReply(
    message: IncomingMessage,
    cmd: XiuxianCommand | null,
    response: HandlerResponse,
): HandlerResponse {
    if (!response) return response;
    if (isHandledReply(response)) return response;
    if (Array.isArray(response)) {
        return response.map((reply) => maybeConvertXiuxianReply(message, cmd, reply));
    }
    return maybeConvertXiuxianReply(message, cmd, response);
}

function maybeConvertXiuxianReply(
    message: IncomingMessage,
    cmd: XiuxianCommand | null,
    reply: ReplyMessage,
): ReplyMessage {
    if (!shouldUseChatRecordReply(cmd, reply)) return reply;
    const content = normalizeText(reply.content);
    if (!content) return reply;

    const title = resolveRecordTitle(cmd, content);
    const nickname = getDefaultBotWechatName();
    const chunks = splitTextForChatRecord(content, {
        maxLength: MAX_CHUNK_LENGTH,
        maxLines: MAX_CHUNK_LINES,
    });

    return buildWechatChatRecordAppReply({
        title,
        summary: buildSummary(content),
        desc: chunks.length > 1 ? `${title}（共 ${chunks.length} 条）` : title,
        isChatRoom: message.source === 'group',
        items: chunks.map((chunk, index) => ({
            nickname,
            avatarUrl: DEFAULT_BOT_AVATAR_URL,
            content: chunk,
            timestampMs: message.timestamp * 1000,
            localId: `${message.messageId}-${index + 1}`,
            messageId: `${message.messageId}-${index + 1}`,
        })),
    }, {
        to: reply.to,
        mentions: reply.mentions,
    });
}

function shouldUseChatRecordReply(cmd: XiuxianCommand | null, reply: ReplyMessage): reply is TextReply {
    if (reply.type !== 'text') return false;
    const content = normalizeText(reply.content);
    if (!content) return false;
    if (cmd && CHAT_RECORD_COMMAND_TYPES.has(cmd.type)) return true;
    const lineCount = content.split('\n').length;
    return content.length >= LONG_TEXT_MIN_LENGTH || lineCount >= LONG_TEXT_MIN_LINES;
}

function normalizeText(content: string): string {
    return content.replace(/\r\n/g, '\n').trim();
}

function resolveRecordTitle(cmd: XiuxianCommand | null, content: string): string {
    const mappedTitle = cmd ? COMMAND_TITLE_MAP[cmd.type] : undefined;
    if (mappedTitle) return mappedTitle;
    if (cmd?.type === 'help') {
        const firstLine = firstNonEmptyLine(content);
        return firstLine || '修仙帮助';
    }
    const firstLine = firstNonEmptyLine(content);
    if (!firstLine) return '修仙消息';
    return firstLine.length > 24 ? `${firstLine.slice(0, 24)}…` : firstLine;
}

function firstNonEmptyLine(content: string): string {
    return content.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
}

function buildSummary(content: string): string {
    const lines = content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 3);
    const summary = lines.join(' / ');
    return summary.length > 120 ? `${summary.slice(0, 120)}…` : summary;
}

