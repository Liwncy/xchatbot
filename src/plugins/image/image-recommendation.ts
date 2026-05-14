import type {TextMessage} from '../types.js';
import {logger} from '../../utils/logger.js';
import {DrawService} from '../ai/draw-service.js';
import {requestAiText} from '../common/ai-client.js';

type ImageReplyScale = '1:1' | '3:4' | '4:3' | '16:9' | '9:16';

interface ImageRoute {
    routeKey: string;
    name: string;
    keywords: string[];
    endpoint: string | string[];
}

const TRIGGER_PREFIXES = ['看看', '来点', '爱看', '想看'] as const;
const DEFAULT_DRAW_SCALE: ImageReplyScale = '1:1';

const IMAGE_ROUTES: ImageRoute[] = [
    {
        routeKey: 'heisi',
        name: '黑丝',
        keywords: ['黑丝', '黑丝图', '黑丝图片'],
        endpoint: 'http://api.yujn.cn/api/heisi.php',
    },
    {
        routeKey: 'acg-yuanshen',
        name: '原神',
        keywords: ['原神', '原神图片', '原神壁纸'],
        endpoint: 'https://api.yujn.cn/api/gzl_ACG.php?type=image&form=%E5%8E%9F%E7%A5%9E',
    },
    {
        routeKey: 'acg-pc',
        name: 'PC',
        keywords: ['壁纸', '电脑', '电脑壁纸'],
        endpoint: 'https://api.yujn.cn/api/gzl_ACG.php?type=image&form=pc',
    },
    {
        routeKey: 'acg-pe',
        name: 'PE',
        keywords: ['PE', '手机', '手机壁纸'],
        endpoint: 'https://api.yujn.cn/api/gzl_ACG.php?type=image&form=pe',
    },
    {
        routeKey: 'acg-ai',
        name: 'AI美图',
        keywords: ['ai美图', 'ai图片', 'ai插画'],
        endpoint: 'https://api.yujn.cn/api/gzl_ACG.php?type=image&form=ai',
    },
    {
        routeKey: 'acg-mengban',
        name: '萌版',
        keywords: ['萌版', 'q版', '萌系'],
        endpoint: 'https://api.yujn.cn/api/gzl_ACG.php?type=image&form=%E8%90%8C%E7%89%88',
    },
    {
        routeKey: 'acg-avatar',
        name: '头像',
        keywords: ['头像', '二次元头像', '动漫头像'],
        endpoint: 'https://api.yujn.cn/api/gzl_ACG.php?type=image&form=%E5%A4%B4%E5%83%8F',
    },
    {
        routeKey: 'acg-scenery',
        name: '风景',
        keywords: ['风景', '动漫风景', '二次元风景'],
        endpoint: 'https://api.yujn.cn/api/gzl_ACG.php?type=image&form=%E9%A3%8E%E6%99%AF',
    },
    {
        routeKey: 'cosplay',
        name: 'COS写真',
        keywords: ['cos写真', 'cosplay写真', '角色扮演写真'],
        endpoint: 'https://api.yujn.cn/api/cosplay.php?type=json',
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
        .replace(/^(?:点|个|张|一下|一些)+/, '')
        .trim();
}

function getRouteMatchScore(route: ImageRoute, normalized: string): number {
    const routeKey = route.routeKey.toLowerCase();
    const routeName = normalizeInput(route.name).toLowerCase();
    const keywords = route.keywords.map((keyword) => normalizeInput(keyword).toLowerCase());

    if (normalized === routeKey) return 10000 + routeKey.length;
    if (normalized === routeName) return 9000 + routeName.length;

    const exactKeyword = keywords.find((keyword) => normalized === keyword);
    if (exactKeyword) return 8000 + exactKeyword.length;

    const routeNameIncluded = normalized.includes(routeName) ? routeName.length : 0;
    const keywordIncluded = keywords
        .filter((keyword) => normalized.includes(keyword))
        .reduce((max, keyword) => Math.max(max, keyword.length), 0);

    if (keywordIncluded > 0) return 7000 + keywordIncluded;
    if (routeNameIncluded > 0) return 6000 + routeNameIncluded;
    return 0;
}

function findBestRoute(normalized: string): ImageRoute | null {
    let bestRoute: ImageRoute | null = null;
    let bestScore = 0;

    for (const route of IMAGE_ROUTES) {
        const score = getRouteMatchScore(route, normalized);
        if (score > bestScore) {
            bestScore = score;
            bestRoute = route;
        }
    }

    return bestRoute;
}

function findImageRoute(keywordText: string): ImageRoute | null {
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
        const explicitNone = [parsed.routeKey, parsed.keyword, parsed.category]
            .some((value) => value === null || value === undefined || value === '');
        if (explicitNone) return null;

        const candidate = [parsed.routeKey, parsed.keyword, parsed.category]
            .find((value) => typeof value === 'string' && value.trim());
        if (typeof candidate === 'string') {
            const normalizedCandidate = candidate.trim().toLowerCase();
            if (['none', 'null', '未匹配', '无匹配'].includes(normalizedCandidate)) return null;
            return normalizedCandidate;
        }
    } catch {
        // 非 JSON 文本继续按纯字符串处理。
    }

    const plain = normalized.replace(/["'`\s]/g, '').toLowerCase();
    if (!plain || ['none', 'null', '未匹配', '无匹配'].includes(plain)) return null;

    const exactRoute = IMAGE_ROUTES.find((route) => route.routeKey === plain);
    if (exactRoute) return exactRoute.routeKey;

    const fuzzyRoute = findBestRoute(plain);
    return fuzzyRoute?.routeKey ?? null;
}

function buildAiClassifierPrompt(): string {
    const routeLines = IMAGE_ROUTES.map((route) =>
        `- ${route.routeKey}: ${route.name}（可匹配：${route.keywords.join('、')}）`,
    );

    return [
        '你是一个图片分类器。',
        '你的任务是根据用户的中文需求，从候选分类中选出最合适的一个 routeKey。',
        '如果没有合适分类，返回 none。',
        '只允许返回 routeKey 或 none。',
        '不要解释，不要换行，不要输出多余文本。',
        '可选分类如下：',
        ...routeLines,
        '输出示例：heisi',
        '输出示例：acg-pc',
        '输出示例：cosplay',
        '输出示例：none',
    ].join('\n');
}

async function classifyRouteWithAi(requestText: string, env: Parameters<TextMessage['handle']>[1]): Promise<ImageRoute | null> {
    if (!env.AI_API_URL?.trim()) return null;

    try {
        const aiText = await requestAiText(env, {
            input: requestText,
            systemPrompt: buildAiClassifierPrompt(),
        });
        const routeKey = aiText ? extractRouteKeyFromAiText(aiText) : null;
        if (!routeKey) {
            logger.warn('图片推荐 AI 未返回有效 routeKey', {requestText, aiText});
            return null;
        }

        const route = IMAGE_ROUTES.find((item) => item.routeKey === routeKey) ?? null;
        if (route) {
            logger.info('图片推荐 AI 分类命中', {requestText, routeKey, route: route.name});
        }
        return route;
    } catch (error) {
        logger.warn('图片推荐 AI 分类异常，回退本地匹配', {
            requestText,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

async function resolveImageRoute(requestText: string, env: Parameters<TextMessage['handle']>[1]): Promise<ImageRoute | null> {
    const aiRoute = await classifyRouteWithAi(requestText, env);
    if (aiRoute) return aiRoute;
    return findImageRoute(requestText);
}

function buildCategoryHelpText(): string {
    const lines = IMAGE_ROUTES.map((route) => `- ${route.name}：${route.keywords.join(' / ')}`);
    return [
        '你可以这样让我帮你生成图片：',
        '优先走 API 分类：',
        ...lines,
        '',
        '示例：',
        '- 看看黑丝（命中 API，直接返回图片）',
        '- 来点COS写真',
        '- 爱看原神',
        '- 想看风景',
        '- 看看一只穿宇航服的柴犬（未命中分类时走 AI 绘图）',
    ].join('\n');
}

function buildFallbackPrompt(requestText: string): string {
    return `${requestText}，数字艺术插画风格，主体清晰，构图完整，高清，细节丰富`;
}

function isLikelyHttpUrl(value: unknown): value is string {
    return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function pickRandomImageUrl(values: unknown): string | null {
    if (!Array.isArray(values) || values.length === 0) return null;

    const urls = values
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => isLikelyHttpUrl(item));
    if (urls.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * urls.length);
    return urls[randomIndex] ?? null;
}

function extractImageUrlFromJson(payload: unknown): string | null {
    const candidateKeys = ['url', 'img', 'image', 'pic', 'data', 'src'];
    if (!payload || typeof payload !== 'object') return null;

    const payloadImage = pickRandomImageUrl((payload as Record<string, unknown>).images);
    if (payloadImage) return payloadImage;

    for (const key of candidateKeys) {
        const value = (payload as Record<string, unknown>)[key];
        if (isLikelyHttpUrl(value)) return value.trim();
    }

    const nestedData = (payload as Record<string, unknown>).data;
    if (nestedData && typeof nestedData === 'object') {
        const nestedImage = pickRandomImageUrl((nestedData as Record<string, unknown>).images);
        if (nestedImage) return nestedImage;

        for (const key of candidateKeys) {
            const value = (nestedData as Record<string, unknown>)[key];
            if (isLikelyHttpUrl(value)) return value.trim();
        }
    }

    return null;
}

async function requestImageEndpoint(endpoint: string): Promise<string | null> {
    const response = await fetch(endpoint, {method: 'GET', redirect: 'manual'});

    if (response.status >= 300 && response.status < 400) {
        const redirectedUrl = response.headers.get('location')?.trim() ?? '';
        if (isLikelyHttpUrl(redirectedUrl)) {
            return redirectedUrl;
        }
    }

    if (!response.ok) {
        throw new Error(`status=${response.status}`);
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.includes('application/json')) {
        const payload = await response.json();
        return extractImageUrlFromJson(payload);
    }

    const finalUrl = response.url?.trim() ?? '';
    if (isLikelyHttpUrl(finalUrl)) {
        return finalUrl;
    }

    return isLikelyHttpUrl(endpoint) ? endpoint : null;
}

async function fetchImageByRoute(route: ImageRoute): Promise<string | null> {
    const endpoints = (Array.isArray(route.endpoint) ? route.endpoint : [route.endpoint])
        .map((item) => item.trim())
        .filter(Boolean);
    if (endpoints.length === 0) return null;

    for (const endpoint of endpoints) {
        try {
            const imageUrl = await requestImageEndpoint(endpoint);
            if (imageUrl) {
                return imageUrl;
            }
        } catch (error) {
            logger.warn('图片推荐 API 源请求失败，继续尝试下一个源', {
                route: route.name,
                endpoint,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return null;
}

export const imageRecommendationPlugin: TextMessage = {
    type: 'text',
    name: 'image-recommendation',
    description: '以"看看 / 来点 / 爱看 / 想看"开头优先走分类 API，未命中再 AI 绘图',
    match: (content) => TRIGGER_PREFIXES.some((prefix) => content.trim().startsWith(prefix)),
    handle: async (message, env) => {
        const keywordText = extractRequestKeyword(message.content ?? '');
        if (!keywordText) {
            return {
                type: 'text',
                content: buildCategoryHelpText(),
            };
        }

        const route = await resolveImageRoute(keywordText, env);
        if (route) {
            const imageUrl = await fetchImageByRoute(route);
            if (imageUrl) {
                return {
                    type: 'image',
                    mediaId: imageUrl,
                    originalUrl: imageUrl,
                };
            }

            logger.warn('图片推荐命中分类但 API 未返回有效图片，回退 AI 绘图', {
                route: route.name,
                keywordText,
            });
        }

        const prompt = buildFallbackPrompt(keywordText);

        try {
            const imageUrl = await DrawService.draw(prompt, {scale: DEFAULT_DRAW_SCALE});
            return {
                type: 'image',
                mediaId: imageUrl,
                originalUrl: imageUrl,
            };
        } catch (error) {
            logger.error('图片推荐插件生成失败', {
                keywordText,
                route: route?.name,
                prompt,
                error: error instanceof Error ? error.message : String(error),
            });
            return {
                type: 'text',
                content: route
                    ? `图片生成失败了，换个词再试试吧（分类：${route.name}）。`
                    : '图片生成失败了，换个描述再试试吧。',
            };
        }
    },
};

