import type {TextMessage} from '../types';
import {logger} from '../../utils/logger';
import {
    fetchTemplatedValue,
    renderTemplateValue,
    renderTemplateString,
    toLinkReply,
} from './shared';
import {
    type ArgsConfig,
    findMatchContext,
    normalizeKeyword,
    normalizeMatchMode,
} from './matcher';
import {loadRulesFromSources} from './rule-sources';
import {createCachedRuleParser} from './parser';
import {buildCommonReply} from './reply-builder';
import {
    normalizeRuleReplyType,
    normalizeRuleRequestMode,
    type DynamicRule,
} from './model';
import {RuleDefinitionRepository} from './repository';

export type {DynamicRule} from './model';

function normalizeOptionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    if (!Number.isFinite(n)) return undefined;
    return Math.floor(n);
}

function normalizeOptionalJsonObject(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return {...(value as Record<string, unknown>)};
}

function getPayloadString(payload: Record<string, unknown> | undefined, keys: string[]): string | undefined {
    if (!payload) return undefined;
    for (const key of keys) {
        const value = payload[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
}

function getPayloadNumber(payload: Record<string, unknown> | undefined, keys: string[]): number | undefined {
    if (!payload) return undefined;
    for (const key of keys) {
        const value = normalizeOptionalNumber(payload[key]);
        if (value !== undefined) return value;
    }
    return undefined;
}

function normalizeMode(mode: string | undefined): DynamicRule['mode'] | undefined {
    return normalizeRuleRequestMode(mode);
}

function normalizeReplyType(t: string | undefined): DynamicRule['rType'] | undefined {
    return normalizeRuleReplyType(t);
}

const parseRules = createCachedRuleParser<DynamicRule>({
    logPrefix: 'DYNAMIC_RULES',
    mapItem: (rawRule) => {
        const mode = normalizeMode(String(rawRule.mode ?? ''));
        const rType = normalizeReplyType(String(rawRule.rType ?? rawRule.fileType ?? ''));
        const url = String(rawRule.url ?? '').trim();
        const requestConfig = normalizeOptionalJsonObject(rawRule.requestConfig);
        const replyPayload = normalizeOptionalJsonObject(rawRule.replyPayload);
        if (!mode || !rType || !url) return null;

        const rule: DynamicRule = {
            name: typeof rawRule.name === 'string' ? rawRule.name : undefined,
            description: typeof rawRule.description === 'string' ? rawRule.description : undefined,
            keyword: rawRule.keyword as string | string[] | undefined,
            pattern: typeof rawRule.pattern === 'string' ? rawRule.pattern : undefined,
            matchMode: normalizeMatchMode(String(rawRule.matchMode ?? '')),
            url,
            mode,
            jsonPath: typeof rawRule.jsonPath === 'string' ? rawRule.jsonPath : undefined,
            rType,
            method: rawRule.method === 'POST' ? 'POST' : 'GET',
            headers: (requestConfig?.headers as Record<string, string> | undefined)
                ?? rawRule.headers as Record<string, string> | undefined,
            body: Object.prototype.hasOwnProperty.call(requestConfig ?? {}, 'body')
                ? requestConfig?.body
                : rawRule.body,
            args: rawRule.args as ArgsConfig | undefined,
            requestConfig,
            linkTitle: (typeof rawRule.linkTitle === 'string' ? rawRule.linkTitle : undefined)
                ?? getPayloadString(replyPayload, ['title', 'linkTitle']),
            linkDescription: (typeof rawRule.linkDescription === 'string' ? rawRule.linkDescription : undefined)
                ?? getPayloadString(replyPayload, ['description', 'linkDescription']),
            linkPicUrl: (typeof rawRule.linkPicUrl === 'string' ? rawRule.linkPicUrl : undefined)
                ?? getPayloadString(replyPayload, ['picUrl', 'linkPicUrl']),
            voiceFormat: normalizeOptionalNumber(rawRule.voiceFormat) ?? getPayloadNumber(replyPayload, ['format', 'voiceFormat']),
            voiceDurationMs: normalizeOptionalNumber(rawRule.voiceDurationMs) ?? getPayloadNumber(replyPayload, ['durationMs', 'voiceDurationMs']),
            voiceFallbackText: (typeof rawRule.voiceFallbackText === 'string' ? rawRule.voiceFallbackText : undefined)
                ?? getPayloadString(replyPayload, ['fallbackText', 'voiceFallbackText']),
            cardUsername: (typeof rawRule.cardUsername === 'string' ? rawRule.cardUsername : undefined)
                ?? getPayloadString(replyPayload, ['username', 'cardUsername']),
            cardNickname: (typeof rawRule.cardNickname === 'string' ? rawRule.cardNickname : undefined)
                ?? getPayloadString(replyPayload, ['nickname', 'cardNickname']),
            cardAlias: (typeof rawRule.cardAlias === 'string' ? rawRule.cardAlias : undefined)
                ?? getPayloadString(replyPayload, ['alias', 'cardAlias']),
            appType: normalizeOptionalNumber(rawRule.appType) ?? getPayloadNumber(replyPayload, ['appType']),
            appXml: (typeof rawRule.appXml === 'string' ? rawRule.appXml : undefined)
                ?? getPayloadString(replyPayload, ['appXml', 'xml']),
            replyPayload,
        };

        if (rule.matchMode === 'regex' && !rule.pattern) return null;
        if (rule.matchMode !== 'regex' && normalizeKeyword(rule.keyword).length === 0) return null;
        return rule;
    },
});

const DYNAMIC_RULES_KV_KEY = 'plugins:parameterized:mapping';

function buildMessageParams(message: Parameters<TextMessage['handle']>[0]): Record<string, string> {
    const senderName = message.senderName?.trim() || '主人';
    const params: Record<string, string> = {
        'message.platform': message.platform,
        'message.type': message.type,
        'message.from': message.from,
        'message.to': message.to,
        'message.source': message.source ?? '',
        'message.content': message.content ?? '',
        'message.timestamp': String(message.timestamp),
        'message.messageId': message.messageId,
        'message.senderName': senderName,
        // Short aliases for easier config writing.
        from: message.from,
        to: message.to,
        content: message.content ?? '',
        senderName,
        messageId: message.messageId,
        timestamp: String(message.timestamp),
    };

    if (message.room?.id) params['message.room.id'] = message.room.id;
    if (message.room?.topic) params['message.room.topic'] = message.room.topic;
    if (message.mediaId) params['message.mediaId'] = message.mediaId;
    return params;
}

function parseCacheMs(raw: string | undefined): number | undefined {
    const value = Number((raw ?? '').trim());
    if (!Number.isFinite(value) || value < 0) return undefined;
    return Math.floor(value);
}

function loadLegacyRules(env: {
    XBOT_KV: KVNamespace;
    COMMON_PLUGINS_CACHE_MS?: string;
}): Promise<DynamicRule[]> {
    const cacheMs = parseCacheMs(env.COMMON_PLUGINS_CACHE_MS);
    return loadRulesFromSources({
        cacheNamespace: 'dynamic-rules',
        kv: env.XBOT_KV,
        kvKey: DYNAMIC_RULES_KV_KEY,
        cacheMs,
        parseRules: (rawText) => parseRules(rawText),
        logPrefix: '动态规则',
    });
}

async function resolveRules(env: {
    XBOT_KV: KVNamespace;
    XBOT_DB: D1Database;
    COMMON_PLUGINS_CACHE_MS?: string;
}): Promise<DynamicRule[]> {
    try {
        const structuredRules = await RuleDefinitionRepository.listRuntimeRulesByCategory(env, 'dynamic');
        if (structuredRules !== null && structuredRules.length > 0) {
            logger.debug('动态规则已从 D1 加载', {count: structuredRules.length});
            return structuredRules;
        }
    } catch (err) {
        logger.warn('动态规则 D1 加载异常，回退 KV', err);
    }

    const legacyRules = await loadLegacyRules(env);
    logger.debug('动态规则已从 KV 加载', {count: legacyRules.length});
    return legacyRules;
}

export const dynamicRulesEngine: TextMessage = {
    type: 'text',
    name: 'dynamic-rules-engine',
    description: '支持参数提取的动态规则引擎',
    match: () => true,
    handle: async (message, env): ReturnType<TextMessage['handle']> => {
        const content = (message.content ?? '').trim();
        if (!content) return null;
        const messageParams = buildMessageParams(message);

        const rules = await resolveRules(env);
        if (!rules.length) return null;

        const context = findMatchContext<DynamicRule>(content, rules);
        if (!context) return null;

        const {rule, params} = context;
        const templateParams = {...messageParams, ...params};

        try {
            if (rule.sourceType === 'static') {
                const staticValue = renderTemplateValue(
                    rule.staticValue ?? rule.replyPayload ?? rule.url,
                    templateParams,
                    false,
                );
                return await buildCommonReply(rule, staticValue, '动态规则');
            }

            if (rule.mode === 'base64' && rule.rType === 'link') {
                return toLinkReply(rule, renderTemplateString(rule.url, templateParams, true));
            }

            const value = await fetchTemplatedValue(
                {
                    url: rule.url,
                    method: rule.method,
                    headers: rule.headers,
                    body: rule.body,
                    mode: rule.mode,
                    jsonPath: rule.jsonPath,
                    timeoutMs: typeof rule.requestConfig?.timeoutMs === 'number'
                        ? rule.requestConfig.timeoutMs
                        : undefined,
                },
                templateParams,
                '动态规则',
            );
            if (value === undefined || value === null || value === '') {
                logger.warn('动态规则未提取到有效返回值', {
                    url: rule.url,
                    jsonPath: rule.jsonPath,
                    mode: rule.mode,
                });
                return null;
            }

            return await buildCommonReply(rule, value, '动态规则');
        } catch (err) {
            logger.error('动态规则处理异常', {
                rule: rule.name ?? rule.keyword ?? rule.pattern,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    },
};


