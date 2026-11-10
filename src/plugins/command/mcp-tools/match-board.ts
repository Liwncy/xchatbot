/**
 * 记住这个会话刚列出的联赛或赛程，方便下一条直接回编号。
 */
import {callMcpTool, type McpToolResult} from '../../../mcp/client.js';
import {textReply, type HandlerResponse} from '../../../core/reply.js';
import type {IncomingMessage} from '../../../core/message.js';
import type {Env} from '../../../types/env.js';

const FALLBACK_URL = 'https://mcp.lwcfworker.dpdns.org/mcp';
const TTL_SECONDS = 2 * 60 * 60;

type BoardItem = {league?: string; match?: string};
type Board = {items: BoardItem[]};

type BoardCtx = {message: IncomingMessage; env: Env};

function boardKey(message: IncomingMessage): string {
    return `match:board:${message.platform}:${message.chatId}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function str(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export async function rememberMatchBoard(ctx: BoardCtx, result: McpToolResult): Promise<void> {
    const raw = asRecord(result.raw);
    const items: BoardItem[] = [];
    if (Array.isArray(raw?.matches)) {
        for (const item of raw.matches) {
            const row = asRecord(item);
            const match = str(row?.plain) || str(row?.key);
            if (match) items.push({match});
        }
    } else if (Array.isArray(raw?.leagues)) {
        for (const item of raw.leagues) {
            const name = str(asRecord(item)?.name);
            if (name) items.push({league: name});
        }
    }
    const key = boardKey(ctx.message);
    if (items.length === 0) {
        await ctx.env.XBOT_KV.delete(key);
        return;
    }
    await ctx.env.XBOT_KV.put(key, JSON.stringify({items} satisfies Board), {expirationTtl: TTL_SECONDS});
}

async function readBoard(ctx: BoardCtx): Promise<Board | null> {
    const raw = await ctx.env.XBOT_KV.get(boardKey(ctx.message), 'json');
    const items = asRecord(raw)?.items;
    if (!Array.isArray(items)) return null;
    return {items: items.filter((item): item is BoardItem => Boolean(asRecord(item)))};
}

function endpoint(env: Env): {url: string; token?: string} {
    const url = env.MCP_TOOLS_URL?.trim() || FALLBACK_URL;
    const token = env.MCP_TOOLS_TOKEN?.trim();
    return token ? {url, token} : {url};
}

function reportText(result: McpToolResult): string {
    const report = str(asRecord(result.raw)?.report);
    if (result.ok && report) return report.length > 3500 ? `${report.slice(0, 3500)}\n……后面略了` : report;
    const message = result.text?.trim() ?? '';
    if (message && !message.startsWith('{') && !message.startsWith('[')) return message;
    return '没查到，再试下';
}

async function callReport(ctx: BoardCtx, name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const target = endpoint(ctx.env);
    return callMcpTool(target.url, {name, arguments: args}, {token: target.token});
}

export async function openBoardItem(ctx: BoardCtx, index: number): Promise<HandlerResponse> {
    const board = await readBoard(ctx);
    const item = board?.items[index - 1];
    if (!item) return textReply('先发 #赛事赛程 看今天的');
    if (item.league) {
        const result = await callReport(ctx, 'match_schedule', {league: item.league});
        await rememberMatchBoard(ctx, result).catch(() => undefined);
        return textReply(reportText(result));
    }
    if (!item.match) return textReply('先发 #赛事赛程 看今天的');
    const result = await callReport(ctx, 'match_live_report', {match: item.match});
    return textReply(reportText(result));
}

export async function openMatchQuery(ctx: BoardCtx, match: string): Promise<HandlerResponse> {
    const result = await callReport(ctx, 'match_live_report', {match});
    return textReply(reportText(result));
}

export async function boardPick(ctx: BoardCtx, index: number): Promise<BoardItem | null> {
    const board = await readBoard(ctx);
    return board?.items[index - 1] ?? null;
}
