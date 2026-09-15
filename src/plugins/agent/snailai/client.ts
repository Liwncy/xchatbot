/**
 * SnailAI OpenAPI 客户端。地址和凭证只放 env。
 *
 * 对齐官方 `/snail-ai/openapi/v1`：注册用户、订阅智能体、同步对话、上传图片附件。
 */
import type {Env} from '../../../types/env.js';
import {logger} from '../../../utils/logger.js';

const SUCCESS_CODES = new Set([1, 200, '1', '200']);
const DEFAULT_PREFIX = 'snail-ai';

type SnailResult<T> = {
    code?: number | string;
    status?: number | string;
    msg?: string;
    message?: string;
    data?: T;
};

export type SnailAiConfig = {
    baseUrl: string;
    appId: string;
    token: string;
    agentId: number;
    timeoutMs: number;
};

export function readSnailAiConfig(env: Env): SnailAiConfig | null {
    const origin = env.SNAIL_AI_BASE_URL?.trim().replace(/\/+$/u, '') ?? '';
    const appId = env.SNAIL_AI_APP_ID?.trim() ?? '';
    const token = env.SNAIL_AI_TOKEN?.trim() ?? '';
    if (!origin || !appId || !token) return null;
    const prefix = (env.SNAIL_AI_PREFIX?.trim() || DEFAULT_PREFIX).replace(/^\/+|\/+$/gu, '');
    const baseUrl = /\/openapi\/v1$/u.test(origin)
        ? origin
        : `${origin}/${prefix}/openapi/v1`;
    const agentRaw = Number.parseInt(String(env.SNAIL_AI_AGENT_ID ?? '1'), 10);
    const timeoutRaw = Number.parseInt(String(env.SNAIL_AI_TIMEOUT_MS ?? ''), 10);
    return {
        baseUrl,
        appId,
        token,
        agentId: Number.isFinite(agentRaw) && agentRaw > 0 ? agentRaw : 1,
        timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0
            ? Math.min(timeoutRaw, 900_000)
            : 180_000,
    };
}

function authHeaders(config: SnailAiConfig): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'Snail-Ai-App-Id': config.appId,
        'Snail-Ai-Token': config.token,
    };
}

function resultMessage(body: SnailResult<unknown>, fallback: string): string {
    return String(body.msg || body.message || fallback).trim() || fallback;
}

function resultCode(body: SnailResult<unknown>): number | string | undefined {
    return body.code ?? body.status;
}

function requireOk(body: SnailResult<unknown>, fallback: string): void {
    if (!SUCCESS_CODES.has(resultCode(body) as number | string)) {
        throw new Error(resultMessage(body, fallback));
    }
}

function unwrap<T>(body: SnailResult<T>, fallback: string): T {
    requireOk(body, fallback);
    if (body.data == null) throw new Error(`${fallback}，返回为空`);
    return body.data;
}

async function postJson<T>(
    config: SnailAiConfig,
    path: string,
    payload: unknown,
    timeoutMs = config.timeoutMs,
): Promise<SnailResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${config.baseUrl}${path}`, {
            method: 'POST',
            headers: authHeaders(config),
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        const text = await response.text();
        if (!text.trim()) {
            throw new Error(`SnailAI HTTP ${response.status} 空响应`);
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(text) as unknown;
        } catch {
            throw new Error(`SnailAI HTTP ${response.status}: ${text.slice(0, 200)}`);
        }
        if (!response.ok) {
            const body = parsed as SnailResult<T>;
            throw new Error(resultMessage(body, `SnailAI HTTP ${response.status}`));
        }
        return parsed as SnailResult<T>;
    } finally {
        clearTimeout(timer);
    }
}

export async function registerOpenId(
    config: SnailAiConfig,
    externalId: string,
    nickname: string,
): Promise<string> {
    const body = await postJson<{openId?: string}>(config, '/user/register', {
        externalId,
        nickname: nickname.trim() || externalId,
    }, Math.min(config.timeoutMs, 15_000));
    const data = unwrap(body, '注册用户失败');
    const openId = data.openId?.trim() ?? '';
    if (!openId) throw new Error('注册用户失败，openId 为空');
    return openId;
}

export async function subscribeAgent(
    config: SnailAiConfig,
    openId: string,
): Promise<void> {
    const body = await postJson<unknown>(config, '/user/agent', {
        openId,
        agentId: config.agentId,
    }, Math.min(config.timeoutMs, 15_000));
    requireOk(body, '订阅智能体失败');
}

export async function uploadChatImage(
    config: SnailAiConfig,
    openId: string,
    fileName: string,
    bytes: Uint8Array,
): Promise<number> {
    const content = bytesToBase64(bytes);
    const body = await postJson<{id?: number}>(config, '/resource/upload', {
        openId,
        originalName: fileName || 'image.jpg',
        fileSize: bytes.byteLength,
        content,
        bizType: 'ATTACHMENT',
    }, Math.min(config.timeoutMs, 30_000));
    const data = unwrap(body, '上传图片失败');
    if (data.id == null) throw new Error('上传图片失败，resourceId 为空');
    return data.id;
}

export async function chatSync(
    config: SnailAiConfig,
    openId: string,
    conversationId: string,
    content: string,
    imageIds: number[] = [],
): Promise<string> {
    const attachments = imageIds.map((resourceId) => ({type: 'IMAGE', resourceId}));
    const body = await postJson<{content?: string; answer?: string}>(config, '/agent/chat/sync', {
        agentId: config.agentId,
        openId,
        conversationId,
        content: content.trim() || '请看这张图片',
        ...(attachments.length ? {attachments} : {}),
    });
    const data = unwrap(body, '同步对话失败');
    return (data.content ?? data.answer ?? '').trim();
}

export async function fetchImageBytes(url: string): Promise<{bytes: Uint8Array; mime: string} | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || '';
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.byteLength) return null;
        return {bytes, mime};
    } catch (error) {
        logger.warn('SnailAI 拉图失败', {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

export function canUploadImage(mime: string, bytes: Uint8Array): boolean {
    if (bytes.byteLength > 10 * 1024 * 1024) return false;
    const sniffed = sniffImageMime(bytes) || mime;
    return sniffed === 'image/jpeg' || sniffed === 'image/png' || sniffed === 'image/webp';
}

export function imageFileName(mime: string): string {
    if (mime.includes('png')) return 'image.png';
    if (mime.includes('webp')) return 'image.webp';
    return 'image.jpg';
}

function sniffImageMime(bytes: Uint8Array): string {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        return 'image/png';
    }
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
        return 'image/webp';
    }
    return '';
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}
