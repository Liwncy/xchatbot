import type {Env} from '../../types/env.js';
import {logger} from '../../utils/logger.js';
import {getDefaultLlmConfig, getLlmConfig} from './repository.js';
import {normalizeLlmType, type LlmConfig, type LlmType} from './types.js';

export interface LlmChatOptions {
    system?: string;
    user: string;
    imageUrl?: string;
    model?: string;
    name?: string;
    type?: LlmType;
    timeoutMs?: number;
}

export async function resolveLlmConfig(
    env: Env,
    name?: string,
    type: LlmType = 'chat',
): Promise<LlmConfig | null> {
    if (name?.trim()) {
        const named = await getLlmConfig(env, name.trim().toLowerCase());
        if (named?.status === 'active') return named;
        return null;
    }
    return getDefaultLlmConfig(env, normalizeLlmType(type));
}

async function resolveForRequest(env: Env, options: LlmChatOptions): Promise<LlmConfig | null> {
    if (options.name?.trim()) {
        const named = await resolveLlmConfig(env, options.name, options.type ?? 'chat');
        if (!named) return null;
        if (options.imageUrl && !named.supportImage) return null;
        return named;
    }
    return getDefaultLlmConfig(env, normalizeLlmType(options.type ?? 'chat'), {
        supportImage: Boolean(options.imageUrl),
    });
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
    const stripped = text.replace(/<think>[\s\S]*?<\/think>/giu, '').trim();
    const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(stripped);
    const body = (fenced?.[1] ?? stripped).trim();
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
        const parsed = JSON.parse(body.slice(start, end + 1)) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
    } catch {
        return null;
    }
}

const GATEWAY_MODEL = 'cnb/deepseek-v4-flash';

interface GatewayRoute {
    gateway: Fetcher;
    key: string;
    model: string;
}

/**
 * 纯文字、没点名配置和模型的请求，优先走 cf-worker 的 LLM 网关（和 cf-mcp-tools 同一条路）。
 * 没绑网关、没钥匙、要看图、点名了本地配置或模型，都不走这里。
 */
function gatewayRoute(env: Env, options: LlmChatOptions): GatewayRoute | null {
    if (options.name?.trim() || options.model?.trim() || options.imageUrl?.trim()) return null;
    if (normalizeLlmType(options.type ?? 'chat') !== 'chat') return null;
    const gateway = env.CF_WORKER;
    const key = env.GATEWAY_API_KEY?.trim();
    if (!gateway || !key) return null;
    return {gateway, key, model: env.LLM_GATEWAY_MODEL?.trim() || GATEWAY_MODEL};
}

type GatewayMessage = {role: 'system' | 'user'; content: string};

async function requestViaGateway(
    route: GatewayRoute,
    messages: GatewayMessage[],
    timeoutMs: number,
): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await route.gateway.fetch('https://cf-worker/v1/chat/completions', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${route.key}`,
            },
            body: JSON.stringify({model: route.model, messages, stream: false}),
            signal: controller.signal,
        });
        if (!response.ok) {
            const detail = (await response.text()).replace(/\s+/g, ' ').trim();
            throw new Error(`网关请求失败 ${response.status} ${detail.slice(0, 80)}`);
        }
        const data = await response.json() as {
            choices?: Array<{message?: {content?: string; reasoning_content?: string}}>;
        };
        const message = data.choices?.[0]?.message;
        const content = message?.content?.trim() ?? '';
        if (content) return content;
        // 推理模型有时把答案留在思考里，只有带 JSON 的才拿来用。
        const reasoning = message?.reasoning_content?.trim() ?? '';
        return reasoning.includes('{') ? reasoning : null;
    } finally {
        clearTimeout(timeout);
    }
}

export async function requestLlmText(env: Env, options: LlmChatOptions): Promise<string | null> {
    const user = options.user.trim();
    const imageUrl = options.imageUrl?.trim() ?? '';
    if (!user && !imageUrl) return null;

    const route = gatewayRoute(env, options);
    if (route) {
        const messages: GatewayMessage[] = [];
        const gatewaySystem = options.system?.trim();
        if (gatewaySystem) messages.push({role: 'system', content: gatewaySystem});
        messages.push({role: 'user', content: user});
        const gatewayTimeoutMs = Math.min(180_000, Math.max(1_000, options.timeoutMs ?? 60_000));
        try {
            const text = await requestViaGateway(route, messages, gatewayTimeoutMs);
            if (text) return text;
            logger.warn('网关没写出内容，改走本地小模型', {model: route.model});
        } catch (error) {
            logger.warn('网关没回，改走本地小模型', {
                model: route.model,
                error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
            });
        }
    }

    const config = await resolveForRequest(env, options);
    if (!config) return null;

    const messages: Array<{
        role: 'system' | 'user';
        content: string | Array<
            | {type: 'text'; text: string}
            | {type: 'image_url'; image_url: {url: string}}
        >;
    }> = [];
    const system = options.system?.trim();
    if (system) messages.push({role: 'system', content: system});
    if (imageUrl) {
        messages.push({
            role: 'user',
            content: [
                ...(user ? [{type: 'text' as const, text: user}] : []),
                {type: 'image_url', image_url: {url: imageUrl}},
            ],
        });
    } else {
        messages.push({role: 'user', content: user});
    }

    const timeoutMs = Math.min(180_000, Math.max(1_000, options.timeoutMs ?? 60_000));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
        response = await fetch(config.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: options.model?.trim() || config.model,
                stream: false,
                messages,
            }),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
    if (!response.ok) {
        throw new Error(`小模型请求失败 ${response.status}`);
    }
    const data = await response.json() as {choices?: Array<{message?: {content?: string}}>};
    return data.choices?.[0]?.message?.content?.trim() || null;
}

export async function requestLlmJson(
    env: Env,
    options: LlmChatOptions,
): Promise<Record<string, unknown> | null> {
    const text = await requestLlmText(env, options);
    return text ? extractJsonObject(text) : null;
}
