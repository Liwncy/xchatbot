import type {TextMessage} from '../types.js';
import type {HandlerResponse, NewsArticle, VideoReply} from '../../types/message.js';
import {logger} from '../../utils/logger.js';
import {DrawService} from '../ai/draw-service.js';
import {requestAiText} from '../common/ai-client.js';

type VideoApiParser = 'yujn-json' | 'redirect-url' | 'nested-video-json';
type VideoReplyMode = 'video' | 'link' | 'auto';

/**
 * 视频推荐回复模式：
 * - video: 优先返回视频，失败时仍降级卡片
 * - link: 直接返回卡片链接（先转短链）
 * - auto: 优先返回视频，失败则返回卡片链接（先转短链）
 */
const VIDEO_REPLY_MODE: VideoReplyMode = 'video';

interface VideoRoute {
    routeKey: string;
    name: string;
    keywords: string[];
    endpoint: string | string[];
    parser: VideoApiParser;
    fallbackTitle: string;
    fallbackDescription: string;
}

interface ParsedVideoResult {
    videoUrl: string;
    title?: string;
    description?: string;
}

interface YujnVideoJsonResponse {
    code?: number;
    title?: string;
    data?: string;
    tips?: string;
}

interface NestedVideoJsonResponse {
    code?: number;
    msg?: string;
    data?: {
        video?: string;
    } | string;
}

interface GeneratedVideoCover {
    coverUrl?: string;
}

const TRIGGER_PREFIXES = ['我想看', '我爱看', '我要看'] as const;

const VIDEO_ROUTES: VideoRoute[] = [
    {
        routeKey: 'xjj',
        name: '小姐姐',
        keywords: ['小姐姐', '甜妹', '美女', '好看小姐姐'],
        endpoint: 'https://api.yujn.cn/api/zzxjj.php?type=json',
        parser: 'yujn-json',
        fallbackTitle: '给你找了一条小姐姐视频',
        fallbackDescription: '点击即可查看本次推荐的视频。',
    },
    {
        routeKey: 'rewu',
        name: '热舞',
        keywords: ['热舞', '跳舞', '舞蹈'],
        endpoint: 'https://api.yujn.cn/api/rewu.php',
        parser: 'redirect-url',
        fallbackTitle: '给你找了一条热舞视频',
        fallbackDescription: '点击即可查看本次推荐的视频。',
    },
    {
        routeKey: 'manzhan',
        name: '漫展/COS',
        keywords: ['漫展', 'cos', 'coser', '二次元'],
        endpoint: 'https://api.yujn.cn/api/manzhan.php',
        parser: 'redirect-url',
        fallbackTitle: '给你找了一条漫展视频',
        fallbackDescription: '点击即可查看本次推荐的视频。',
    },
    {
        routeKey: 'shuaige',
        name: '帅哥',
        keywords: ['帅哥', '男大', '男神', '男模'],
        endpoint: 'https://api.52vmy.cn/api/video/boy',
        parser: 'nested-video-json',
        fallbackTitle: '给你找了一条帅哥视频',
        fallbackDescription: '点击即可查看本次推荐的视频。',
    },
    {
        routeKey: 'heisi',
        name: '黑丝',
        keywords: ['黑丝', '御姐'],
        endpoint: 'https://api.yujn.cn/api/heisis.php?type=json',
        parser: 'yujn-json',
        fallbackTitle: '给你找了一条黑丝风格视频',
        fallbackDescription: '点击即可查看本次推荐的视频。',
    },
    {
        routeKey: 'nande',
        name: '男德',
        keywords: ['男德', '腹肌', '型男'],
        endpoint: 'https://api.yujn.cn/api/ndym.php?type=json',
        parser: 'yujn-json',
        fallbackTitle: '给你找了一条男德视频',
        fallbackDescription: '点击即可查看本次推荐的视频。',
    },
];

function normalizeInput(value: string): string {
    return value.trim().replace(/\s+/g, '');
}

function extractRequestKeyword(content: string): string {
    const trimmed = content.trim();
    const matchedPrefix = TRIGGER_PREFIXES.find((prefix) => trimmed.startsWith(prefix));
    if (!matchedPrefix) return '';

    return trimmed
        .slice(matchedPrefix.length)
        .replace(/^[\s,，。.!！:：;；、~-]+/, '')
        .replace(/^(?:点|个|条|一下|一些)+/, '')
        .trim();
}

function findVideoRoute(keywordText: string): VideoRoute | null {
    const normalized = normalizeInput(keywordText).toLowerCase();
    if (!normalized) return null;

    return VIDEO_ROUTES.find((route) =>
        normalized === route.routeKey
        || normalized.includes(normalizeInput(route.name).toLowerCase())
        || route.keywords.some((keyword) => normalized.includes(normalizeInput(keyword).toLowerCase())),
    ) ?? null;
}

function extractRouteKeyFromAiText(content: string): string | null {
    const trimmed = content.trim();
    if (!trimmed) return null;

    const normalized = trimmed
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .trim();

    try {
        const parsed = JSON.parse(normalized) as Record<string, unknown>;
        const candidate = [parsed.routeKey, parsed.keyword, parsed.category]
            .find((value) => typeof value === 'string' && value.trim());
        if (typeof candidate === 'string') {
            return candidate.trim().toLowerCase();
        }
    } catch {
        // 非 JSON 文本继续按纯字符串处理。
    }

    const plain = normalized.replace(/["'`\s]/g, '').toLowerCase();
    if (!plain || plain === 'none') return null;

    const exactRoute = VIDEO_ROUTES.find((route) => route.routeKey === plain);
    if (exactRoute) return exactRoute.routeKey;

    const fuzzyRoute = VIDEO_ROUTES.find((route) =>
        plain.includes(route.routeKey)
        || plain.includes(normalizeInput(route.name).toLowerCase())
        || route.keywords.some((keyword) => plain.includes(normalizeInput(keyword).toLowerCase())),
    );
    return fuzzyRoute?.routeKey ?? null;
}

function buildAiClassifierPrompt(): string {
    const routeLines = VIDEO_ROUTES.map((route) =>
        `- ${route.routeKey}: ${route.name}（可匹配：${route.keywords.join('、')}）`,
    );

    return [
        '你是一个视频分类器。',
        '你的任务是根据用户的中文需求，从候选分类中选出最合适的一个 routeKey。',
        '只允许且必须返回一个 routeKey。',
        '不要解释，不要换行，不要输出多余文本。',
        '可选分类如下：',
        ...routeLines,
        '输出示例：xjj',
        '输出示例：rewu',
        '输出示例：热舞',
    ].join('\n');
}

async function classifyRouteWithAi(requestText: string, env: Parameters<TextMessage['handle']>[1]): Promise<VideoRoute | null> {
    if (!env.AI_API_URL?.trim()) return null;

    try {
        const aiText = await requestAiText(env, {
            input: requestText,
            systemPrompt: buildAiClassifierPrompt(),
        });
        const routeKey = aiText ? extractRouteKeyFromAiText(aiText) : null;
        if (!routeKey) {
            logger.warn('视频推荐 AI 未返回有效 routeKey', {requestText, aiText});
            return null;
        }

        const route = VIDEO_ROUTES.find((item) => item.routeKey === routeKey) ?? null;
        if (route) {
            logger.info('视频推荐 AI 分类命中', {requestText, routeKey, route: route.name});
        }
        return route;
    } catch (error) {
        logger.warn('视频推荐 AI 分类异常，回退本地匹配', {
            requestText,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

async function resolveVideoRoute(requestText: string, env: Parameters<TextMessage['handle']>[1]): Promise<VideoRoute | null> {
    const aiRoute = await classifyRouteWithAi(requestText, env);
    if (aiRoute) return aiRoute;
    return findVideoRoute(requestText);
}

function buildCategoryHelpText(): string {
    const lines = VIDEO_ROUTES.map((route) => `- ${route.name}：${route.keywords.join(' / ')}`);
    return [
        '你可以这样让我给你找视频：',
        ...lines,
        '',
        '示例：',
        '- 我想看小姐姐',
        '- 我爱看热舞',
        '- 我要看漫展',
        '- 我想看帅哥',
    ].join('\n');
}

function isLikelyHttpUrl(value: unknown): value is string {
    return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

async function parseYujnJson(endpoint: string): Promise<ParsedVideoResult | null> {
    const response = await fetch(endpoint, {method: 'GET'});
    if (!response.ok) {
        throw new Error(`status=${response.status}`);
    }

    const payload = (await response.json()) as YujnVideoJsonResponse;
    if (payload.code !== undefined && payload.code !== 200) return null;
    const videoUrl = typeof payload.data === 'string' ? payload.data.trim() : '';
    if (!videoUrl || !isLikelyHttpUrl(videoUrl)) return null;

    return {
        videoUrl,
        title: payload.title?.trim() || undefined,
        description: payload.tips?.trim() || undefined,
    };
}

async function parseRedirectUrl(endpoint: string): Promise<ParsedVideoResult | null> {
    const response = await fetch(endpoint, {
        method: 'GET',
        redirect: 'manual',
    });

    if (response.status >= 300 && response.status < 400) {
        const redirectedUrl = response.headers.get('location')?.trim() ?? '';
        if (redirectedUrl && isLikelyHttpUrl(redirectedUrl)) {
            return {videoUrl: redirectedUrl};
        }
    }

    if (!response.ok) {
        throw new Error(`status=${response.status}`);
    }

    const finalUrl = response.url?.trim() ?? '';
    if (!finalUrl || !isLikelyHttpUrl(finalUrl)) return null;

    return {videoUrl: finalUrl};
}

async function parseNestedVideoJson(endpoint: string): Promise<ParsedVideoResult | null> {
    const response = await fetch(endpoint, {method: 'GET'});
    if (!response.ok) {
        throw new Error(`status=${response.status}`);
    }

    const payload = (await response.json()) as NestedVideoJsonResponse;
    if (payload.code !== undefined && payload.code !== 200) return null;
    const nestedVideo = typeof payload.data === 'object' && payload.data
        ? payload.data.video
        : undefined;
    const directVideo = typeof payload.data === 'string' ? payload.data : nestedVideo;
    const videoUrl = typeof directVideo === 'string' ? directVideo.trim() : '';
    if (!videoUrl || !isLikelyHttpUrl(videoUrl)) return null;

    return {
        videoUrl,
        description: payload.msg?.trim() || undefined,
    };
}

async function fetchVideoByRoute(route: VideoRoute): Promise<ParsedVideoResult | null> {
    const endpoints = (Array.isArray(route.endpoint) ? route.endpoint : [route.endpoint])
        .map((item) => item.trim())
        .filter(Boolean);
    if (endpoints.length === 0) return null;

    const randomizedEndpoints = [...endpoints]
        .map((endpoint) => ({endpoint, sortKey: Math.random()}))
        .sort((a, b) => a.sortKey - b.sortKey)
        .map((item) => item.endpoint);

    let lastError: unknown = null;
    for (const endpoint of randomizedEndpoints) {
        try {
            switch (route.parser) {
                case 'yujn-json': {
                    const result = await parseYujnJson(endpoint);
                    if (result) return result;
                    break;
                }
                case 'redirect-url': {
                    const result = await parseRedirectUrl(endpoint);
                    if (result) return result;
                    break;
                }
                case 'nested-video-json': {
                    const result = await parseNestedVideoJson(endpoint);
                    if (result) return result;
                    break;
                }
                default:
                    return null;
            }
        } catch (error) {
            lastError = error;
            logger.warn('视频推荐分类接口尝试失败，继续切换下一个源', {
                route: route.name,
                endpoint,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    if (lastError) {
        throw lastError;
    }

    return null;
}

function buildNewsArticle(route: VideoRoute, result: ParsedVideoResult, url?: string): NewsArticle {
    return {
        title: result.title || route.fallbackTitle,
        description: result.description || route.fallbackDescription,
        url: url || result.videoUrl,
    };
}

function buildCoverPrompt(route: VideoRoute, result: ParsedVideoResult): string {
    const keyword = result.title?.trim() || route.name;
    return [
        '短视频封面',
        '简约设计',
        '白底',
        '干净排版',
        '竖屏 9:16',
        `中间竖着艺术大字：${keyword}`,
    ].filter(Boolean).join('，').slice(0, 180);
}

async function generateVideoCover(route: VideoRoute, result: ParsedVideoResult): Promise<GeneratedVideoCover> {
    try {
        const prompt = buildCoverPrompt(route, result);
        const coverUrl = await DrawService.draw(prompt, {scale: '9:16'});

        return {
            coverUrl,
        };
    } catch (error) {
        logger.warn('视频推荐 AI 封面生成失败，回退默认封面', {
            route: route.name,
            videoUrl: result.videoUrl,
            error: error instanceof Error ? error.message : String(error),
        });
        return {};
    }
}

async function buildSuccessReply(route: VideoRoute, result: ParsedVideoResult): Promise<HandlerResponse> {
    const generatedCover = await generateVideoCover(route, result);

    if (VIDEO_REPLY_MODE !== 'link' && isLikelyHttpUrl(result.videoUrl)) {
        return {
            type: 'video',
            mediaId: result.videoUrl,
            title: result.title || route.fallbackTitle,
            description: result.description || route.fallbackDescription,
            linkPicUrl: generatedCover.coverUrl,
            originalUrl: result.videoUrl,
        } satisfies VideoReply;
    }

    const article = buildNewsArticle(route, result, result.videoUrl);
    if (generatedCover.coverUrl) {
        article.picUrl = generatedCover.coverUrl;
    }

    if (VIDEO_REPLY_MODE === 'video') {
        return {
            type: 'news',
            articles: [article],
        };
    }

    return {
        type: 'news',
        articles: [article],
    };
}

export const videoRecommendationPlugin: TextMessage = {
    type: 'text',
    name: 'video-recommendation',
    description: '以“我想看 / 我爱看 / 我要看”开头，先由 AI 提炼分类，再推荐对应视频',
    match: (content) => TRIGGER_PREFIXES.some((prefix) => content.trim().startsWith(prefix)),
    handle: async (message, env) => {
        const keywordText = extractRequestKeyword(message.content ?? '');
        if (!keywordText) {
            return {
                type: 'text',
                content: buildCategoryHelpText(),
            };
        }

        const route = await resolveVideoRoute(keywordText, env);
        if (!route) {
            return {
                type: 'text',
                content: `暂时还没找到「${keywordText}」对应的视频分类。\n\n${buildCategoryHelpText()}`,
            };
        }

        try {
            const result = await fetchVideoByRoute(route);
            if (!result) {
                logger.warn('视频推荐插件未解析到有效视频地址', {route: route.name, endpoint: route.endpoint});
                return {
                    type: 'text',
                    content: `这次没有拿到可用的【${route.name}】视频，你再试一次吧。`,
                };
            }

            return buildSuccessReply(route, result);
        } catch (error) {
            logger.error('视频推荐插件请求失败', {
                route: route.name,
                endpoint: route.endpoint,
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                type: 'text',
                content: `获取【${route.name}】视频失败了，请稍后再试。`,
            };
        }
    },
};

