import type {ArgsConfig, MatchMode} from './matcher.js';
import type {CommonReplyType} from './reply-builder.js';
import type {SharedRequestMode} from './shared.js';

export type RuleSourceType = 'static' | 'http';
export type RuleRequestMethod = 'GET' | 'POST';
export type RuleRequestMode = SharedRequestMode;
export type RuleReplyType = CommonReplyType;
export type RuleDefinitionCategory = 'common' | 'dynamic';

export interface RuleRequestConfig {
    headers?: Record<string, string>;
    body?: unknown;
    value?: unknown;
    timeoutMs?: number;
    auth?: unknown;
    [key: string]: unknown;
}

export interface RuleRuntimeBase {
    name?: string;
    description?: string;
    url: string;
    mode: RuleRequestMode;
    jsonPath?: string;
    rType: RuleReplyType;
    method?: RuleRequestMethod;
    headers?: Record<string, string>;
    body?: unknown;
    linkTitle?: string;
    linkDescription?: string;
    linkPicUrl?: string;
    voiceFormat?: number;
    voiceDurationMs?: number;
    voiceFallbackText?: string;
    cardUsername?: string;
    cardNickname?: string;
    cardAlias?: string;
    appType?: number;
    appXml?: string;
    sourceType?: RuleSourceType;
    requestConfig?: RuleRequestConfig;
    replyPayload?: Record<string, unknown>;
    staticValue?: unknown;
}

export interface SimpleRule extends RuleRuntimeBase {
    keyword: string | string[];
}

export interface DynamicRule extends RuleRuntimeBase {
    keyword?: string | string[];
    pattern?: string;
    matchMode?: MatchMode;
    args?: ArgsConfig;
}

export interface RuleDefinition {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    priority: number;
    matchType: MatchMode;
    triggerText?: string;
    pattern?: string;
    args?: ArgsConfig;
    sourceType: RuleSourceType;
    requestMethod?: RuleRequestMethod;
    requestUrl?: string;
    responseMode?: RuleRequestMode;
    responsePath?: string;
    requestConfig?: RuleRequestConfig;
    replyType: RuleReplyType;
    replyPayload?: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
}

export interface RuleDefinitionRow {
    id: string;
    name: string;
    description: string | null;
    enabled: number | null;
    priority: number | null;
    match_type: string | null;
    trigger_text: string | null;
    pattern: string | null;
    args_json: string | null;
    source_type: string | null;
    request_method: string | null;
    request_url: string | null;
    response_mode: string | null;
    response_path: string | null;
    request_config_json: string | null;
    reply_type: string | null;
    reply_payload_json: string | null;
    created_at: number | null;
    updated_at: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}

function normalizeOptionalInteger(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return undefined;
    return Math.floor(numeric);
}

function getPayloadObject(payload: unknown): Record<string, unknown> {
    return isRecord(payload) ? {...payload} : {};
}

function getPayloadString(payload: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
        const value = normalizeOptionalString(payload[key]);
        if (value) return value;
    }
    return undefined;
}

function getPayloadNumber(payload: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
        const value = normalizeOptionalInteger(payload[key]);
        if (value !== undefined) return value;
    }
    return undefined;
}

export function normalizeRuleRequestMethod(value: string | undefined): RuleRequestMethod | undefined {
    const normalized = (value ?? '').trim().toUpperCase();
    if (normalized === 'GET' || normalized === 'POST') return normalized;
    return undefined;
}

export function normalizeRuleRequestMode(value: string | undefined): RuleRequestMode | undefined {
    const normalized = (value ?? '').trim().toLowerCase();
    if (normalized === 'text' || normalized === 'json' || normalized === 'base64') return normalized;
    if (normalized === 'base') return 'base64';
    return undefined;
}

export function normalizeRuleReplyType(value: string | undefined): RuleReplyType | undefined {
    const normalized = (value ?? '').trim().toLowerCase();
    if (normalized === 'text'
        || normalized === 'image'
        || normalized === 'video'
        || normalized === 'voice'
        || normalized === 'link'
        || normalized === 'card'
        || normalized === 'app') {
        return normalized;
    }
    return undefined;
}

export function normalizeRuleSourceType(value: string | undefined): RuleSourceType | undefined {
    const normalized = (value ?? '').trim().toLowerCase();
    if (normalized === 'static' || normalized === 'http') return normalized;
    return undefined;
}

export function serializeKeyword(keyword: string | string[] | undefined): string | undefined {
    if (!keyword) return undefined;
    if (Array.isArray(keyword)) {
        const items = keyword.map((item) => item.trim()).filter(Boolean);
        return items.length ? items.join('|') : undefined;
    }
    const trimmed = keyword.trim();
    return trimmed || undefined;
}

export function parseJsonObject(value: string | null | undefined): Record<string, unknown> | undefined {
    if (!value?.trim()) return undefined;
    try {
        const parsed = JSON.parse(value) as unknown;
        return isRecord(parsed) ? {...parsed} : undefined;
    } catch {
        return undefined;
    }
}

export function rowToRuleDefinition(row: RuleDefinitionRow): RuleDefinition | null {
    const matchType = row.match_type === 'contains'
        || row.match_type === 'prefix'
        || row.match_type === 'exact'
        || row.match_type === 'regex'
        ? row.match_type
        : undefined;
    const sourceType = normalizeRuleSourceType(row.source_type ?? undefined);
    const replyType = normalizeRuleReplyType(row.reply_type ?? undefined);
    if (!row.id || !row.name || !matchType || !sourceType || !replyType) return null;

    const args = parseJsonObject(row.args_json);
    const requestConfig = parseJsonObject(row.request_config_json);
    const replyPayload = parseJsonObject(row.reply_payload_json);

    return {
        id: row.id,
        name: row.name.trim(),
        description: normalizeOptionalString(row.description ?? undefined),
        enabled: row.enabled !== 0,
        priority: normalizeOptionalInteger(row.priority) ?? 0,
        matchType,
        triggerText: normalizeOptionalString(row.trigger_text ?? undefined),
        pattern: normalizeOptionalString(row.pattern ?? undefined),
        args: args as ArgsConfig | undefined,
        sourceType,
        requestMethod: normalizeRuleRequestMethod(row.request_method ?? undefined),
        requestUrl: normalizeOptionalString(row.request_url ?? undefined),
        responseMode: normalizeRuleRequestMode(row.response_mode ?? undefined),
        responsePath: normalizeOptionalString(row.response_path ?? undefined),
        requestConfig,
        replyType,
        replyPayload,
        createdAt: normalizeOptionalInteger(row.created_at) ?? Date.now(),
        updatedAt: normalizeOptionalInteger(row.updated_at) ?? Date.now(),
    };
}

export function ruleDefinitionToRuntimeRule(definition: RuleDefinition): DynamicRule {
    const requestConfig = definition.requestConfig ? {...definition.requestConfig} : undefined;
    const replyPayload = definition.replyPayload ? {...definition.replyPayload} : undefined;
    const payload = getPayloadObject(replyPayload);

    return {
        name: definition.name,
        description: definition.description,
        keyword: definition.triggerText,
        pattern: definition.pattern,
        matchMode: definition.matchType,
        args: definition.args,
        url: definition.requestUrl ?? '',
        mode: definition.responseMode ?? 'text',
        jsonPath: definition.responsePath,
        rType: definition.replyType,
        method: definition.requestMethod,
        headers: isRecord(requestConfig?.headers) ? requestConfig?.headers as Record<string, string> : undefined,
        body: requestConfig?.body,
        sourceType: definition.sourceType,
        requestConfig,
        replyPayload,
        staticValue: requestConfig?.value,
        linkTitle: getPayloadString(payload, ['title', 'linkTitle']),
        linkDescription: getPayloadString(payload, ['description', 'linkDescription']),
        linkPicUrl: getPayloadString(payload, ['picUrl', 'linkPicUrl']),
        voiceFormat: getPayloadNumber(payload, ['format', 'voiceFormat']),
        voiceDurationMs: getPayloadNumber(payload, ['durationMs', 'voiceDurationMs']),
        voiceFallbackText: getPayloadString(payload, ['fallbackText', 'voiceFallbackText']),
        cardUsername: getPayloadString(payload, ['username', 'cardUsername']),
        cardNickname: getPayloadString(payload, ['nickname', 'cardNickname']),
        cardAlias: getPayloadString(payload, ['alias', 'cardAlias']),
        appType: getPayloadNumber(payload, ['appType']),
        appXml: getPayloadString(payload, ['appXml', 'xml']),
    };
}

