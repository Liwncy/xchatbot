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
        keywords: ['小姐姐', '小美女', '可爱美女'],
        endpoint: 'https://api.yujn.cn/api/zzxjj.php?type=json',
        parser: 'yujn-json',
    },
    {
        routeKey: 'ksxjjsp',
        name: '大姐姐',
        keywords: ['大姐姐', '大美女', '成熟美女'],
        endpoint: 'https://api.yujn.cn/api/ksxjjsp.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'juhexjj',
        name: '聚合',
        keywords: ['随机小姐姐', '各类小姐姐', '综合小姐姐'],
        endpoint: 'https://api.yujn.cn/api/juhexjj.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'rewu',
        name: '热舞',
        keywords: ['热舞', '跳舞', '舞蹈'],
        endpoint: 'https://api.yujn.cn/api/rewu.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'manzhan',
        name: '漫展',
        keywords: ['漫展', '漫展拍摄', '展会'],
        endpoint: 'https://api.yujn.cn/api/manzhan.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'shuaige',
        name: '帅哥',
        keywords: ['帅哥', '男大', '男模'],
        endpoint: 'https://api.52vmy.cn/api/video/boy',
        parser: 'nested-video-json',
    },
    {
        routeKey: 'heisi',
        name: '黑丝',
        keywords: ['黑丝', '黑丝视频', '黑丝小姐姐'],
        endpoint: 'https://api.yujn.cn/api/heisis.php?type=json',
        parser: 'yujn-json',
    },
    {
        routeKey: 'nande',
        name: '男德',
        keywords: ['男德', '腹肌', '肌肉男'],
        endpoint: 'https://api.yujn.cn/api/ndym.php?type=json',
        parser: 'yujn-json',
    },
    {
        routeKey: 'qingchun',
        name: '清纯',
        keywords: ['清纯', '清纯美女', '清纯系'],
        endpoint: 'https://api.yujn.cn/api/qingchun.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'tianmei',
        name: '甜妹',
        keywords: ['甜妹', '甜妹子', '软妹'],
        endpoint: 'https://api.yujn.cn/api/tianmei.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'luoli',
        name: '萝莉',
        keywords: ['萝莉', '萝莉系', '软萌萝莉'],
        endpoint: 'https://api.yujn.cn/api/luoli.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'duilian',
        name: '自拍',
        keywords: ['怼脸', '怼脸自拍', '近景自拍'],
        endpoint: 'https://api.yujn.cn/api/duilian.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'jksp',
        name: '洛丽塔',
        keywords: ['JK', '洛丽塔', '蛋糕裙'],
        endpoint: 'https://api.yujn.cn/api/jksp.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'baisi',
        name: '白丝',
        keywords: ['白丝', '白丝视频', '白丝小姐姐'],
        endpoint: 'https://api.yujn.cn/api/baisis.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'diaodai',
        name: '吊带',
        keywords: ['吊带', '吊带系列', '吊带小姐姐'],
        endpoint: 'https://api.yujn.cn/api/diaodai.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'yuzu',
        name: '玉足',
        keywords: ['玉足', '美腿', '玉足美腿'],
        endpoint: 'https://api.yujn.cn/api/yuzu.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'sbkl',
        name: '双倍快乐',
        keywords: ['双倍快乐', '双人视频', '双倍快乐视频'],
        endpoint: 'https://api.yujn.cn/api/sbkl.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'bianzhuang',
        name: '变装',
        keywords: ['变装', '抖音变装', '变装视频'],
        endpoint: 'https://api.yujn.cn/api/bianzhuang.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'shejie',
        name: '蛇姐',
        keywords: ['蛇姐', '蛇姐视频', '杀猪饲料蛇姐'],
        endpoint: 'https://api.yujn.cn/api/shejie.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'jjy',
        name: '鞠婧祎',
        keywords: ['鞠婧祎', '抖音鞠婧祎', '鞠婧祎视频'],
        endpoint: 'https://api.yujn.cn/api/jjy.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'xgg',
        name: '小哥哥',
        keywords: ['小哥哥', '男神', '小鲜肉'],
        endpoint: 'https://api.yujn.cn/api/xgg.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'xiaoxiao',
        name: '潇潇',
        keywords: ['潇潇', '抖音潇潇', '潇潇视频'],
        endpoint: 'https://api.yujn.cn/api/xiaoxiao.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'manhuay',
        name: '漫画芋',
        keywords: ['漫画芋', '漫画芋视频', '漫画芋博主'],
        endpoint: 'https://api.yujn.cn/api/manhuay.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'manyao',
        name: '慢摇',
        keywords: ['慢摇', '慢摇系列', '慢摇视频'],
        endpoint: 'https://api.yujn.cn/api/manyao.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'cos',
        name: '尻瑟',
        keywords: ['COS', 'cosplay', '角色扮演'],
        endpoint: 'https://api.yujn.cn/api/COS.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'mengwa',
        name: '萌娃',
        keywords: ['萌娃', '可爱小孩', '萌娃视频'],
        endpoint: 'https://api.yujn.cn/api/mengwa.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'haibian',
        name: '风景',
        keywords: ['海边', '晚霞', '海边晚霞'],
        endpoint: 'https://api.yujn.cn/api/haibian.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'pcfj',
        name: '壁纸',
        keywords: ['PC风景', '电脑风景', '风景壁纸'],
        endpoint: 'https://api.yujn.cn/api/pcfj.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'pcfjsp',
        name: '漫屋',
        keywords: ['二次元房间', '二次元背景', '动漫房间'],
        endpoint: 'https://api.yujn.cn/api/pcfjsp.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'zuqiu',
        name: '足球',
        keywords: ['足球', 'C罗', '世界杯'],
        endpoint: 'https://api.yujn.cn/api/zuqiu.php',
        parser: 'redirect-url',
    },
    {
        routeKey: 'ps',
        name: '劈图',
        keywords: ['PS', 'PS技巧', 'photoshop'],
        endpoint: 'https://api.yujn.cn/api/ps.php',
        parser: 'redirect-url',
    },
];

function routeFallbackTitle(route: VideoRoute): string {
    return `${route.name}视频`;
}

function routeFallbackDescription(route: VideoRoute): string {
    return `${route.name} · ${route.keywords.join(' / ')}`;
}

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

function getRouteMatchScore(route: VideoRoute, normalized: string): number {
    const routeKey = route.routeKey.toLowerCase();
    const routeName = normalizeInput(route.name).toLowerCase();
    const keywords = route.keywords.map((keyword) => normalizeInput(keyword).toLowerCase());

    if (normalized === routeKey) return 10000 + routeKey.length;
    if (normalized === routeName) return 9000 + routeName.length;

    const exactKeyword = keywords.find((keyword) => normalized === keyword);
    if (exactKeyword) return 8000 + exactKeyword.length;

    const routeKeyIncluded = normalized.includes(routeKey) ? routeKey.length : 0;
    const routeNameIncluded = normalized.includes(routeName) ? routeName.length : 0;
    const keywordIncluded = keywords
        .filter((keyword) => normalized.includes(keyword))
        .reduce((max, keyword) => Math.max(max, keyword.length), 0);

    if (keywordIncluded > 0) return 7000 + keywordIncluded;
    if (routeNameIncluded > 0) return 6000 + routeNameIncluded;
    if (routeKeyIncluded > 0) return 5000 + routeKeyIncluded;
    return 0;
}

function findBestRoute(normalized: string): VideoRoute | null {
    let bestRoute: VideoRoute | null = null;
    let bestScore = 0;

    for (const route of VIDEO_ROUTES) {
        const score = getRouteMatchScore(route, normalized);
        if (score > bestScore) {
            bestScore = score;
            bestRoute = route;
        }
    }

    return bestRoute;
}

function findVideoRoute(keywordText: string): VideoRoute | null {
    const normalized = normalizeInput(keywordText).toLowerCase();
    if (!normalized) return null;

    return findBestRoute(normalized);
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

    const fuzzyRoute = findBestRoute(plain);
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
        title: result.title || routeFallbackTitle(route),
        description: result.description || routeFallbackDescription(route),
        url: url || result.videoUrl,
    };
}

function buildCoverPrompt(route: VideoRoute, result: ParsedVideoResult): string {
    const keyword = result.title?.trim() || route.name;
    return `“${keyword}”，这几字竖排居中，毛笔行书书法，宣纸质感背景，几笔内容简笔画，红色印章点缀，极简国风`;
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
            title: result.title || routeFallbackTitle(route),
            description: result.description || routeFallbackDescription(route),
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
    description: '以"我想看 / 我爱看 / 我要看"开头，先由 AI 提炼分类，再推荐对应视频',
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

