import type {Env, IncomingMessage} from '../../types/message.js';
import {KV_AI_DIALOG_CONFIG, KV_AI_DIALOG_GROUP_AUTO_REPLY_PREFIX, KV_AI_DIALOG_MEMORY_PREFIX, KV_AI_DIALOG_USER_ACTIVATION_PREFIX} from '../../constants/kv.js';
import {logger} from '../../utils/logger.js';

export interface AiDialogServiceConfig {
    base_url: string;
    model: string;
    api_key?: string;
    api_key_secret?: string;
}

export interface AiDialogConfig {
    default_service: string;
    default_prompt_key: string;
    max_history_count: number;
    user_activation_window_seconds: number;
    group_auto_reply_enabled: boolean;
    group_auto_reply_probability: number;
    group_auto_reply_cooldown_seconds: number;
    services: Record<string, AiDialogServiceConfig>;
    prompts: Record<string, string>;
}

export interface AiDialogHistoryMessage {
    role: 'user' | 'assistant';
    content: string;
}

const DEFAULT_PROMPT_KEY = 'default';
const DEFAULT_SYSTEM_PROMPT = '你是我的智能助手，协助我回答问题和提供信息。';
const ENV_FALLBACK_SERVICE_KEY = 'env-default';
const AI_DIALOG_HISTORY_TTL_SECONDS = 60 * 60;

type ServiceInputPatch = {
    base_url?: string | null;
    model?: string | null;
    api_key?: string | null;
    api_key_secret?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function normalizeString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}

function normalizeOptionalFieldValue(value: unknown): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') {
        throw new Error('字段值必须为字符串');
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'null' || trimmed === '空' || trimmed === '删除') return null;
    return trimmed;
}

function normalizeHistoryCount(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.floor(value));
    }
    if (typeof value === 'string') {
        const parsed = Number.parseInt(value.trim(), 10);
        if (Number.isFinite(parsed)) {
            return Math.max(0, parsed);
        }
    }
    return 0;
}

function normalizeBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on' || normalized === '开' || normalized === '开启';
}

function normalizePercentage(value: unknown, fallback = 0): number {
    const raw = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value.trim()) : Number.NaN;
    if (!Number.isFinite(raw)) return fallback;
    return Math.min(100, Math.max(0, Math.round(raw)));
}

function normalizeCooldownSeconds(value: unknown, fallback = 0): number {
    const raw = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value.trim(), 10) : Number.NaN;
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(0, Math.floor(raw));
}

function normalizeServiceConfig(value: unknown): AiDialogServiceConfig | null {
    const record = asRecord(value);
    if (!record) return null;

    const baseUrl = normalizeString(record.base_url) ?? normalizeString(record.baseUrl);
    const model = normalizeString(record.model);
    if (!baseUrl || !model) return null;

    const apiKey = normalizeString(record.api_key) ?? normalizeString(record.apiKey);
    const apiKeySecret = normalizeString(record.api_key_secret) ?? normalizeString(record.apiKeySecret);

    return {
        base_url: baseUrl,
        model,
        ...(apiKey ? {api_key: apiKey} : {}),
        ...(apiKeySecret ? {api_key_secret: apiKeySecret} : {}),
    };
}

function normalizePrompts(value: unknown, defaultPrompt: string): Record<string, string> {
    const record = asRecord(value);
    const prompts: Record<string, string> = {};

    if (record) {
        for (const [rawKey, rawValue] of Object.entries(record)) {
            const key = rawKey.trim();
            const prompt = normalizeString(rawValue);
            if (!key || !prompt) continue;
            prompts[key] = prompt;
        }
    }

    if (!prompts[DEFAULT_PROMPT_KEY]) {
        prompts[DEFAULT_PROMPT_KEY] = defaultPrompt;
    }

    return prompts;
}

function normalizeServices(value: unknown): Record<string, AiDialogServiceConfig> {
    const record = asRecord(value);
    const services: Record<string, AiDialogServiceConfig> = {};

    if (!record) return services;

    for (const [rawKey, rawValue] of Object.entries(record)) {
        const key = rawKey.trim();
        const service = normalizeServiceConfig(rawValue);
        if (!key || !service) continue;
        services[key] = service;
    }

    return services;
}

function selectDefaultService(config: AiDialogConfig): string {
    if (config.default_service && config.services[config.default_service]) {
        return config.default_service;
    }
    const firstKey = Object.keys(config.services)[0];
    return firstKey ?? '';
}

function selectDefaultPromptKey(config: AiDialogConfig): string {
    if (config.default_prompt_key && config.prompts[config.default_prompt_key]) {
        return config.default_prompt_key;
    }
    const firstKey = Object.keys(config.prompts)[0];
    return firstKey ?? DEFAULT_PROMPT_KEY;
}

export function buildAiDialogBaseConfig(env?: Pick<Env, 'AI_SYSTEM_PROMPT'>): AiDialogConfig {
    return {
        default_service: '',
        default_prompt_key: DEFAULT_PROMPT_KEY,
        max_history_count: 0,
        user_activation_window_seconds: 15,
        group_auto_reply_enabled: false,
        group_auto_reply_probability: 15,
        group_auto_reply_cooldown_seconds: 180,
        services: {},
        prompts: {
            [DEFAULT_PROMPT_KEY]: normalizeString(env?.AI_SYSTEM_PROMPT) ?? DEFAULT_SYSTEM_PROMPT,
        },
    };
}

export function normalizeAiDialogConfig(source: unknown, env?: Pick<Env, 'AI_SYSTEM_PROMPT'>): AiDialogConfig {
    const baseConfig = buildAiDialogBaseConfig(env);
    const record = asRecord(source);
    if (!record) return baseConfig;

    const config: AiDialogConfig = {
        default_service: normalizeString(record.default_service) ?? '',
        default_prompt_key: normalizeString(record.default_prompt_key) ?? baseConfig.default_prompt_key,
        max_history_count: normalizeHistoryCount(record.max_history_count),
        user_activation_window_seconds: normalizeCooldownSeconds(record.user_activation_window_seconds, baseConfig.user_activation_window_seconds),
        group_auto_reply_enabled: normalizeBoolean(record.group_auto_reply_enabled),
        group_auto_reply_probability: normalizePercentage(record.group_auto_reply_probability, baseConfig.group_auto_reply_probability),
        group_auto_reply_cooldown_seconds: normalizeCooldownSeconds(record.group_auto_reply_cooldown_seconds, baseConfig.group_auto_reply_cooldown_seconds),
        services: normalizeServices(record.services),
        prompts: normalizePrompts(record.prompts, baseConfig.prompts[DEFAULT_PROMPT_KEY]),
    };

    config.default_service = selectDefaultService(config);
    config.default_prompt_key = selectDefaultPromptKey(config);
    return config;
}

function buildEnvFallbackService(env: Pick<Env, 'AI_API_URL' | 'AI_API_KEY' | 'AI_MODEL'>): AiDialogServiceConfig | null {
    const baseUrl = normalizeString(env.AI_API_URL);
    if (!baseUrl) return null;
    const model = normalizeString(env.AI_MODEL) ?? 'gpt-4o-mini';
    const apiKey = normalizeString(env.AI_API_KEY);
    return {
        base_url: baseUrl,
        model,
        ...(apiKey ? {api_key: apiKey} : {}),
    };
}

export async function loadAiDialogPersistedConfig(env: Env): Promise<AiDialogConfig | null> {
    const raw = await env.XBOT_KV.get(KV_AI_DIALOG_CONFIG);
    if (!raw?.trim()) return null;
    try {
        const parsed = JSON.parse(raw) as unknown;
        return normalizeAiDialogConfig(parsed, env);
    } catch (error) {
        logger.warn('AI 对话配置解析失败，回退默认配置', {error});
        return null;
    }
}

export async function loadAiDialogRuntimeConfig(env: Env): Promise<AiDialogConfig> {
    const persisted = await loadAiDialogPersistedConfig(env);
    if (persisted) return persisted;

    const runtimeConfig = buildAiDialogBaseConfig(env);
    const fallbackService = buildEnvFallbackService(env);
    if (fallbackService) {
        runtimeConfig.services[ENV_FALLBACK_SERVICE_KEY] = fallbackService;
        runtimeConfig.default_service = ENV_FALLBACK_SERVICE_KEY;
    }
    return runtimeConfig;
}

export async function saveAiDialogConfig(env: Env, config: AiDialogConfig): Promise<void> {
    const normalized = normalizeAiDialogConfig(config, env);
    await env.XBOT_KV.put(KV_AI_DIALOG_CONFIG, JSON.stringify(normalized, null, 4));
}

export function getAiDialogPrompt(config: AiDialogConfig, promptKey?: string): string {
    const targetKey = normalizeString(promptKey) ?? config.default_prompt_key;
    return config.prompts[targetKey] ?? config.prompts[DEFAULT_PROMPT_KEY] ?? DEFAULT_SYSTEM_PROMPT;
}

function readNamedSecret(env: Env, secretName: string): string | undefined {
    const raw = (env as unknown as Record<string, unknown>)[secretName];
    return normalizeString(raw);
}

export interface ResolvedAiDialogService extends AiDialogServiceConfig {
    key: string;
    authSource: 'api_key' | 'api_key_secret' | 'none';
    resolvedApiKey?: string;
}

export function resolveAiDialogService(env: Env, config: AiDialogConfig, serviceKey?: string): ResolvedAiDialogService {
    const key = normalizeString(serviceKey) ?? config.default_service;
    if (!key) {
        throw new Error('尚未配置默认服务，请先新增服务并切换默认服务');
    }

    const service = config.services[key];
    if (!service) {
        throw new Error(`服务不存在：${key}`);
    }

    const directApiKey = normalizeString(service.api_key);
    if (directApiKey) {
        return {...service, key, authSource: 'api_key', resolvedApiKey: directApiKey};
    }

    const secretName = normalizeString(service.api_key_secret);
    if (secretName) {
        const secretValue = readNamedSecret(env, secretName);
        if (!secretValue) {
            throw new Error(`服务 ${key} 配置了 api_key_secret=${secretName}，但当前环境未设置对应 secret`);
        }
        return {...service, key, authSource: 'api_key_secret', resolvedApiKey: secretValue};
    }

    return {...service, key, authSource: 'none'};
}

function isHistoryRole(value: unknown): value is AiDialogHistoryMessage['role'] {
    return value === 'user' || value === 'assistant';
}

function normalizeHistoryMessages(value: unknown): AiDialogHistoryMessage[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
        const record = asRecord(item);
        if (!record) return [];
        const role = record.role;
        const content = normalizeString(record.content);
        if (!isHistoryRole(role) || !content) return [];
        return [{role, content}];
    });
}

function getConversationScope(message: IncomingMessage): string {
    if (message.room?.id?.trim()) {
        return `room:${message.room.id.trim()}`;
    }
    return `user:${message.from}`;
}

export function buildAiDialogMemoryKey(message: IncomingMessage): string {
    return `${KV_AI_DIALOG_MEMORY_PREFIX}${getConversationScope(message)}`;
}

export function buildAiDialogGroupAutoReplyCooldownKey(message: IncomingMessage): string {
    const roomId = message.room?.id?.trim();
    if (!roomId) {
        throw new Error('仅群聊消息支持冒泡冷却键');
    }
    return `${KV_AI_DIALOG_GROUP_AUTO_REPLY_PREFIX}${roomId}`;
}

export function buildAiDialogUserActivationKey(message: IncomingMessage): string {
    const userId = message.from.trim();
    if (!userId) {
        throw new Error('消息缺少发送者 ID，无法生成连续对话键');
    }
    return `${KV_AI_DIALOG_USER_ACTIVATION_PREFIX}${userId}`;
}

export async function loadAiDialogHistory(env: Env, message: IncomingMessage): Promise<AiDialogHistoryMessage[]> {
    const raw = await env.XBOT_KV.get(buildAiDialogMemoryKey(message));
    if (!raw?.trim()) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        return normalizeHistoryMessages(parsed);
    } catch (error) {
        logger.warn('AI 对话历史解析失败，已忽略旧数据', {error, messageId: message.messageId});
        return [];
    }
}

export function trimAiDialogHistory(history: AiDialogHistoryMessage[], maxHistoryCount: number): AiDialogHistoryMessage[] {
    if (maxHistoryCount <= 0) return [];
    const normalized = normalizeHistoryMessages(history);
    const maxMessageCount = Math.max(0, maxHistoryCount * 2);
    return normalized.slice(-maxMessageCount);
}

export async function saveAiDialogHistory(
    env: Env,
    message: IncomingMessage,
    history: AiDialogHistoryMessage[],
    maxHistoryCount: number,
): Promise<void> {
    const key = buildAiDialogMemoryKey(message);
    const trimmed = trimAiDialogHistory(history, maxHistoryCount);
    if (!trimmed.length) {
        await env.XBOT_KV.delete(key);
        return;
    }
    await env.XBOT_KV.put(key, JSON.stringify(trimmed), {expirationTtl: AI_DIALOG_HISTORY_TTL_SECONDS});
}

export async function clearAiDialogHistory(env: Env, message: IncomingMessage): Promise<void> {
    await env.XBOT_KV.delete(buildAiDialogMemoryKey(message));
}

function buildTransientExpiryPayload(windowSeconds: number): string {
    return JSON.stringify({expiresAt: Date.now() + (windowSeconds * 1000)});
}

async function isTransientKvFlagActive(env: Env, key: string): Promise<boolean> {
    const raw = await env.XBOT_KV.get(key);
    if (!raw?.trim()) return false;

    try {
        const parsed = JSON.parse(raw) as {expiresAt?: unknown};
        const expiresAt = typeof parsed.expiresAt === 'number' ? parsed.expiresAt : Number.NaN;
        if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
            return true;
        }
    } catch (error) {
        logger.warn('AI 对话短时状态解析失败，已按过期处理', {error, key});
    }

    await env.XBOT_KV.delete(key);
    return false;
}

async function saveTransientKvFlag(env: Env, key: string, windowSeconds: number): Promise<void> {
    if (windowSeconds <= 0) {
        await env.XBOT_KV.delete(key);
        return;
    }
    await env.XBOT_KV.put(key, buildTransientExpiryPayload(windowSeconds));
}

export async function isAiDialogGroupAutoReplyCoolingDown(env: Env, message: IncomingMessage): Promise<boolean> {
    if (!message.room?.id?.trim()) return false;
    return isTransientKvFlagActive(env, buildAiDialogGroupAutoReplyCooldownKey(message));
}

export async function markAiDialogGroupAutoReply(env: Env, message: IncomingMessage, cooldownSeconds: number): Promise<void> {
    if (!message.room?.id?.trim() || cooldownSeconds <= 0) return;
    await saveTransientKvFlag(env, buildAiDialogGroupAutoReplyCooldownKey(message), cooldownSeconds);
}

export async function isAiDialogUserActivationActive(env: Env, message: IncomingMessage): Promise<boolean> {
    const userId = message.from.trim();
    if (!userId) return false;
    return isTransientKvFlagActive(env, buildAiDialogUserActivationKey(message));
}

export async function markAiDialogUserActivation(env: Env, message: IncomingMessage, windowSeconds: number): Promise<void> {
    if (windowSeconds <= 0) return;
    const userId = message.from.trim();
    if (!userId) return;
    await saveTransientKvFlag(env, buildAiDialogUserActivationKey(message), windowSeconds);
}

export function maskSensitiveValue(value?: string): string {
    const normalized = normalizeString(value);
    if (!normalized) return '(未设置)';
    if (normalized.length <= 8) {
        return `${normalized.slice(0, 2)}***`;
    }
    return `${normalized.slice(0, 4)}***${normalized.slice(-4)}`;
}

export function buildServicePatch(input: unknown): ServiceInputPatch {
    const record = asRecord(input);
    if (!record) {
        throw new Error('服务配置必须是 JSON 对象');
    }

    return {
        base_url: normalizeOptionalFieldValue(record.base_url ?? record.baseUrl),
        model: normalizeOptionalFieldValue(record.model),
        api_key: normalizeOptionalFieldValue(record.api_key ?? record.apiKey),
        api_key_secret: normalizeOptionalFieldValue(record.api_key_secret ?? record.apiKeySecret),
    };
}

export function mergeAiDialogService(
    current: AiDialogServiceConfig | undefined,
    patch: ServiceInputPatch,
): AiDialogServiceConfig {
    const merged: AiDialogServiceConfig = {
        base_url: patch.base_url ?? current?.base_url ?? '',
        model: patch.model ?? current?.model ?? '',
        ...(patch.api_key === undefined
            ? current?.api_key
                ? {api_key: current.api_key}
                : {}
            : patch.api_key
                ? {api_key: patch.api_key}
                : {}),
        ...(patch.api_key_secret === undefined
            ? current?.api_key_secret
                ? {api_key_secret: current.api_key_secret}
                : {}
            : patch.api_key_secret
                ? {api_key_secret: patch.api_key_secret}
                : {}),
    };

    const normalized = normalizeServiceConfig(merged);
    if (!normalized) {
        throw new Error('服务配置不完整，至少需要 base_url 和 model');
    }
    return normalized;
}

export function listSortedKeys<T>(record: Record<string, T>): string[] {
    return Object.keys(record).sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

export const AI_DIALOG_DEFAULT_PROMPT_KEY = DEFAULT_PROMPT_KEY;




