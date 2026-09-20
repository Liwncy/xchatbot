export const LLM_TYPES = ['chat', 'embedding', 'rerank', 'image', 'speech'] as const;
export const LLM_STATUSES = ['active', 'disabled'] as const;

export type LlmType = (typeof LLM_TYPES)[number];
export type LlmStatus = (typeof LLM_STATUSES)[number];

export interface LlmConfig {
    name: string;
    type: LlmType;
    status: LlmStatus;
    apiUrl: string;
    apiKey: string;
    model: string;
    isDefault: boolean;
    updatedAt: number;
}

const TYPE_SET = new Set<string>(LLM_TYPES);

const TYPE_ALIAS: Record<string, LlmType> = {
    chat: 'chat',
    对话: 'chat',
    embedding: 'embedding',
    向量: 'embedding',
    rerank: 'rerank',
    重排: 'rerank',
    image: 'image',
    画图: 'image',
    speech: 'speech',
    语音: 'speech',
};

export function isLlmType(value: string): value is LlmType {
    return TYPE_SET.has(value);
}

export function parseLlmType(value: string | undefined): LlmType | null {
    const key = value?.trim().toLowerCase() ?? '';
    if (!key) return null;
    return TYPE_ALIAS[key] ?? (isLlmType(key) ? key : null);
}

export function normalizeLlmType(value: string | undefined): LlmType {
    return parseLlmType(value) ?? 'chat';
}

export function normalizeLlmStatus(value: string | null | undefined): LlmStatus {
    return value?.trim().toLowerCase() === 'disabled' ? 'disabled' : 'active';
}
