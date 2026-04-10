import type {TextMessage} from '../types';
import {logger} from '../../utils/logger';
import {
    fetchTemplatedValue,
    renderTemplateString,
    toLinkReply,
} from './shared';
import {
    type ArgsConfig,
    findMatchContext,
    type MatchMode,
    normalizeKeyword,
    normalizeMatchMode,
} from './matcher';
import {loadRulesFromSources} from './remote-config';
import {createCachedRuleParser} from './parser';
import {buildCommonReply} from './reply-builder';

type RequestMode = 'text' | 'base64' | 'json';
type ReplyType = 'text' | 'image' | 'video' | 'voice' | 'link' | 'card' | 'app';

export interface DynamicCommonRule {
    name?: string;
    keyword?: string | string[];
    pattern?: string;
    matchMode?: MatchMode;
    url: string;
    mode: RequestMode;
    jsonPath?: string;
    rType: ReplyType;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: unknown;
    args?: ArgsConfig;
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
}

function normalizeOptionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    if (!Number.isFinite(n)) return undefined;
    return Math.floor(n);
}

function normalizeMode(mode: string | undefined): RequestMode | undefined {
    const m = (mode ?? '').trim().toLowerCase();
    if (m === 'text' || m === 'base64' || m === 'json') return m;
    if (m === 'base') return 'base64';
    return undefined;
}

function normalizeReplyType(t: string | undefined): ReplyType | undefined {
    const v = (t ?? '').trim().toLowerCase();
    if (v === 'text' || v === 'image' || v === 'video' || v === 'voice' || v === 'link' || v === 'card' || v === 'app') return v;
    return undefined;
}

const parseRules = createCachedRuleParser<DynamicCommonRule>({
    logPrefix: 'COMMON_DYNAMIC_PLUGINS',
    mapItem: (rawRule) => {
        const mode = normalizeMode(String(rawRule.mode ?? ''));
        const rType = normalizeReplyType(String(rawRule.rType ?? rawRule.fileType ?? ''));
        const url = String(rawRule.url ?? '').trim();
        if (!mode || !rType || !url) return null;

        const rule: DynamicCommonRule = {
            name: typeof rawRule.name === 'string' ? rawRule.name : undefined,
            keyword: rawRule.keyword as string | string[] | undefined,
            pattern: typeof rawRule.pattern === 'string' ? rawRule.pattern : undefined,
            matchMode: normalizeMatchMode(String(rawRule.matchMode ?? '')),
            url,
            mode,
            jsonPath: typeof rawRule.jsonPath === 'string' ? rawRule.jsonPath : undefined,
            rType,
            method: rawRule.method === 'POST' ? 'POST' : 'GET',
            headers: rawRule.headers as Record<string, string> | undefined,
            body: rawRule.body,
            args: rawRule.args as ArgsConfig | undefined,
            linkTitle: typeof rawRule.linkTitle === 'string' ? rawRule.linkTitle : undefined,
            linkDescription: typeof rawRule.linkDescription === 'string' ? rawRule.linkDescription : undefined,
            linkPicUrl: typeof rawRule.linkPicUrl === 'string' ? rawRule.linkPicUrl : undefined,
            voiceFormat: normalizeOptionalNumber(rawRule.voiceFormat),
            voiceDurationMs: normalizeOptionalNumber(rawRule.voiceDurationMs),
            voiceFallbackText: typeof rawRule.voiceFallbackText === 'string' ? rawRule.voiceFallbackText : undefined,
            cardUsername: typeof rawRule.cardUsername === 'string' ? rawRule.cardUsername : undefined,
            cardNickname: typeof rawRule.cardNickname === 'string' ? rawRule.cardNickname : undefined,
            cardAlias: typeof rawRule.cardAlias === 'string' ? rawRule.cardAlias : undefined,
            appType: normalizeOptionalNumber(rawRule.appType),
            appXml: typeof rawRule.appXml === 'string' ? rawRule.appXml : undefined,
        };

        if (rule.matchMode === 'regex' && !rule.pattern) return null;
        if (rule.matchMode !== 'regex' && normalizeKeyword(rule.keyword).length === 0) return null;
        return rule;
    },
});

const COMMON_DYNAMIC_PLUGINS_KV_KEY = 'plugins:parameterized:mapping';

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

async function resolveRules(env: {
    XBOT_KV: KVNamespace;
    COMMON_PLUGINS_CONFIG_URL?: string;
    COMMON_DYNAMIC_PLUGINS_CLIENT_ID?: string;
    COMMON_ADVANCED_PLUGINS_CLIENT_ID?: string;
    COMMON_PLUGINS_CLIENT_ID?: string;
    COMMON_PLUGINS_CACHE_MS?: string;
}): Promise<DynamicCommonRule[]> {
    const dynamicClientId = env.COMMON_DYNAMIC_PLUGINS_CLIENT_ID?.trim();
    const legacyAdvancedClientId = env.COMMON_ADVANCED_PLUGINS_CLIENT_ID?.trim();
    const fallbackClientId = env.COMMON_PLUGINS_CLIENT_ID?.trim();
    const clientId = dynamicClientId || legacyAdvancedClientId || fallbackClientId || '';
    const cacheMs = parseCacheMs(env.COMMON_PLUGINS_CACHE_MS);

    return loadRulesFromSources({
        cacheNamespace: 'common-dynamic',
        kv: env.XBOT_KV,
        kvKey: COMMON_DYNAMIC_PLUGINS_KV_KEY,
        remoteUrl: env.COMMON_PLUGINS_CONFIG_URL?.trim(),
        clientId,
        cacheMs,
        parseRules: (rawText) => parseRules(rawText),
        logPrefix: '动态通用插件',
    });
}

export const dynamicCommonPluginsEngine: TextMessage = {
    type: 'text',
    name: 'dynamic-common-plugins-engine',
    description: '支持参数提取的动态通用插件',
    match: () => true,
    handle: async (message, env): ReturnType<TextMessage['handle']> => {
        const content = (message.content ?? '').trim();
        if (!content) return null;
        const messageParams = buildMessageParams(message);

        const rules = await resolveRules(env);
        if (!rules.length) return null;

        const context = findMatchContext<DynamicCommonRule>(content, rules);
        if (!context) return null;

        const {rule, params} = context;
        const templateParams = {...messageParams, ...params};

        try {
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
                },
                templateParams,
                '动态通用插件',
            );
            if (value === undefined || value === null || value === '') {
                logger.warn('动态通用插件未提取到有效返回值', {
                    url: rule.url,
                    jsonPath: rule.jsonPath,
                    mode: rule.mode,
                });
                return null;
            }

            return await buildCommonReply(rule, value, '动态通用插件');
        } catch (err) {
            logger.error('动态通用插件处理异常', {
                rule: rule.name ?? rule.keyword ?? rule.pattern,
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    },
};


