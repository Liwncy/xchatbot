import type {Env} from '../../types/message.js';

export interface OpenAiLikeChoice {
    message?: {
        content?: string;
    };
}

export interface OpenAiLikeResponse {
    choices?: OpenAiLikeChoice[];
    output_text?: string;
    reply?: string;
}

export interface AiChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface RequestAiTextOptions {
    input: string;
    systemPrompt?: string;
    messages?: AiChatMessage[];
    model?: string;
}

type AiEnv = Pick<Env, 'AI_API_URL' | 'AI_API_KEY' | 'AI_MODEL'>;

export function normalizeAiText(data: OpenAiLikeResponse): string | null {
    const fromChoices = data.choices?.[0]?.message?.content?.trim();
    if (fromChoices) return fromChoices;

    const fromOutputText = data.output_text?.trim();
    if (fromOutputText) return fromOutputText;

    const fromReply = data.reply?.trim();
    if (fromReply) return fromReply;

    return null;
}

export async function requestAiText(env: AiEnv, options: RequestAiTextOptions): Promise<string | null> {
    const apiUrl = env.AI_API_URL?.trim();
    if (!apiUrl) return null;

    const input = options.input.trim();
    const systemPrompt = options.systemPrompt?.trim();
    const model = options.model?.trim() || env.AI_MODEL?.trim() || 'gpt-4o-mini';

    const headers: Record<string, string> = {'Content-Type': 'application/json'};
    if (env.AI_API_KEY?.trim()) {
        headers.Authorization = `Bearer ${env.AI_API_KEY.trim()}`;
    }

    const messages = options.messages?.length
        ? options.messages
        : [
            ...(systemPrompt ? [{role: 'system' as const, content: systemPrompt}] : []),
            {role: 'user' as const, content: input},
        ];

    const res = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model,
            input,
            messages,
        }),
    });

    if (!res.ok) {
        throw new Error(`status=${res.status} url=${apiUrl}`);
    }

    const data = (await res.json()) as OpenAiLikeResponse;
    return normalizeAiText(data);
}
