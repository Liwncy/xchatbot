import type { TextMessage } from './types.js';
import { logger } from '../utils/logger.js';
import { arrayBufferToBase64 } from '../utils/binary.js';

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
}

let cachedRaw = '';
let cachedRules: CommonPluginRule[] = [];

function normalizeKeyword(keyword: string | string[] | undefined): string | string[] | undefined {
  if (!keyword) return undefined;
  if (Array.isArray(keyword)) {
    const items = keyword.map((k) => k.trim()).filter(Boolean);
    return items.length ? items : undefined;
  }

  const split = keyword.split('|').map((k) => k.trim()).filter(Boolean);
  if (!split.length) return undefined;
  return split.length === 1 ? split[0] : split;
}

function normalizeMode(mode: string | undefined): CommonPluginMode | undefined {
  if (!mode) return undefined;
  const m = mode.trim().toLowerCase();
  if (m === 'text' || m === 'json' || m === 'base64') return m;
  if (m === 'base') return 'base64';
  return undefined;
}

function normalizeReplyType(value: string | undefined): CommonPluginReplyType | undefined {
  if (!value) return undefined;
  const t = value.trim().toLowerCase();
  if (t === 'text' || t === 'image' || t === 'video' || t === 'voice' || t === 'link') return t;
  return undefined;
}

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
  };
}

function parseRules(raw: string | undefined): CommonPluginRule[] {
  const source = (raw ?? '').trim();
  if (!source) return [];
  if (source === cachedRaw) return cachedRules;

  try {
    const parsed = JSON.parse(source) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : (parsed as { keywordMapping?: unknown })?.keywordMapping;

    if (!Array.isArray(list)) {
      logger.warn('COMMON_PLUGINS 配置不是数组/keywordMapping，已忽略');
      cachedRaw = source;
      cachedRules = [];
      return cachedRules;
    }

    cachedRaw = source;
    cachedRules = list
      .map((item) => (item && typeof item === 'object' ? toRule(item as LegacyRule) : null))
      .filter((item): item is CommonPluginRule => Boolean(item));

    return cachedRules;
  } catch (err) {
    logger.error('COMMON_PLUGINS 配置 JSON 解析失败', err);
    cachedRaw = source;
    cachedRules = [];
    return cachedRules;
  }
}

function keywordMatched(content: string, keyword: string | string[]): boolean {
  const keywords = Array.isArray(keyword) ? keyword : [keyword];
  return keywords.some((k) => k && content.includes(k));
}

function getByJsonPath(data: unknown, jsonPath: string): unknown {
  const normalized = jsonPath.replace(/^\$\.?/, '');
  if (!normalized) return data;

  const tokens = normalized.match(/[^.[\]]+|\[(\d+)]/g) ?? [];
  let current: unknown = data;

  for (const token of tokens) {
    if (current == null) return undefined;

    if (token.startsWith('[') && token.endsWith(']')) {
      const idx = Number(token.slice(1, -1));
      if (!Array.isArray(current) || !Number.isInteger(idx)) return undefined;
      current = current[idx];
      continue;
    }

    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[token];
  }

  return current;
}

function normalizeBase64(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^data:[^;]+;base64,(.+)$/i);
  return match?.[1] ?? trimmed;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function looksLikeBase64(value: string): boolean {
  const normalized = value.replace(/\s+/g, '');
  if (!normalized || normalized.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/=]+$/.test(normalized);
}

async function toMediaPayload(value: unknown): Promise<string | null> {
  const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!raw) return null;

  const normalized = normalizeBase64(raw);
  if (looksLikeBase64(normalized)) {
    return normalized;
  }

  if (isHttpUrl(raw)) {
    const mediaRes = await fetch(raw);
    if (!mediaRes.ok) {
      logger.error('通用插件媒体下载失败', { url: raw, status: mediaRes.status });
      return null;
    }
    const buffer = await mediaRes.arrayBuffer();
    return arrayBufferToBase64(buffer);
  }

  // Last resort: return normalized string to keep backward compatibility.
  return normalized;
}

function keywordFallback(keyword: string | string[]): string {
  if (Array.isArray(keyword)) {
    return keyword.find((k) => k && k.trim())?.trim() ?? '链接消息';
  }
  return keyword?.trim() || '链接消息';
}

function toLinkReply(rule: CommonPluginRule, value: unknown) {
  const keywordText = keywordFallback(rule.keyword);
  const defaultTitle = rule.linkTitle?.trim() || keywordText;
  const defaultDescription = rule.linkDescription?.trim() || `${keywordText}的链接`;

  if (typeof value === 'string') {
    const url = value.trim();
    if (!url) return null;
    return {
      type: 'news' as const,
      articles: [
        {
          title: defaultTitle,
          description: defaultDescription,
          url,
          picUrl: rule.linkPicUrl ?? '',
        },
      ],
    };
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const url = typeof obj.url === 'string' ? obj.url.trim() : '';
    if (!url) return null;
    return {
      type: 'news' as const,
      articles: [
        {
          title: (typeof obj.title === 'string' && obj.title.trim()) || defaultTitle,
          description:
            (typeof obj.description === 'string' && obj.description.trim()) || defaultDescription,
          url,
          picUrl: (typeof obj.picUrl === 'string' && obj.picUrl.trim()) || rule.linkPicUrl || '',
        },
      ],
    };
  }

  return null;
}

async function toReply(rule: CommonPluginRule, value: unknown) {
  const rType = rule.rType;
  if (rType === 'text') {
    const content = typeof value === 'string' ? value : JSON.stringify(value);
    return content ? { type: 'text' as const, content } : null;
  }

  if (rType === 'link') {
    return toLinkReply(rule, value);
  }

  const mediaId = await toMediaPayload(value);
  if (!mediaId) return null;
  return { type: rType, mediaId };
}

async function extractValueByMode(rule: CommonPluginRule, response: Response): Promise<unknown> {
  if (rule.mode === 'text') {
    return response.text();
  }

  if (rule.mode === 'base64') {
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (contentType.includes('application/json') || contentType.startsWith('text/')) {
      const text = await response.text();
      return normalizeBase64(text);
    }

    const buffer = await response.arrayBuffer();
    return arrayBufferToBase64(buffer);
  }

  const payload = (await response.json()) as unknown;
  if (!rule.jsonPath) return payload;
  return getByJsonPath(payload, rule.jsonPath);
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
  description: '根据 COMMON_PLUGINS_CONFIG/COMMON_PLUGINS_MAPPING 动态匹配关键词并请求外部接口',

  // Always true, register this plugin after specific plugins.
  match: () => true,

  handle: async (message, env) => {
    const content = (message.content ?? '').trim();
    if (!content) return null;

    const rules = parseRules(env.COMMON_PLUGINS_CONFIG || env.COMMON_PLUGINS_MAPPING);
    if (!rules.length) return null;

    const matchedRule = rules.find((rule) => keywordMatched(content, rule.keyword));
    if (!matchedRule) return null;

    try {
      // For link replies in base64 mode, treat rule.url as the final link and skip API fetch.
      if (matchedRule.mode === 'base64' && matchedRule.rType === 'link') {
        return toLinkReply(matchedRule, matchedRule.url);
      }

      const method = matchedRule.method ?? 'GET';
      const requestInit: RequestInit = {
        method,
        headers: matchedRule.headers,
      };

      if (method === 'POST' && matchedRule.body !== undefined) {
        requestInit.body = typeof matchedRule.body === 'string'
          ? matchedRule.body
          : JSON.stringify(matchedRule.body);
      }

      const response = await fetch(matchedRule.url, requestInit);
      if (!response.ok) {
        logger.error('通用插件请求失败', {
          status: response.status,
          url: matchedRule.url,
          rule: matchedRule.name ?? matchedRule.keyword,
        });
        return null;
      }

      const value = await extractValueByMode(matchedRule, response);
      if (value === undefined || value === null || value === '') {
        logger.warn('通用插件未提取到有效返回值', {
          url: matchedRule.url,
          jsonPath: matchedRule.jsonPath,
          mode: matchedRule.mode,
        });
        return null;
      }

      return await toReply(matchedRule, value);
    } catch (err) {
      logger.error('通用插件处理异常', err);
      return null;
    }
  },
};
