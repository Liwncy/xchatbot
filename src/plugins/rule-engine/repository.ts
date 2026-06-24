import type {Env} from '../../types/env.js';
import {normalizeKeyword, normalizeMatchMode, type ArgsConfig} from './matcher.js';
import {
    normalizeRuleReplyType,
    normalizeRuleRequestMethod,
    normalizeRuleRequestMode,
    rowToRuleDefinition,
    ruleDefinitionToRuntimeRule,
    serializeKeyword,
    type DynamicRule,
    type RuleDefinition,
    type RuleDefinitionRow,
    type RuleRequestConfig,
} from './model.js';
import type {RulePluginCategory} from '../system/plugin-admin/plugin-admin-types.js';

type LegacyCommonRule = {
    name?: unknown;
    description?: unknown;
    keyword?: unknown;
    url?: unknown;
    mode?: unknown;
    jsonPath?: unknown;
    fileType?: unknown;
    rType?: unknown;
    method?: unknown;
    headers?: unknown;
    body?: unknown;
    requestConfig?: unknown;
    replyPayload?: unknown;
    linkTitle?: unknown;
    linkDescription?: unknown;
    linkPicUrl?: unknown;
    voiceFormat?: unknown;
    voiceDurationMs?: unknown;
    voiceFallbackText?: unknown;
    cardUsername?: unknown;
    cardNickname?: unknown;
    cardAlias?: unknown;
    appType?: unknown;
    appXml?: unknown;
};

type LegacyDynamicRule = LegacyCommonRule & {
    pattern?: unknown;
    matchMode?: unknown;
    args?: unknown;
};

const RULE_ENGINE_D1_MIGRATED_KV_KEY = 'rule-engine:d1:migrated';
let schemaReady: Promise<void> | null = null;
let runtimeCache: {
    expiresAt: number;
    byCategory: Partial<Record<'common' | 'dynamic', DynamicRule[]>>;
} | null = null;

const RULE_ID_PREFIX_MAP = {
    common: 'common:',
    dynamic: 'dynamic:',
} as const;

function isUsableDb(db: D1Database | undefined): db is D1Database {
    return Boolean(db && typeof db.prepare === 'function');
}

function normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return undefined;
    return Math.floor(numeric);
}

function normalizeKeywordValue(value: unknown): string | string[] | undefined {
    if (typeof value === 'string') {
        const keywords = normalizeKeyword(value);
        if (!keywords.length) return undefined;
        return keywords.length === 1 ? keywords[0] : keywords;
    }
    if (Array.isArray(value)) {
        const keywords = value
            .map((item) => (typeof item === 'string' ? item : ''))
            .flatMap((item) => item.split('|'))
            .map((item) => item.trim())
            .filter(Boolean);
        if (!keywords.length) return undefined;
        return keywords.length === 1 ? keywords[0] : keywords;
    }
    return undefined;
}

function normalizeHeaders(value: unknown): Record<string, string> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const headers: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (typeof entry !== 'string') continue;
        headers[key] = entry;
    }
    return Object.keys(headers).length ? headers : undefined;
}

function normalizeOptionalJsonObject(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return {...(value as Record<string, unknown>)};
}

function normalizeArgs(value: unknown): ArgsConfig | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const raw = value as Record<string, unknown>;
    const mode = normalizeOptionalString(raw.mode);
    const delimiter = normalizeOptionalString(raw.delimiter);
    const names = Array.isArray(raw.names)
        ? raw.names.map((item) => normalizeOptionalString(item)).filter((item): item is string => Boolean(item))
        : undefined;
    const required = Array.isArray(raw.required)
        ? raw.required.map((item) => normalizeOptionalString(item)).filter((item): item is string => Boolean(item))
        : undefined;
    if (!mode && !delimiter && !names?.length && !required?.length) return undefined;
    return {
        ...(mode ? {mode: mode as ArgsConfig['mode']} : {}),
        ...(delimiter ? {delimiter} : {}),
        ...(names?.length ? {names} : {}),
        ...(required?.length ? {required} : {}),
    };
}

function normalizeReplyPayload(rawRule: LegacyCommonRule): Record<string, unknown> | undefined {
    const payload: Record<string, unknown> = {
        ...(normalizeOptionalJsonObject(rawRule.replyPayload) ?? {}),
    };
    if (typeof rawRule.linkTitle === 'string' && rawRule.linkTitle.trim()) payload.title = rawRule.linkTitle.trim();
    if (typeof rawRule.linkDescription === 'string' && rawRule.linkDescription.trim()) payload.description = rawRule.linkDescription.trim();
    if (typeof rawRule.linkPicUrl === 'string' && rawRule.linkPicUrl.trim()) payload.picUrl = rawRule.linkPicUrl.trim();
    const voiceFormat = normalizeOptionalNumber(rawRule.voiceFormat);
    if (voiceFormat !== undefined) payload.format = voiceFormat;
    const voiceDurationMs = normalizeOptionalNumber(rawRule.voiceDurationMs);
    if (voiceDurationMs !== undefined) payload.durationMs = voiceDurationMs;
    if (typeof rawRule.voiceFallbackText === 'string' && rawRule.voiceFallbackText.trim()) payload.fallbackText = rawRule.voiceFallbackText.trim();
    if (typeof rawRule.cardUsername === 'string' && rawRule.cardUsername.trim()) payload.username = rawRule.cardUsername.trim();
    if (typeof rawRule.cardNickname === 'string' && rawRule.cardNickname.trim()) payload.nickname = rawRule.cardNickname.trim();
    if (typeof rawRule.cardAlias === 'string' && rawRule.cardAlias.trim()) payload.alias = rawRule.cardAlias.trim();
    const appType = normalizeOptionalNumber(rawRule.appType);
    if (appType !== undefined) payload.appType = appType;
    if (typeof rawRule.appXml === 'string' && rawRule.appXml.trim()) payload.appXml = rawRule.appXml.trim();
    return Object.keys(payload).length ? payload : undefined;
}

function buildRequestConfig(rawRule: LegacyCommonRule): RuleRequestConfig | undefined {
    const headers = normalizeHeaders(rawRule.headers);
    const hasBody = Object.prototype.hasOwnProperty.call(rawRule, 'body');
    const requestConfig: RuleRequestConfig = {
        ...(normalizeOptionalJsonObject(rawRule.requestConfig) ?? {}),
        ...(headers ? {headers} : {}),
        ...(hasBody ? {body: rawRule.body} : {}),
    };
    return Object.keys(requestConfig).length ? requestConfig : undefined;
}

function buildRuleId(name: string, kind: 'common' | 'dynamic'): string {
    return `${kind}:${name.trim()}`;
}

function getRuleIdPrefix(category: Extract<RulePluginCategory, 'common' | 'dynamic'>): string {
    return RULE_ID_PREFIX_MAP[category];
}

function commonRawToDefinition(rawRule: LegacyCommonRule): RuleDefinition | null {
    const name = normalizeOptionalString(rawRule.name);
    const keyword = normalizeKeywordValue(rawRule.keyword);
    const requestUrl = normalizeOptionalString(rawRule.url);
    const responseMode = normalizeRuleRequestMode(normalizeOptionalString(rawRule.mode));
    const replyType = normalizeRuleReplyType(normalizeOptionalString(rawRule.rType) ?? normalizeOptionalString(rawRule.fileType));
    if (!name || !keyword || !requestUrl || !responseMode || !replyType) return null;

    const now = Date.now();
    return {
        id: buildRuleId(name, 'common'),
        name,
        description: normalizeOptionalString(rawRule.description),
        enabled: true,
        priority: 0,
        matchType: 'contains',
        triggerText: serializeKeyword(keyword),
        sourceType: 'http',
        requestMethod: normalizeRuleRequestMethod(normalizeOptionalString(rawRule.method)) ?? 'GET',
        requestUrl,
        responseMode,
        responsePath: normalizeOptionalString(rawRule.jsonPath),
        requestConfig: buildRequestConfig(rawRule),
        replyType,
        replyPayload: normalizeReplyPayload(rawRule),
        createdAt: now,
        updatedAt: now,
    };
}

function dynamicRawToDefinition(rawRule: LegacyDynamicRule): RuleDefinition | null {
    const name = normalizeOptionalString(rawRule.name);
    const requestUrl = normalizeOptionalString(rawRule.url);
    const responseMode = normalizeRuleRequestMode(normalizeOptionalString(rawRule.mode));
    const replyType = normalizeRuleReplyType(normalizeOptionalString(rawRule.rType) ?? normalizeOptionalString(rawRule.fileType));
    if (!name || !requestUrl || !responseMode || !replyType) return null;

    const matchType = normalizeMatchMode(normalizeOptionalString(rawRule.matchMode));
    const keyword = normalizeKeywordValue(rawRule.keyword);
    const pattern = normalizeOptionalString(rawRule.pattern);
    if (matchType === 'regex' && !pattern) return null;
    if (matchType !== 'regex' && !keyword) return null;

    const args = normalizeArgs(rawRule.args);
    const now = Date.now();
    return {
        id: buildRuleId(name, 'dynamic'),
        name,
        description: normalizeOptionalString(rawRule.description),
        enabled: true,
        priority: 0,
        matchType,
        triggerText: serializeKeyword(keyword),
        pattern,
        args,
        sourceType: 'http',
        requestMethod: normalizeRuleRequestMethod(normalizeOptionalString(rawRule.method)) ?? 'GET',
        requestUrl,
        responseMode,
        responsePath: normalizeOptionalString(rawRule.jsonPath),
        requestConfig: buildRequestConfig(rawRule),
        replyType,
        replyPayload: normalizeReplyPayload(rawRule),
        createdAt: now,
        updatedAt: now,
    };
}

function parseDefinitionCategory(id: string): Extract<RulePluginCategory, 'common' | 'dynamic'> | null {
    if (id.startsWith(RULE_ID_PREFIX_MAP.common)) return 'common';
    if (id.startsWith(RULE_ID_PREFIX_MAP.dynamic)) return 'dynamic';
    return null;
}

function definitionToLegacyRaw(definition: RuleDefinition): Record<string, unknown> {
    const raw: Record<string, unknown> = {
        name: definition.name,
        ...(definition.description ? {description: definition.description} : {}),
        ...(definition.triggerText ? {keyword: definition.triggerText} : {}),
        ...(definition.requestUrl ? {url: definition.requestUrl} : {}),
        ...(definition.responseMode ? {mode: definition.responseMode} : {}),
        ...(definition.responsePath ? {jsonPath: definition.responsePath} : {}),
        rType: definition.replyType,
        ...(definition.requestMethod ? {method: definition.requestMethod} : {}),
    };

    const requestConfig = definition.requestConfig ?? {};
    if (Object.keys(requestConfig).length > 0) {
        raw.requestConfig = requestConfig;
    }
    if (requestConfig.headers && typeof requestConfig.headers === 'object' && !Array.isArray(requestConfig.headers)) {
        raw.headers = requestConfig.headers;
    }
    if (Object.prototype.hasOwnProperty.call(requestConfig, 'body')) {
        raw.body = requestConfig.body;
    }

    if (definition.matchType !== 'contains' || definition.pattern || definition.args) {
        raw.matchMode = definition.matchType;
    }
    if (definition.pattern) raw.pattern = definition.pattern;
    if (definition.args) raw.args = definition.args;

    const payload = definition.replyPayload ?? {};
    if (Object.keys(payload).length > 0) {
        raw.replyPayload = payload;
    }
    const assignString = (rawKey: string, payloadKey: string) => {
        const value = payload[payloadKey];
        if (typeof value === 'string' && value.trim()) raw[rawKey] = value.trim();
    };
    const assignNumber = (rawKey: string, payloadKey: string) => {
        const value = payload[payloadKey];
        const numeric = Number(value);
        if (Number.isFinite(numeric)) raw[rawKey] = Math.floor(numeric);
    };

    assignString('linkTitle', 'title');
    assignString('linkDescription', 'description');
    assignString('linkPicUrl', 'picUrl');
    assignNumber('voiceFormat', 'format');
    assignNumber('voiceDurationMs', 'durationMs');
    assignString('voiceFallbackText', 'fallbackText');
    assignString('cardUsername', 'username');
    assignString('cardNickname', 'nickname');
    assignString('cardAlias', 'alias');
    assignNumber('appType', 'appType');
    assignString('appXml', 'appXml');

    return raw;
}

function parseCacheMs(raw: string | undefined): number {
    const value = Number((raw ?? '').trim());
    if (!Number.isFinite(value) || value < 0) return 60_000;
    return Math.floor(value);
}

function serializeJson(value: unknown): string | null {
    if (value === undefined) return null;
    return JSON.stringify(value);
}

function upsertStatement(db: D1Database, definition: RuleDefinition) {
    return db.prepare(
        `INSERT INTO rule_definition (
            id, name, description, enabled, priority,
            match_type, trigger_text, pattern, args_json,
            source_type, request_method, request_url,
            response_mode, response_path, request_config_json,
            reply_type, reply_payload_json,
            created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            enabled = excluded.enabled,
            priority = excluded.priority,
            match_type = excluded.match_type,
            trigger_text = excluded.trigger_text,
            pattern = excluded.pattern,
            args_json = excluded.args_json,
            source_type = excluded.source_type,
            request_method = excluded.request_method,
            request_url = excluded.request_url,
            response_mode = excluded.response_mode,
            response_path = excluded.response_path,
            request_config_json = excluded.request_config_json,
            reply_type = excluded.reply_type,
            reply_payload_json = excluded.reply_payload_json,
            updated_at = excluded.updated_at`,
    ).bind(
        definition.id,
        definition.name,
        definition.description ?? null,
        definition.enabled ? 1 : 0,
        definition.priority,
        definition.matchType,
        definition.triggerText ?? null,
        definition.pattern ?? null,
        serializeJson(definition.args),
        definition.sourceType,
        definition.requestMethod ?? null,
        definition.requestUrl ?? null,
        definition.responseMode ?? null,
        definition.responsePath ?? null,
        serializeJson(definition.requestConfig),
        definition.replyType,
        serializeJson(definition.replyPayload),
        definition.createdAt,
        definition.updatedAt,
    );
}

export class RuleDefinitionRepository {
    private static readonly CREATE_TABLE_SQL = "CREATE TABLE IF NOT EXISTS rule_definition ("
        + 'id TEXT PRIMARY KEY, '
        + 'name TEXT NOT NULL, '
        + 'description TEXT, '
        + 'enabled INTEGER NOT NULL DEFAULT 1, '
        + 'priority INTEGER NOT NULL DEFAULT 0, '
        + 'match_type TEXT NOT NULL, '
        + 'trigger_text TEXT, '
        + 'pattern TEXT, '
        + 'args_json TEXT, '
        + 'source_type TEXT NOT NULL, '
        + 'request_method TEXT, '
        + 'request_url TEXT, '
        + 'response_mode TEXT, '
        + 'response_path TEXT, '
        + 'request_config_json TEXT, '
        + 'reply_type TEXT NOT NULL, '
        + 'reply_payload_json TEXT, '
        + 'created_at INTEGER NOT NULL, '
        + 'updated_at INTEGER NOT NULL'
        + ')';

    private static readonly CREATE_INDEXES_SQL = [
        'CREATE INDEX IF NOT EXISTS idx_rule_definition_enabled_priority ON rule_definition(enabled, priority DESC, updated_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_rule_definition_match_type ON rule_definition(match_type, enabled)',
        'CREATE INDEX IF NOT EXISTS idx_rule_definition_reply_type ON rule_definition(reply_type, enabled)',
        'CREATE INDEX IF NOT EXISTS idx_rule_definition_name ON rule_definition(name)',
    ];

    static clearCache(): number {
        const hadCache = runtimeCache ? 1 : 0;
        runtimeCache = null;
        return hadCache;
    }

    static async ensureSchema(db: D1Database): Promise<void> {
        if (!schemaReady) {
            schemaReady = (async () => {
                await db.prepare(RuleDefinitionRepository.CREATE_TABLE_SQL).run();
                for (const sql of RuleDefinitionRepository.CREATE_INDEXES_SQL) {
                    await db.prepare(sql).run();
                }
            })();
        }
        await schemaReady;
    }

    private static async hasMigrationMarker(env: Env): Promise<boolean> {
        const raw = await env.XBOT_KV.get(RULE_ENGINE_D1_MIGRATED_KV_KEY);
        return Boolean(raw?.trim());
    }

    private static async markMigrated(env: Env): Promise<void> {
        await env.XBOT_KV.put(RULE_ENGINE_D1_MIGRATED_KV_KEY, String(Date.now()));
    }

    private static async countDefinitions(db: D1Database): Promise<number> {
        const row = await db.prepare('SELECT COUNT(1) AS total FROM rule_definition').first<{total?: number}>();
        return Number(row?.total ?? 0) || 0;
    }

    private static async ensureDefinitionsAvailable(env: Env): Promise<D1Database | null> {
        if (!isUsableDb(env.XBOT_DB)) return null;
        await RuleDefinitionRepository.ensureSchema(env.XBOT_DB);

        const rowCount = await RuleDefinitionRepository.countDefinitions(env.XBOT_DB);
        if (rowCount === 0 && !(await RuleDefinitionRepository.hasMigrationMarker(env))) {
            return null;
        }
        return env.XBOT_DB;
    }

    static async replaceCategoryFromLegacyRawRules(
        env: Env,
        category: Extract<RulePluginCategory, 'common' | 'dynamic'>,
        rawRules: Record<string, unknown>[],
    ): Promise<void> {
        if (!isUsableDb(env.XBOT_DB)) return;
        await RuleDefinitionRepository.ensureSchema(env.XBOT_DB);

        const definitions = rawRules
            .map((rule) => category === 'common'
                ? commonRawToDefinition(rule as LegacyCommonRule)
                : dynamicRawToDefinition(rule as LegacyDynamicRule))
            .filter((rule): rule is RuleDefinition => Boolean(rule));

        const prefix = `${getRuleIdPrefix(category)}%`;
        await env.XBOT_DB.prepare('DELETE FROM rule_definition WHERE id LIKE ?1').bind(prefix).run();
        if (definitions.length > 0) {
            await env.XBOT_DB.batch(definitions.map((definition) => upsertStatement(env.XBOT_DB, definition)));
        }
        await RuleDefinitionRepository.markMigrated(env);
        RuleDefinitionRepository.clearCache();
    }

    static async listDefinitions(env: Env): Promise<RuleDefinition[] | null> {
        const db = await RuleDefinitionRepository.ensureDefinitionsAvailable(env);
        if (!db) return null;

        const result = await db.prepare(
            `SELECT *
             FROM rule_definition
             WHERE enabled = 1
             ORDER BY priority DESC, updated_at DESC, created_at DESC, id ASC`,
        ).all<RuleDefinitionRow>();

        return (result.results ?? [])
            .map((row) => rowToRuleDefinition(row))
            .filter((row): row is RuleDefinition => Boolean(row));
    }

    static async listEnabledDefinitionsByCategory(
        env: Env,
        category: Extract<RulePluginCategory, 'common' | 'dynamic'>,
    ): Promise<RuleDefinition[] | null> {
        const db = await RuleDefinitionRepository.ensureDefinitionsAvailable(env);
        if (!db) return null;

        const prefix = `${getRuleIdPrefix(category)}%`;
        const result = await db.prepare(
            `SELECT *
             FROM rule_definition
             WHERE enabled = 1 AND id LIKE ?1
             ORDER BY priority DESC, updated_at DESC, created_at DESC, id ASC`,
        ).bind(prefix).all<RuleDefinitionRow>();

        return (result.results ?? [])
            .map((row) => rowToRuleDefinition(row))
            .filter((row): row is RuleDefinition => Boolean(row));
    }

    static async listDefinitionsByCategory(
        env: Env,
        category: Extract<RulePluginCategory, 'common' | 'dynamic'>,
    ): Promise<RuleDefinition[] | null> {
        const db = await RuleDefinitionRepository.ensureDefinitionsAvailable(env);
        if (!db) return null;

        const prefix = `${getRuleIdPrefix(category)}%`;
        const result = await db.prepare(
            `SELECT *
             FROM rule_definition
             WHERE id LIKE ?1
             ORDER BY priority DESC, updated_at DESC, created_at DESC, id ASC`,
        ).bind(prefix).all<RuleDefinitionRow>();

        return (result.results ?? [])
            .map((row) => rowToRuleDefinition(row))
            .filter((row): row is RuleDefinition => Boolean(row));
    }

    static async listLegacyRulesByCategory(
        env: Env,
        category: Extract<RulePluginCategory, 'common' | 'dynamic'>,
    ): Promise<Record<string, unknown>[] | null> {
        const definitions = await RuleDefinitionRepository.listDefinitionsByCategory(env, category);
        if (definitions === null) return null;
        return definitions
            .filter((definition) => parseDefinitionCategory(definition.id) === category)
            .map((definition) => definitionToLegacyRaw(definition));
    }

    static async getRuleStoreStats(env: Env): Promise<{
        available: boolean;
        total: number;
        common: number;
        dynamic: number;
    }> {
        const db = await RuleDefinitionRepository.ensureDefinitionsAvailable(env);
        if (!db) {
            return {available: false, total: 0, common: 0, dynamic: 0};
        }

        const result = await db.prepare(
            `SELECT
                COUNT(1) AS total,
                SUM(CASE WHEN id LIKE 'common:%' THEN 1 ELSE 0 END) AS common_total,
                SUM(CASE WHEN id LIKE 'dynamic:%' THEN 1 ELSE 0 END) AS dynamic_total
             FROM rule_definition`,
        ).first<{total?: number; common_total?: number; dynamic_total?: number}>();

        return {
            available: true,
            total: Number(result?.total ?? 0) || 0,
            common: Number(result?.common_total ?? 0) || 0,
            dynamic: Number(result?.dynamic_total ?? 0) || 0,
        };
    }

    private static definitionsToRuntimeRules(definitions: RuleDefinition[]): DynamicRule[] {
        return definitions
            .map((definition) => ruleDefinitionToRuntimeRule(definition))
            .filter((rule) => {
                if (rule.matchMode === 'regex') return Boolean(rule.pattern);
                return normalizeKeyword(rule.keyword).length > 0;
            });
    }

    static async listRuntimeRulesByCategory(
        env: Env,
        category: Extract<RulePluginCategory, 'common' | 'dynamic'>,
    ): Promise<DynamicRule[] | null> {
        const cacheMs = parseCacheMs(env.COMMON_PLUGINS_CACHE_MS);
        const now = Date.now();
        if (cacheMs > 0 && runtimeCache && now < runtimeCache.expiresAt && runtimeCache.byCategory[category]) {
            return runtimeCache.byCategory[category] ?? null;
        }

        const definitions = await RuleDefinitionRepository.listEnabledDefinitionsByCategory(env, category);
        if (definitions === null) return null;

        const rules = RuleDefinitionRepository.definitionsToRuntimeRules(definitions);
        if (cacheMs > 0) {
            runtimeCache = {
                expiresAt: now + cacheMs,
                byCategory: {
                    ...(runtimeCache && now < runtimeCache.expiresAt ? runtimeCache.byCategory : {}),
                    [category]: rules,
                },
            };
        }
        return rules;
    }

    /** @deprecated 使用 listRuntimeRulesByCategory */
    static async listRuntimeRules(env: Env): Promise<DynamicRule[] | null> {
        const [commonRules, dynamicRules] = await Promise.all([
            RuleDefinitionRepository.listRuntimeRulesByCategory(env, 'common'),
            RuleDefinitionRepository.listRuntimeRulesByCategory(env, 'dynamic'),
        ]);
        if (commonRules === null && dynamicRules === null) return null;
        return [...(commonRules ?? []), ...(dynamicRules ?? [])];
    }
}

