import type {TextMessage} from '../types';
import {logger} from '../../utils/logger';
import {
    fetchTemplatedValue,
    renderTemplateString,
    toLinkReply,
} from './shared';
import {findMatchContext, normalizeKeyword as splitKeywords} from './matcher';
import {loadRulesFromSources} from './rule-sources';
import {createCachedRuleParser} from './parser';
import {buildCommonReply} from './reply-builder';
import {
    normalizeRuleReplyType,
    normalizeRuleRequestMode,
    type SimpleRule,
} from './model';
import {RuleDefinitionRepository} from './repository';

export type {SimpleRule} from './model';

interface LegacyRule {
    name?: string;
    description?: string;
    keyword?: string | string[];
    url?: string;
    mode?: string;
    jsonPath?: string;
    fileType?: string;
    rType?: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: unknown;
    requestConfig?: Record<string, unknown>;
    replyPayload?: Record<string, unknown>;
    linkTitle?: string;
    linkDescription?: string;
    linkPicUrl?: string;
    voiceFormat?: unknown;
    voiceDurationMs?: unknown;
    voiceFallbackText?: unknown;
    cardUsername?: unknown;
    cardNickname?: unknown;
    cardAlias?: unknown;
    appType?: unknown;
    appXml?: unknown;
}

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

/** 将关键词统一为字符串或字符串数组；支持 `a|b|c` 写法。 */
function normalizeKeyword(keyword: string | string[] | undefined): string | string[] | undefined {
    if (!keyword) return undefined;

    const rawItems = Array.isArray(keyword) ? keyword : [keyword];
    const split = rawItems
        .flatMap((item) => item.split('|'))
        .map((k) => k.trim())
        .filter(Boolean);

    if (!split.length) return undefined;
    return split.length === 1 ? split[0] : split;
}

/** 规范化请求模式，兼容历史 `base` -> `base64`。 */
function normalizeMode(mode: string | undefined): SimpleRule['mode'] | undefined {
    return normalizeRuleRequestMode(mode);
}

/** 规范化回复类型（text/image/video/voice/link）。 */
function normalizeReplyType(value: string | undefined): SimpleRule['rType'] | undefined {
    return normalizeRuleReplyType(value);
}

/** 将旧规则结构转换为统一规则对象；缺少关键字段时返回 null。 */
function toRule(item: LegacyRule): SimpleRule | null {
    const keyword = normalizeKeyword(item.keyword);
    const url = item.url?.trim();
    const mode = normalizeMode(item.mode);
    const rType = normalizeReplyType(item.rType) ?? normalizeReplyType(item.fileType);
    const requestConfig = normalizeOptionalJsonObject(item.requestConfig);
    const replyPayload = normalizeOptionalJsonObject(item.replyPayload);

    if (!keyword || !url || !mode || !rType) return null;

    return {
        name: item.name,
        description: item.description,
        keyword,
        url,
        mode,
        jsonPath: item.jsonPath,
        rType,
        method: item.method,
        headers: (requestConfig?.headers as Record<string, string> | undefined) ?? item.headers,
        body: Object.prototype.hasOwnProperty.call(requestConfig ?? {}, 'body')
            ? requestConfig?.body
            : item.body,
        requestConfig,
        linkTitle: item.linkTitle ?? getPayloadString(replyPayload, ['title', 'linkTitle']),
        linkDescription: item.linkDescription ?? getPayloadString(replyPayload, ['description', 'linkDescription']),
        linkPicUrl: item.linkPicUrl ?? getPayloadString(replyPayload, ['picUrl', 'linkPicUrl']),
        voiceFormat: normalizeOptionalNumber(item.voiceFormat) ?? getPayloadNumber(replyPayload, ['format', 'voiceFormat']),
        voiceDurationMs: normalizeOptionalNumber(item.voiceDurationMs) ?? getPayloadNumber(replyPayload, ['durationMs', 'voiceDurationMs']),
        voiceFallbackText: (typeof item.voiceFallbackText === 'string' ? item.voiceFallbackText : undefined)
            ?? getPayloadString(replyPayload, ['fallbackText', 'voiceFallbackText']),
        cardUsername: (typeof item.cardUsername === 'string' ? item.cardUsername : undefined)
            ?? getPayloadString(replyPayload, ['username', 'cardUsername']),
        cardNickname: (typeof item.cardNickname === 'string' ? item.cardNickname : undefined)
            ?? getPayloadString(replyPayload, ['nickname', 'cardNickname']),
        cardAlias: (typeof item.cardAlias === 'string' ? item.cardAlias : undefined)
            ?? getPayloadString(replyPayload, ['alias', 'cardAlias']),
        appType: normalizeOptionalNumber(item.appType) ?? getPayloadNumber(replyPayload, ['appType']),
        appXml: (typeof item.appXml === 'string' ? item.appXml : undefined)
            ?? getPayloadString(replyPayload, ['appXml', 'xml']),
        replyPayload,
    };
}

const parseRules = createCachedRuleParser<SimpleRule>({
    logPrefix: 'SIMPLE_RULES',
    mapItem: (item) => toRule(item as LegacyRule),
});

const SIMPLE_RULES_KV_KEY = 'plugins:common:mapping';

function parseCacheMs(raw: string | undefined): number | undefined {
    const value = Number((raw ?? '').trim());
    if (!Number.isFinite(value) || value < 0) return undefined;
    return Math.floor(value);
}

/** 构建可用于模板替换的消息参数（示例：{{message.from}}）。 */
function buildMessageParams(message: Parameters<TextMessage['handle']>[0]): Record<string, string> {
    const params: Record<string, string> = {
        'message.platform': message.platform,
        'message.type': message.type,
        'message.from': message.from,
        'message.to': message.to,
        'message.source': message.source ?? '',
        'message.content': message.content ?? '',
        'message.timestamp': String(message.timestamp),
        'message.messageId': message.messageId,
        'message.senderName': message.senderName ?? '',
        // 简短别名，方便配置书写。
        from: message.from,
        to: message.to,
        content: message.content ?? '',
        messageId: message.messageId,
        timestamp: String(message.timestamp),
    };

    if (message.room?.id) params['message.room.id'] = message.room.id;
    if (message.room?.topic) params['message.room.topic'] = message.room.topic;
    if (message.mediaId) params['message.mediaId'] = message.mediaId;
    return params;
}


/**
 * 简单规则引擎。
 *
 * 从 env.COMMON_PLUGINS_CONFIG 读取 JSON 数组配置，匹配 keyword 后请求 url，
 * 按 mode 提取内容，再根据 rType 组装回复。
 */
export const simpleRulesEngine: TextMessage = {
    type: 'text',
    name: 'simple-rules-engine',
    description: '按关键词匹配简单规则并请求接口',

    // Always true, register this plugin after specific plugins.
    match: () => true,

    handle: async (message, env): ReturnType<TextMessage['handle']> => {
        const content = (message.content ?? '').trim();
        if (!content) return null;

        const rules = await resolveRules(env);
        if (!rules.length) return null;

        const context = findMatchContext<SimpleRule>(content, rules);
        if (!context) return null;
        const matchedRule = context.rule;
        const templateParams = {...buildMessageParams(message), ...context.params};

        try {
            if (matchedRule.mode === 'base64' && matchedRule.rType === 'link') {
                return toLinkReply(matchedRule, renderTemplateString(matchedRule.url, templateParams, true));
            }

            const value = await fetchTemplatedValue(
                {
                    url: matchedRule.url,
                    method: matchedRule.method,
                    headers: matchedRule.headers,
                    body: matchedRule.body,
                    mode: matchedRule.mode,
                    jsonPath: matchedRule.jsonPath,
                    timeoutMs: typeof matchedRule.requestConfig?.timeoutMs === 'number'
                        ? matchedRule.requestConfig.timeoutMs
                        : undefined,
                },
                templateParams,
                '简单规则',
            );
            if (value === undefined || value === null || value === '') {
                logger.warn('简单规则未提取到有效返回值', {
                    url: matchedRule.url,
                    jsonPath: matchedRule.jsonPath,
                    mode: matchedRule.mode,
                });
                return null;
            }

            return await buildCommonReply(matchedRule, value, '简单规则');
        } catch (err) {
            logger.error('简单规则处理异常', err);
            return null;
        }
    },
};

function loadLegacyRules(env: {
    XBOT_KV: KVNamespace;
    COMMON_PLUGINS_CONFIG?: string;
    COMMON_PLUGINS_MAPPING?: string;
    COMMON_PLUGINS_CACHE_MS?: string;
}): Promise<SimpleRule[]> {
    const cacheMs = parseCacheMs(env.COMMON_PLUGINS_CACHE_MS);
    return loadRulesFromSources({
        cacheNamespace: 'simple-rules',
        inlineConfig: env.COMMON_PLUGINS_CONFIG || env.COMMON_PLUGINS_MAPPING,
        kv: env.XBOT_KV,
        kvKey: SIMPLE_RULES_KV_KEY,
        cacheMs,
        parseRules: (rawText) => parseRules(rawText),
        logPrefix: '简单规则',
    });
}

/**
 * 解析可用规则：D1 common 规则优先；D1 不可用或为空时回退内联 env / KV。
 */
async function resolveRules(env: {
    XBOT_KV: KVNamespace;
    XBOT_DB: D1Database;
    COMMON_PLUGINS_CONFIG?: string;
    COMMON_PLUGINS_MAPPING?: string;
    COMMON_PLUGINS_CACHE_MS?: string;
}): Promise<SimpleRule[]> {
    try {
        const structuredRules = await RuleDefinitionRepository.listRuntimeRulesByCategory(env, 'common');
        if (structuredRules !== null && structuredRules.length > 0) {
            const rules = structuredRules
                .filter((rule) => splitKeywords(rule.keyword).length > 0) as SimpleRule[];
            if (rules.length > 0) {
                logger.debug('简单规则已从 D1 加载', {count: rules.length});
                return rules;
            }
            logger.warn('简单规则 D1 common 条目均无效，回退 KV/内联');
        }
    } catch (err) {
        logger.warn('简单规则 D1 加载异常，回退 KV/内联', err);
    }

    const legacyRules = await loadLegacyRules(env);
    logger.debug('简单规则已从 KV/内联加载', {count: legacyRules.length});
    return legacyRules;
}
