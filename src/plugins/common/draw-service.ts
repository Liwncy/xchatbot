import type {Env} from '../../types/env.js';
import {logger} from '../../utils/logger.js';
import {getRequestContext} from '../../utils/request-context.js';

/** 默认对接 OpenAI 兼容的 images/generations；换服务商时改 DRAW_API_BASE_URL / DRAW_MODEL 即可 */
const DEFAULT_BASE_URL = 'https://api.siliconflow.cn/v1';
const DEFAULT_MODEL = 'Kwai-Kolors/Kolors';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_INFERENCE_STEPS = 20;
const DEFAULT_GUIDANCE_SCALE = 7.5;

/** 比例 → image_size */
const IMAGE_SIZES: Record<string, string> = {
    '1:1': '1024x1024',
    '3:4': '768x1024',
    '4:3': '1024x768',
    '16:9': '1024x576',
    '9:16': '576x1024',
};

export interface DrawRequestOptions {
    /** 宽高比，如 1:1 / 9:16；也可写在提示词末尾 */
    scale?: string;
    /** 显式传入 env；缺省从请求上下文读取 */
    env?: Env;
    /** 覆盖默认超时（毫秒） */
    timeoutMs?: number;
}

interface ParsedDrawCommand {
    prompt: string;
    scale: string;
    imageSize: string;
}

interface DrawImageResponse {
    images?: Array<{url?: string}>;
    data?: Array<{url?: string}>;
    [key: string]: unknown;
}

function normalizeScale(scale?: string): string {
    const normalized = scale?.trim() || '1:1';
    return IMAGE_SIZES[normalized] ? normalized : '1:1';
}

function parseDrawCommand(content: string, options?: DrawRequestOptions): ParsedDrawCommand {
    const trimmed = content.trim();
    if (!trimmed) {
        throw new Error('绘图提示词不能为空');
    }

    const parts = trimmed.split(/\s+/).filter(Boolean);
    const explicitScale = options?.scale?.trim();
    const tailScale = parts.length > 1 ? parts[parts.length - 1] : '';
    const scale = normalizeScale(explicitScale || (IMAGE_SIZES[tailScale] ? tailScale : '1:1'));

    const promptParts = explicitScale || !IMAGE_SIZES[tailScale]
        ? parts
        : parts.slice(0, -1);
    const prompt = promptParts.join(' ').trim();
    if (!prompt) {
        throw new Error('绘图提示词不能为空');
    }

    return {
        prompt,
        scale,
        imageSize: IMAGE_SIZES[scale] ?? IMAGE_SIZES['1:1'],
    };
}

function resolveEnv(options?: DrawRequestOptions): Env | undefined {
    return options?.env ?? getRequestContext()?.env;
}

function resolveApiKey(env?: Env): string {
    return env?.DRAW_API_KEY?.trim() || '';
}

function resolveBaseUrl(env?: Env): string {
    const configured = env?.DRAW_API_BASE_URL?.trim();
    if (configured) return configured.replace(/\/+$/u, '');
    return DEFAULT_BASE_URL;
}

function resolveModel(env?: Env): string {
    return env?.DRAW_MODEL?.trim() || DEFAULT_MODEL;
}

export class DrawService {
    /**
     * 共享文生图，返回图片 URL（调用方需尽快下载/转存）。
     * 默认 OpenAI 兼容 images/generations；换服务商改 DRAW_* 环境变量即可。
     */
    static async draw(content: string, options?: DrawRequestOptions): Promise<string> {
        const command = parseDrawCommand(content, options);
        const env = resolveEnv(options);
        const apiKey = resolveApiKey(env);
        if (!apiKey) {
            throw new Error('未配置 DRAW_API_KEY');
        }

        const baseUrl = resolveBaseUrl(env);
        const model = resolveModel(env);
        const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const endpoint = `${baseUrl}/images/generations`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            logger.info('共享绘图请求', {
                model,
                scale: command.scale,
                imageSize: command.imageSize,
                promptLength: command.prompt.length,
            });

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    prompt: command.prompt,
                    image_size: command.imageSize,
                    batch_size: 1,
                    num_inference_steps: DEFAULT_INFERENCE_STEPS,
                    guidance_scale: DEFAULT_GUIDANCE_SCALE,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 300);
                throw new Error(`共享绘图失败 status=${response.status} detail=${detail}`);
            }

            const payload = (await response.json()) as DrawImageResponse;
            const imageUrl = payload.images?.[0]?.url?.trim()
                || payload.data?.[0]?.url?.trim()
                || '';
            if (!imageUrl) {
                throw new Error(`共享绘图未返回图片 URL：${JSON.stringify(payload).slice(0, 300)}`);
            }

            logger.info('共享绘图成功', {
                model,
                imageUrl: imageUrl.slice(0, 120),
            });
            return imageUrl;
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`共享绘图超时 timeoutMs=${timeoutMs}`);
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }
}
