import type {Env} from '../../types/env.js';
import {KV_AI_SING_CONFIG} from '../../constants/kv.js';
import {logger} from '../../utils/logger.js';

export interface AiSingServiceConfig {
    base_url: string;
    model: string;
    api_key?: string;
    api_key_secret?: string;
}

export interface AiSingConfig {
    enabled: boolean;
    allow_group_use: boolean;
    allow_private_use: boolean;
    allow_theme_generate: boolean;
    allow_user_direct_lyrics: boolean;
    auto_upload_audio: boolean;
    default_voice: string;
    default_style_tags: string[];
    max_lyrics_chars: number;
    target_segment_seconds: number;
    service: AiSingServiceConfig;
}

export interface ResolvedAiSingService extends AiSingServiceConfig {
    authSource: 'api_key' | 'api_key_secret' | 'none';
    resolvedApiKey?: string;
}

const DEFAULT_TTS_API_URL = 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions';
const DEFAULT_TTS_MODEL = 'mimo-v2.5-tts';
const DEFAULT_TTS_SECRET = 'MIMO_API_KEY';
const DEFAULT_STYLE_TAGS = ['活泼', '轻快'];

export const AI_SING_PRESET_VOICES = [
    'mimo_default',
    '冰糖',
    '茉莉',
    '苏打',
    '白桦',
    'Mia',
    'Chloe',
    'Milo',
    'Dean',
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function normalizeString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value !== 'string') return fallback;
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', '开', '开启'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', '关', '关闭'].includes(normalized)) return false;
    return fallback;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
    const raw = typeof value === 'number'
        ? value
        : typeof value === 'string'
            ? Number.parseInt(value.trim(), 10)
            : Number.NaN;
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(0, Math.floor(raw));
}

function normalizeStyleTags(value: unknown): string[] {
    if (Array.isArray(value)) {
        const tags = value.flatMap((item) => normalizeString(item) ? [normalizeString(item) as string] : []);
        return [...new Set(tags)].slice(0, 5);
    }
    if (typeof value === 'string') {
        const tags = value.split(/[，,、]/u).map((item) => item.trim()).filter(Boolean);
        return [...new Set(tags)].slice(0, 5);
    }
    return [];
}

function normalizeServiceConfig(value: unknown): AiSingServiceConfig {
    const record = asRecord(value);
    const baseUrl = normalizeString(record?.base_url ?? record?.baseUrl) ?? DEFAULT_TTS_API_URL;
    const model = normalizeString(record?.model) ?? DEFAULT_TTS_MODEL;
    const apiKey = normalizeString(record?.api_key ?? record?.apiKey);
    const apiKeySecret = normalizeString(record?.api_key_secret ?? record?.apiKeySecret) ?? DEFAULT_TTS_SECRET;

    return {
        base_url: baseUrl,
        model,
        ...(apiKey ? {api_key: apiKey} : {}),
        ...(apiKeySecret ? {api_key_secret: apiKeySecret} : {}),
    };
}

function readNamedSecret(env: Env, secretName: string): string | undefined {
    const raw = (env as unknown as Record<string, unknown>)[secretName];
    return normalizeString(raw);
}

export function buildAiSingBaseConfig(): AiSingConfig {
    return {
        enabled: true,
        allow_group_use: true,
        allow_private_use: true,
        allow_theme_generate: true,
        allow_user_direct_lyrics: true,
        auto_upload_audio: false,
        default_voice: '冰糖',
        default_style_tags: [...DEFAULT_STYLE_TAGS],
        max_lyrics_chars: 64,
        target_segment_seconds: 18,
        service: normalizeServiceConfig(null),
    };
}

export function normalizeAiSingConfig(source: unknown): AiSingConfig {
    const baseConfig = buildAiSingBaseConfig();
    const record = asRecord(source);
    if (!record) return baseConfig;

    const defaultVoice = normalizeString(record.default_voice) ?? baseConfig.default_voice;
    const styleTags = normalizeStyleTags(record.default_style_tags);

    return {
        enabled: normalizeBoolean(record.enabled, baseConfig.enabled),
        allow_group_use: normalizeBoolean(record.allow_group_use, baseConfig.allow_group_use),
        allow_private_use: normalizeBoolean(record.allow_private_use, baseConfig.allow_private_use),
        allow_theme_generate: normalizeBoolean(record.allow_theme_generate, baseConfig.allow_theme_generate),
        allow_user_direct_lyrics: normalizeBoolean(record.allow_user_direct_lyrics, baseConfig.allow_user_direct_lyrics),
        auto_upload_audio: normalizeBoolean(record.auto_upload_audio, baseConfig.auto_upload_audio),
        default_voice: AI_SING_PRESET_VOICES.includes(defaultVoice as typeof AI_SING_PRESET_VOICES[number]) ? defaultVoice : baseConfig.default_voice,
        default_style_tags: styleTags.length ? styleTags : [...baseConfig.default_style_tags],
        max_lyrics_chars: normalizePositiveInteger(record.max_lyrics_chars, baseConfig.max_lyrics_chars) || baseConfig.max_lyrics_chars,
        target_segment_seconds: normalizePositiveInteger(record.target_segment_seconds, baseConfig.target_segment_seconds) || baseConfig.target_segment_seconds,
        service: normalizeServiceConfig(record.service),
    };
}

export async function loadAiSingPersistedConfig(env: Env): Promise<AiSingConfig | null> {
    const raw = await env.XBOT_KV.get(KV_AI_SING_CONFIG);
    if (!raw?.trim()) return null;
    try {
        return normalizeAiSingConfig(JSON.parse(raw) as unknown);
    } catch (error) {
        logger.warn('AI 唱歌配置解析失败，回退默认配置', {error});
        return null;
    }
}

export async function loadAiSingRuntimeConfig(env: Env): Promise<AiSingConfig> {
    return (await loadAiSingPersistedConfig(env)) ?? buildAiSingBaseConfig();
}

export async function saveAiSingConfig(env: Env, config: AiSingConfig): Promise<void> {
    await env.XBOT_KV.put(KV_AI_SING_CONFIG, JSON.stringify(normalizeAiSingConfig(config), null, 4));
}

export function resolveAiSingService(env: Env, config: AiSingConfig): ResolvedAiSingService {
    const service = normalizeServiceConfig(config.service);
    const directApiKey = normalizeString(service.api_key);
    if (directApiKey) {
        return {...service, authSource: 'api_key', resolvedApiKey: directApiKey};
    }

    const secretName = normalizeString(service.api_key_secret);
    if (secretName) {
        const secretValue = readNamedSecret(env, secretName);
        if (!secretValue) {
            throw new Error(`AI唱歌 服务配置了 api_key_secret=${secretName}，但当前环境未设置对应 secret`);
        }
        return {...service, authSource: 'api_key_secret', resolvedApiKey: secretValue};
    }

    return {...service, authSource: 'none'};
}

export function maskSensitiveValue(value?: string): string {
    const normalized = normalizeString(value);
    if (!normalized) return '(未设置)';
    if (normalized.length <= 8) {
        return `${normalized.slice(0, 2)}***`;
    }
    return `${normalized.slice(0, 4)}***${normalized.slice(-4)}`;
}

