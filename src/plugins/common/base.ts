import type {TextMessage} from '../types';
import {logger} from '../../utils/logger';
import {
    fetchTemplatedValue,
    renderTemplateString,
    toLinkReply,
} from './shared';
import {loadRulesFromSources} from './remote-config';
import {createCachedRuleParser} from './parser';
import {buildCommonReply} from './reply-builder';

type CommonPluginMode = 'text' | 'base64' | 'json';
type CommonPluginReplyType = 'text' | 'image' | 'video' | 'voice' | 'link';

export interface CommonPluginRule {
    name?: string;
    keyword: string | string[];
    url: string;
    mode: CommonPluginMode;
    jsonPath?: string;
    rType: CommonPluginReplyType;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: unknown;
    linkTitle?: string;
    linkDescription?: string;
    linkPicUrl?: string;
    /** 是否通过 CHINA_API_PROXY_URL 代理请求。true=走代理，false/undefined=直连。 */
    proxy?: boolean;
}

interface LegacyRule {
    name?: string;
    keyword?: string | string[];
    url?: string;
    mode?: string;
    jsonPath?: string;
    fileType?: string;
    rType?: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: unknown;
    linkTitle?: string;
    linkDescription?: string;
    linkPicUrl?: string;
    proxy?: boolean;
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
function normalizeMode(mode: string | undefined): CommonPluginMode | undefined {
    if (!mode) return undefined;
    const m = mode.trim().toLowerCase();
    if (m === 'text' || m === 'json' || m === 'base64') return m;
    if (m === 'base') return 'base64';
    return undefined;
}

/** 规范化回复类型（text/image/video/voice/link）。 */
function normalizeReplyType(value: string | undefined): CommonPluginReplyType | undefined {
    if (!value) return undefined;
    const t = value.trim().toLowerCase();
    if (t === 'text' || t === 'image' || t === 'video' || t === 'voice' || t === 'link') return t;
    return undefined;
}

/** 将旧规则结构转换为统一规则对象；缺少关键字段时返回 null。 */
function toRule(item: LegacyRule): CommonPluginRule | null {
    const keyword = normalizeKeyword(item.keyword);
    const url = item.url?.trim();
    const mode = normalizeMode(item.mode);
    const rType = normalizeReplyType(item.rType) ?? normalizeReplyType(item.fileType);

    if (!keyword || !url || !mode || !rType) return null;

    return {
        name: item.name,
        keyword,
        url,
        mode,
        jsonPath: item.jsonPath,
        rType,
        method: item.method,
        headers: item.headers,
        body: item.body,
        linkTitle: item.linkTitle,
        linkDescription: item.linkDescription,
        linkPicUrl: item.linkPicUrl,
        proxy: item.proxy === true,
    };
}

const parseRules = createCachedRuleParser<CommonPluginRule>({
    logPrefix: 'COMMON_PLUGINS',
    mapItem: (item) => toRule(item as LegacyRule),
});

const COMMON_PLUGINS_KV_KEY = 'plugins:common:mapping';

/** 判断消息内容是否包含任一关键词。 */
function keywordMatched(content: string, keyword: string | string[]): boolean {
    const keywords = Array.isArray(keyword) ? keyword : [keyword];
    return keywords.some((k) => k && content.includes(k));
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
 * 通用插件引擎。
 *
 * 从 env.COMMON_PLUGINS_CONFIG 读取 JSON 数组配置，匹配 keyword 后请求 url，
 * 按 mode 提取内容，再根据 rType 组装回复。
 */
export const commonPluginsEngine: TextMessage = {
    type: 'text',
    name: 'common-plugins-engine',
    description: '按关键词匹配通用配置并请求接口',

    // Always true, register this plugin after specific plugins.
    match: () => true,

    handle: async (message, env) => {
        const content = (message.content ?? '').trim();
        if (!content) return null;
        const templateParams = buildMessageParams(message);

        const rules = await resolveRules(env);
        if (!rules.length) return null;

        const matchedRule = rules.find((rule) => keywordMatched(content, rule.keyword));
        if (!matchedRule) return null;

        const envRecord = (env as unknown) as Record<string, string | undefined>;
        const configuredProxy = envRecord['CHINA_API_PROXY_URL']?.trim();

        // 判断是否需要走代理：
        // 1. 规则明确设置 proxy:true → 强制走代理
        // 2. URL 域名命中 CHINA_API_PROXY_HOSTS 列表 → 自动走代理
        // 3. 以上都不满足 → 直连
        let proxyBaseUrl: string | undefined;
        if (configuredProxy) {
            if (matchedRule.proxy) {
                proxyBaseUrl = configuredProxy;
            } else {
                const proxyHosts = (envRecord['CHINA_API_PROXY_HOSTS'] ?? '')
                    .split(',')
                    .map((h) => h.trim().toLowerCase())
                    .filter(Boolean);
                if (proxyHosts.length) {
                    try {
                        const urlHost = new URL(matchedRule.url).hostname.toLowerCase();
                        if (proxyHosts.some((h) => urlHost === h || urlHost.endsWith(`.${h}`))) {
                            proxyBaseUrl = configuredProxy;
                        }
                    } catch {
                        // URL 解析失败时不走代理
                    }
                }
            }
        }

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
                },
                templateParams,
                '通用插件',
                proxyBaseUrl,
            );
            if (value === undefined || value === null || value === '') {
                logger.warn('通用插件未提取到有效返回值', {
                    url: matchedRule.url,
                    jsonPath: matchedRule.jsonPath,
                    mode: matchedRule.mode,
                });
                return null;
            }

            return await buildCommonReply(matchedRule, value, '通用插件');
        } catch (err) {
            logger.error('通用插件处理异常', err);
            return null;
        }
    },
};

/**
 * 解析可用规则：优先内联配置，其次远程配置（带短缓存）。
 */
async function resolveRules(env: {
    XBOT_KV: KVNamespace;
    COMMON_PLUGINS_CONFIG?: string;
    COMMON_PLUGINS_MAPPING?: string;
    COMMON_PLUGINS_CONFIG_URL?: string;
    COMMON_PLUGINS_CLIENT_ID?: string
}): Promise<CommonPluginRule[]> {
    const clientId = env.COMMON_PLUGINS_CLIENT_ID?.trim() ?? '';
    return loadRulesFromSources({
        cacheNamespace: 'common-base',
        inlineConfig: env.COMMON_PLUGINS_CONFIG || env.COMMON_PLUGINS_MAPPING,
        kv: env.XBOT_KV,
        kvKey: COMMON_PLUGINS_KV_KEY,
        remoteUrl: env.COMMON_PLUGINS_CONFIG_URL?.trim(),
        clientId,
        parseRules: (rawText) => parseRules(rawText),
        logPrefix: '通用插件',
    });
}
