import type {Env} from '../../types/env.js';
import {getDefaultLlmConfig, getLlmConfig} from './repository.js';
import {normalizeLlmType, type LlmConfig, type LlmType} from './types.js';

export interface LlmChatOptions {
    system?: string;
    user: string;
    model?: string;
    name?: string;
    type?: LlmType;
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

export async function requestLlmText(env: Env, options: LlmChatOptions): Promise<string | null> {
    const config = await resolveLlmConfig(env, options.name, options.type ?? 'chat');
    if (!config) return null;
    const user = options.user.trim();
    if (!user) return null;

    const messages: Array<{role: 'system' | 'user'; content: string}> = [];
    const system = options.system?.trim();
    if (system) messages.push({role: 'system', content: system});
    messages.push({role: 'user', content: user});

    const response = await fetch(config.apiUrl, {
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
    });
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
