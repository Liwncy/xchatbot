import {logger} from '../../utils/logger.js';

const GENERATE_URL = 'https://image.baidu.com/aigc/generate';
const QUERY_URL = 'https://image.baidu.com/aigc/query';
const DEFAULT_WIDTH = 512;
const DEFAULT_HEIGHT = 512;
const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_MAX_ATTEMPTS = 20;

const SCALES: Record<string, readonly [number, number]> = {
    '1:1': [512, 512],
    '3:4': [480, 640],
    '4:3': [640, 480],
    '16:9': [640, 360],
    '9:16': [360, 640],
};

export interface DrawRequestOptions {
    width?: number;
    height?: number;
    scale?: string;
    maxAttempts?: number;
    pollIntervalMs?: number;
    generateUrl?: string;
    queryUrl?: string;
}

interface DrawTaskPayload {
    taskid?: string;
    token?: string;
    timestamp?: string | number;
    [key: string]: unknown;
}

interface DrawQueryPicItem {
    src?: string;
    [key: string]: unknown;
}

interface DrawQueryPayload {
    status?: unknown;
    message?: string;
    isGenerate?: boolean;
    picArr?: DrawQueryPicItem[];
    [key: string]: unknown;
}

interface ParsedDrawCommand {
    prompt: string;
    width: number;
    height: number;
    scale: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeScale(scale?: string): string {
    const normalized = scale?.trim() || '1:1';
    return SCALES[normalized] ? normalized : '1:1';
}

function parseDrawCommand(content: string, options?: DrawRequestOptions): ParsedDrawCommand {
    const trimmed = content.trim();
    if (!trimmed) {
        throw new Error('绘图提示词不能为空');
    }

    const parts = trimmed.split(/\s+/).filter(Boolean);
    const explicitScale = options?.scale?.trim();
    const tailScale = parts.length > 1 ? parts[parts.length - 1] : '';
    const scale = normalizeScale(explicitScale || (SCALES[tailScale] ? tailScale : '1:1'));
    const [defaultWidth, defaultHeight] = SCALES[scale] ?? [DEFAULT_WIDTH, DEFAULT_HEIGHT];

    const promptParts = explicitScale || !SCALES[tailScale]
        ? parts
        : parts.slice(0, -1);
    const prompt = promptParts.join(' ').trim();
    if (!prompt) {
        throw new Error('绘图提示词不能为空');
    }

    return {
        prompt,
        width: options?.width ?? defaultWidth,
        height: options?.height ?? defaultHeight,
        scale,
    };
}

async function postForm(url: string, data: Record<string, string>): Promise<Response> {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(data)) {
        body.set(key, value);
    }

    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: body.toString(),
    });
}

export class DrawService {
    static async createTask(content: string, options?: DrawRequestOptions): Promise<DrawTaskPayload> {
        const command = parseDrawCommand(content, options);
        const generateUrl = options?.generateUrl?.trim() || GENERATE_URL;

        const response = await postForm(generateUrl, {
            querycate: '10',
            query: command.prompt,
            width: String(command.width),
            height: String(command.height),
        });

        if (!response.ok) {
            throw new Error(`创建绘图任务失败 status=${response.status}`);
        }

        const payload = (await response.json()) as DrawTaskPayload;
        if (!payload.taskid || !payload.token || payload.timestamp === undefined || payload.timestamp === null) {
            throw new Error(`创建绘图任务失败，返回缺少必要字段：${JSON.stringify(payload)}`);
        }

        logger.info('百度绘图任务创建成功', {
            prompt: command.prompt,
            scale: command.scale,
            width: command.width,
            height: command.height,
            taskid: payload.taskid,
        });
        return payload;
    }

    static async queryTask(task: DrawTaskPayload, options?: DrawRequestOptions): Promise<string | null> {
        const queryUrl = new URL(options?.queryUrl?.trim() || QUERY_URL);
        queryUrl.searchParams.set('taskid', String(task.taskid ?? ''));
        queryUrl.searchParams.set('token', String(task.token ?? ''));
        queryUrl.searchParams.set('timestamp', String(task.timestamp ?? ''));

        const response = await fetch(queryUrl.toString(), {method: 'GET'});
        if (!response.ok) {
            throw new Error(`查询绘图任务失败 status=${response.status}`);
        }

        const result = (await response.json()) as DrawQueryPayload;
        if (result.status !== undefined && result.status !== null && result.isGenerate !== true) {
            throw new Error(result.message?.trim() || '生成失败');
        }

        if (result.isGenerate && Array.isArray(result.picArr) && result.picArr.length > 0) {
            const src = result.picArr[0]?.src?.trim();
            return src || null;
        }

        return null;
    }

    static async draw(content: string, options?: DrawRequestOptions): Promise<string> {
        const task = await this.createTask(content, options);
        const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
        const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

        for (let i = 0; i < maxAttempts; i += 1) {
            await sleep(pollIntervalMs);
            const imageUrl = await this.queryTask(task, options);
            if (imageUrl) {
                logger.info('百度绘图生成成功', {taskid: task.taskid, imageUrl});
                return imageUrl;
            }
        }

        throw new Error('生成失败');
    }
}

