import type {HandlerResponse, IncomingMessage, ReplyMessage, TextReply} from '../../../../types/message.js';
import {buildWechatChatRecordAppReply} from '../../../../wechat/chat-record.js';
import type {XiuxianCommand} from '../core/types/index.js';

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
    const nickname = cmd?.type === 'help' ? '修仙帮助' : '修仙助手';
    const chunks = splitIntoRecordChunks(content);

    return buildWechatChatRecordAppReply({
        title,
        summary: buildSummary(content),
        desc: chunks.length > 1 ? `${title}（共 ${chunks.length} 条）` : title,
        isChatRoom: message.source === 'group',
        items: chunks.map((chunk, index) => ({
            nickname: chunks.length > 1 ? `${nickname}${index + 1}` : nickname,
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

function splitIntoRecordChunks(content: string): string[] {
    const blocks = content
        .split(/\n\s*\n/g)
        .map((block) => block.trim())
        .filter(Boolean);
    if (!blocks.length) return [content];

    const chunks: string[] = [];
    let current = '';

    const flushCurrent = (): void => {
        const trimmed = current.trim();
        if (trimmed) chunks.push(trimmed);
        current = '';
    };

    const appendBlock = (block: string): void => {
        const next = current ? `${current}\n\n${block}` : block;
        if (next.length > MAX_CHUNK_LENGTH || lineCountOf(next) > MAX_CHUNK_LINES) {
            flushCurrent();
            if (block.length > MAX_CHUNK_LENGTH || lineCountOf(block) > MAX_CHUNK_LINES) {
                splitLargeBlock(block).forEach((part) => chunks.push(part));
                return;
            }
        }
        current = current ? `${current}\n\n${block}` : block;
    };

    for (const block of blocks) {
        appendBlock(block);
    }
    flushCurrent();

    return chunks.length ? chunks : splitLargeBlock(content);
}

function splitLargeBlock(block: string): string[] {
    const lines = block.split('\n');
    const chunks: string[] = [];
    let current: string[] = [];

    const flush = (): void => {
        const text = current.join('\n').trim();
        if (text) chunks.push(text);
        current = [];
    };

    for (const line of lines) {
        const next = current.length ? [...current, line].join('\n') : line;
        if (next.length > MAX_CHUNK_LENGTH || current.length + 1 > MAX_CHUNK_LINES) {
            flush();
        }
        if (line.length > MAX_CHUNK_LENGTH) {
            flush();
            chunks.push(...sliceLongLine(line));
            continue;
        }
        current.push(line);
    }
    flush();

    return chunks.length ? chunks : [block.trim()];
}

function sliceLongLine(line: string): string[] {
    const result: string[] = [];
    let rest = line.trim();
    while (rest.length > MAX_CHUNK_LENGTH) {
        result.push(rest.slice(0, MAX_CHUNK_LENGTH));
        rest = rest.slice(MAX_CHUNK_LENGTH).trim();
    }
    if (rest) result.push(rest);
    return result;
}

function lineCountOf(content: string): number {
    return content.split('\n').length;
}

