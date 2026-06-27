import {logger} from '../../../utils/logger.js';
import {resolveChatCompletionsUrl} from './config.js';
import {AGENT_BRIDGE_SYSTEM_PROMPT} from './system-prompt.js';
import type {AgentBridgeRuntimeConfig, OpenClawChatCompletionResponse} from './types.js';

export interface OpenClawChatRequest {
    userId: string;
    prompt: string;
    conversationId?: string;
}

export interface OpenClawChatResult {
    content: string;
    conversationId?: string;
}

function extractAssistantContent(data: OpenClawChatCompletionResponse): string | null {
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return null;
    const trimmed = content.trim();
    return trimmed || null;
}

export async function requestOpenClawChat(
    config: AgentBridgeRuntimeConfig,
    request: OpenClawChatRequest,
): Promise<OpenClawChatResult> {
    const url = resolveChatCompletionsUrl(config.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);

    const body: Record<string, unknown> = {
        model: config.model,
        messages: [
            {role: 'system', content: AGENT_BRIDGE_SYSTEM_PROMPT},
            {role: 'user', content: request.prompt},
        ],
        stream: false,
        user: request.userId,
    };
    if (request.conversationId?.trim()) {
        body.conversation_id = request.conversationId.trim();
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        const rawText = await response.text();
        let data: OpenClawChatCompletionResponse | null = null;
        if (rawText.trim()) {
            try {
                data = JSON.parse(rawText) as OpenClawChatCompletionResponse;
            } catch {
                data = null;
            }
        }

        if (!response.ok) {
            const detail = data?.error?.message?.trim()
                || rawText.trim().slice(0, 300)
                || `HTTP ${response.status}`;
            logger.warn('Agent 桥接请求失败', {status: response.status, detail, url});
            throw new Error(detail);
        }

        const content = data ? extractAssistantContent(data) : null;
        if (!content) {
            throw new Error('Agent 没返回可用内容');
        }

        const conversationId = normalizeOptionalString(data?.conversation_id);

        return {
            content,
            ...(conversationId ? {conversationId} : {}),
        };
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Agent 超时了（>${config.requestTimeoutMs}ms）`);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

function normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}
