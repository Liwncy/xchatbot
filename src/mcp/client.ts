import {logger} from '../utils/logger.js';

export interface McpToolCall {
    name: string;
    arguments: Record<string, unknown>;
}

export interface McpToolResult {
    ok: boolean;
    text?: string;
    replyText?: string;
    raw: unknown;
}

interface JsonRpcResponse {
    result?: {
        content?: Array<{type?: string; text?: string}>;
        isError?: boolean;
    };
    error?: {message?: string};
}

const PROTOCOL_VERSION = '2024-11-05';

function parseSseData(text: string): unknown {
    const lines = text.split('\n').filter((line) => line.startsWith('data:'));
    const last = lines.at(-1)?.slice(5).trim();
    return last ? JSON.parse(last) as unknown : null;
}

async function readMcpBody(response: Response): Promise<{sessionId?: string; body: unknown}> {
    const sessionId = response.headers.get('mcp-session-id') ?? undefined;
    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();
    if (!text.trim()) return {sessionId, body: null};
    if (contentType.includes('text/event-stream')) {
        return {sessionId, body: parseSseData(text)};
    }
    return {sessionId, body: JSON.parse(text) as unknown};
}

async function postMcp(
    url: string,
    body: unknown,
    options: {token?: string; sessionId?: string},
): Promise<{sessionId?: string; body: unknown}> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
    };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.sessionId) headers['mcp-session-id'] = options.sessionId;

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`MCP HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }
    return readMcpBody(response);
}

function extractToolPayload(body: unknown): McpToolResult {
    const rpc = body as JsonRpcResponse;
    if (rpc.error?.message) {
        return {ok: false, text: rpc.error.message, raw: body};
    }
    const text = rpc.result?.content
        ?.filter((item) => item.type === 'text' && item.text)
        .map((item) => item.text ?? '')
        .join('\n')
        .trim() ?? '';

    if (!text) {
        return {ok: !rpc.result?.isError, raw: body};
    }

    try {
        const parsed = JSON.parse(text) as {ok?: boolean; text?: string; replyText?: string; message?: string};
        return {
            ok: parsed.ok !== false && !rpc.result?.isError,
            text: parsed.text ?? parsed.message,
            replyText: parsed.replyText,
            raw: parsed,
        };
    } catch {
        return {ok: !rpc.result?.isError, text, raw: body};
    }
}

export async function callMcpTool(
    url: string,
    call: McpToolCall,
    options?: {token?: string},
): Promise<McpToolResult> {
    const initialize = await postMcp(url, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: {name: 'xchatbot', version: '0.2.0'},
        },
    }, {token: options?.token});

    if (initialize.sessionId) {
        await postMcp(url, {
            jsonrpc: '2.0',
            method: 'notifications/initialized',
        }, {token: options?.token, sessionId: initialize.sessionId});
    }

    const result = await postMcp(url, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
            name: call.name,
            arguments: call.arguments,
        },
    }, {token: options?.token, sessionId: initialize.sessionId});

    const mapped = extractToolPayload(result.body);
    if (!mapped.ok) {
        logger.warn('MCP 工具调用失败', {name: call.name, raw: mapped.raw});
    }
    return mapped;
}
