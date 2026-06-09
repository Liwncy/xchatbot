import type {IncomingMessage} from '../../../types/message.js';
import type {Env} from '../../../types/env.js';
import type {HandlerResponse} from '../../../types/reply.js';
import {logger} from '../../../utils/logger.js';
import {queryAgnesVideoTask} from './client.js';
import {AGNES_VIDEO_QUERY_PREFIX} from './constants.js';
import {resolveAgnesVideoConfig} from './config.js';
import {
    buildConfigMissingReply,
    buildProgressReply,
    buildQueryFailedReply,
    buildTicketForbiddenReply,
    buildTicketNotFoundReply,
    buildVideoReply,
} from './reply.js';
import {loadAgnesVideoTicket} from './storage.js';

function parseQueryTicket(content: string): string | null {
    const trimmed = content.trim();
    if (!trimmed.startsWith(AGNES_VIDEO_QUERY_PREFIX)) return null;

    const rest = trimmed.slice(AGNES_VIDEO_QUERY_PREFIX.length).trim();
    const match = rest.match(/^(\d{6})$/);
    return match?.[1] ?? null;
}

function matchesSession(record: {from: string; roomId?: string}, message: IncomingMessage): boolean {
    if (record.from !== message.from) return false;
    const recordRoom = record.roomId ?? '';
    const messageRoom = message.room?.id ?? '';
    return recordRoom === messageRoom;
}

export function matchesAgnesVideoQuery(content: string): boolean {
    return parseQueryTicket(content) !== null;
}

export async function handleAgnesVideoQuery(
    message: IncomingMessage,
    env: Env,
): Promise<HandlerResponse | null> {
    const ticket = parseQueryTicket(message.content ?? '');
    if (!ticket) return null;

    const config = resolveAgnesVideoConfig(env);
    if (!config) {
        return buildConfigMissingReply();
    }

    const record = await loadAgnesVideoTicket(env, ticket);
    if (!record) return buildTicketNotFoundReply(ticket);
    if (!matchesSession(record, message)) return buildTicketForbiddenReply();

    try {
        const query = await queryAgnesVideoTask(config, record.videoId);
        if (query.status === 'completed') {
            return buildVideoReply(record, query);
        }
        return buildProgressReply(record, query);
    } catch (error) {
        logger.error('Agnes 绘影查询失败', {
            ticket,
            videoId: record.videoId,
            error: error instanceof Error ? error.message : String(error),
        });
        return buildQueryFailedReply(record.ticket);
    }
}
