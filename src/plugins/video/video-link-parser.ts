import type {TextMessage} from '../types.js';
import {logger} from '../../utils/logger.js';

interface VideoParseApiResponse {
    code?: number;
    msg?: string;
    data?: unknown;
    [key: string]: unknown;
}

// 短视频解析插件配置（按需改为你的真实解析 API）
const CONFIG = {
    apiUrl: 'https://api.dudunas.top/api/qushuiyin',
    appSecret: 'a3c838e4dfbd21b3ab09e81ccd8b185d',
} as const;

const SHORT_VIDEO_PLATFORM_RULES: Array<{platform: string; domains: string[]}> = [
    {platform: '抖音', domains: ['douyin.com', 'iesdouyin.com']},
    {platform: '快手', domains: ['kuaishou.com', 'chenzhongtech.com']},
    {platform: '小红书', domains: ['xiaohongshu.com', 'xhslink.com']},
    {platform: '哔哩哔哩', domains: ['bilibili.com', 'b23.tv']},
    {platform: '微博', domains: ['weibo.com', 'weibocdn.com']},
    {platform: '视频号', domains: ['weixin.qq.com', 'mp.weixin.qq.com']},
    {platform: '西瓜视频', domains: ['ixigua.com']},
];

const VIDEO_URL_KEYS = new Set([
    'url',
    'video_url',
    'videourl',
    'play_url',
    'playurl',
    'nwm_url',
    'nwmurl',
    'download_url',
    'downloadurl',
    'share_url',
    'shareurl',
    'jump_url',
    'jumpurl',
]);

const TITLE_KEYS = new Set([
    'title',
    'desc',
    'description',
    'text',
    'content',
]);

const COVER_KEYS = new Set([
    'cover',
    'cover_url',
    'coverurl',
    'pic',
    'pic_url',
    'picurl',
    'image',
    'image_url',
    'imageurl',
    'thumb',
    'thumbnail',
]);

function cleanUrl(raw: string): string {
    return raw.trim().replace(/[)\]}>.,，。！？!?;；]+$/g, '');
}

function extractUrls(content: string): string[] {
    const matches = content.match(/https?:\/\/[^\s]+/gi) ?? [];
    return matches.map(cleanUrl).filter(Boolean);
}

function parseHostname(url: string): string | null {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return null;
    }
}

function matchPlatformByUrl(url: string): string | null {
    const hostname = parseHostname(url);
    if (!hostname) return null;

    const matched = SHORT_VIDEO_PLATFORM_RULES.find((rule) =>
        rule.domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)),
    );
    return matched?.platform ?? null;
}

function findShortVideoShareUrl(content: string): {url: string; platform: string} | null {
    const urls = extractUrls(content);
    for (const url of urls) {
        const platform = matchPlatformByUrl(url);
        if (platform) return {url, platform};
    }
    return null;
}

function findFirstStringByKeys(input: unknown, keys: Set<string>): string | null {
    const queue: unknown[] = [input];
    while (queue.length > 0) {
        const current = queue.shift();
        if (current == null) continue;

        if (typeof current === 'string') {
            const candidate = current.trim();
            if (/^https?:\/\//i.test(candidate) && keys === VIDEO_URL_KEYS) return candidate;
            continue;
        }

        if (Array.isArray(current)) {
            queue.push(...current);
            continue;
        }

        if (typeof current === 'object') {
            for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
                const lower = key.toLowerCase();
                if (keys.has(lower) && typeof value === 'string' && value.trim()) {
                    return value.trim();
                }
                if (value && typeof value === 'object') queue.push(value);
                if (Array.isArray(value)) queue.push(...value);
            }
        }
    }
    return null;
}

function normalizeApiResult(
    payload: VideoParseApiResponse,
): {url: string | null; title: string | null; cover: string | null} {
    const rootUrl = findFirstStringByKeys(payload, VIDEO_URL_KEYS);
    const dataUrl = findFirstStringByKeys(payload.data, VIDEO_URL_KEYS);
    const url = dataUrl || rootUrl;

    const rootTitle = findFirstStringByKeys(payload, TITLE_KEYS);
    const dataTitle = findFirstStringByKeys(payload.data, TITLE_KEYS);
    const title = dataTitle || rootTitle;

    const rootCover = findFirstStringByKeys(payload, COVER_KEYS);
    const dataCover = findFirstStringByKeys(payload.data, COVER_KEYS);
    const cover = dataCover || rootCover;

    return {url, title, cover};
}

export const videoLinkParserPlugin: TextMessage = {
    type: 'text',
    name: 'video-link-parser',
    description: '识别短视频分享链接，调用解析 API 后返回链接消息',

    match: (content) => Boolean(findShortVideoShareUrl(content)),

    handle: async (message, _env) => {
        const content = (message.content ?? '').trim();
        if (!content) return null;

        const apiUrl = CONFIG.apiUrl.trim();
        if (!apiUrl) {
            logger.warn('视频解析插件未配置 CONFIG.apiUrl');
            return null;
        }

        const matched = findShortVideoShareUrl(content);
        if (!matched) return null;

        try {
            const requestUrl = new URL(apiUrl);
            requestUrl.searchParams.set('AppSecret', CONFIG.appSecret);
            requestUrl.searchParams.set('text', content);

            const res = await fetch(requestUrl.toString(), {method: 'GET'});

            if (!res.ok) {
                logger.error('视频解析 API 请求失败', {
                    status: res.status,
                    apiUrl: requestUrl.toString(),
                    platform: matched.platform,
                });
                return null;
            }

            const payload = (await res.json()) as VideoParseApiResponse;
            const result = normalizeApiResult(payload);
            if (!result.url) {
                logger.warn('视频解析 API 未返回可用链接', {payload});
                return null;
            }

            return {
                type: 'news' as const,
                articles: [
                    {
                        title: result.title || `${matched.platform}视频解析结果`,
                        description: `${matched.platform}视频链接解析完成，点击查看。`,
                        url: result.url,
                        picUrl: result.cover || '',
                    },
                ],
            };
        } catch (err) {
            logger.error('视频解析插件执行异常', err);
            return null;
        }
    },
};

