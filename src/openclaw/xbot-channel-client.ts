import {logger} from '../utils/logger.js';
import type {XbotChannelRuntimeConfig} from './xbot-channel-config.js';
import type {XbotInboundPayload} from './xbot-inbound-mapper.js';

export interface XbotGatewayResponse {
    ok: boolean;
    dispatched?: boolean;
    reason?: string | null;
    error?: string;
    sessionKey?: string | null;
}

async function postXbotChannelRoute(
    config: XbotChannelRuntimeConfig,
    route: 'connect' | 'inbound' | 'activity',
    body: Record<string, unknown>,
): Promise<XbotGatewayResponse> {
    const url = `${config.gatewayBaseUrl.replace(/\/+$/u, '')}/api/channels/xbot/${route}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.gatewayToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        const rawText = await response.text();
        let data: XbotGatewayResponse | null = null;
        if (rawText.trim()) {
            try {
                data = JSON.parse(rawText) as XbotGatewayResponse;
            } catch {
                data = null;
            }
        }

        if (!response.ok) {
            const detail = data?.error?.trim()
                || rawText.trim().slice(0, 300)
                || `HTTP ${response.status}`;
            throw new Error(detail);
        }

        return data ?? {ok: true};
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`OpenClaw xbot 请求超时（>${config.requestTimeoutMs}ms）`);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

export async function ensureXbotChannelConnected(
    config: XbotChannelRuntimeConfig,
    options?: {wechatApiBaseUrl?: string},
): Promise<void> {
    await postXbotChannelRoute(config, 'connect', {
        accountId: 'Primary',
        clientId: config.clientId,
        connId: config.clientId,
        ...(options?.wechatApiBaseUrl?.trim()
            ? {wechatApiBaseUrl: options.wechatApiBaseUrl.trim()}
            : {}),
    });
}

export async function forwardInboundToXbotChannel(
    config: XbotChannelRuntimeConfig,
    payload: XbotInboundPayload,
): Promise<XbotGatewayResponse> {
    const result = await postXbotChannelRoute(config, 'inbound', {...payload});
    logger.debug('OpenClaw xbot.inbound 结果', {
        messageId: payload.messageId,
        dispatched: result.dispatched,
        reason: result.reason,
        sessionKey: result.sessionKey,
    });
    return result;
}
