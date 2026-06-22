import type {
    ApiResponse,
    RevokeParam,
    SendAppMessageResponse,
    SendMessageResponse,
    UploadEmojiResponse,
    UploadImageResponse,
    UploadVideoResponse,
    UploadVoiceResponse,
} from '../api/types.js';

function parseNumeric(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.floor(value);
    }
    if (typeof value === 'string') {
        const parsed = Number.parseInt(value.trim(), 10);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    if (value && typeof value === 'object' && 'value' in value) {
        return parseNumeric((value as {value?: unknown}).value);
    }
    return undefined;
}

function parseReceiver(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object' && 'value' in value) {
        const nested = (value as {value?: unknown}).value;
        if (typeof nested === 'string' && nested.trim()) return nested.trim();
    }
    return fallback;
}

export interface SentMessageRecord extends RevokeParam {
    replyType: string;
    preview?: string;
    storedAt: number;
}

export function buildRevokeParam(
    receiver: string,
    clientId: number | undefined,
    newId: number | undefined,
    createTime: number | undefined,
): RevokeParam | null {
    if (!receiver.trim() || clientId == null || newId == null || createTime == null) {
        return null;
    }
    return {
        receiver: receiver.trim(),
        client_id: clientId,
        new_id: newId,
        create_time: createTime,
    };
}

function resolveResponseData<T>(response: ApiResponse<T>): T | undefined {
    return response.data;
}

export function extractRevokeFromSendMessageResponse(
    receiver: string,
    response: ApiResponse<SendMessageResponse>,
): RevokeParam | null {
    const data = resolveResponseData(response);
    const item = data?.list?.find((entry) => entry.code === 0) ?? data?.list?.[0];
    if (!item) return null;
    return buildRevokeParam(
        parseReceiver(item.receiver, receiver),
        item.client_id ?? item.id,
        item.new_id ?? item.id,
        item.create_time,
    );
}

export function extractRevokeFromSendAppMessageResponse(
    receiver: string,
    response: ApiResponse<SendAppMessageResponse>,
): RevokeParam | null {
    const data = resolveResponseData(response);
    if (!data) return null;
    return buildRevokeParam(
        parseReceiver(data.receiver, receiver),
        parseNumeric(data.client_id) ?? data.id,
        data.new_id ?? data.id,
        data.create_time,
    );
}

export function extractRevokeFromUploadImageResponse(
    receiver: string,
    response: ApiResponse<UploadImageResponse>,
): RevokeParam | null {
    const data = resolveResponseData(response);
    if (!data) return null;
    return buildRevokeParam(
        parseReceiver(data.receiver, receiver),
        parseNumeric(data.client_id) ?? data.id,
        data.new_id ?? data.id,
        data.create_time,
    );
}

export function extractRevokeFromUploadVideoResponse(
    receiver: string,
    response: ApiResponse<UploadVideoResponse>,
): RevokeParam | null {
    const data = resolveResponseData(response);
    if (!data) return null;
    const createTime = Math.floor(Date.now() / 1000);
    return buildRevokeParam(
        receiver,
        parseNumeric(data.client_id) ?? data.id,
        data.new_id ?? data.id,
        createTime,
    );
}

export function extractRevokeFromUploadVoiceResponse(
    receiver: string,
    response: ApiResponse<UploadVoiceResponse>,
): RevokeParam | null {
    const data = resolveResponseData(response);
    if (!data) return null;
    return buildRevokeParam(
        parseReceiver(data.receiver, receiver),
        parseNumeric(data.client_id) ?? data.id,
        data.new_id ?? data.id,
        data.create_time,
    );
}

export function extractRevokeFromUploadEmojiResponse(
    receiver: string,
    response: ApiResponse<UploadEmojiResponse>,
): RevokeParam | null {
    const data = resolveResponseData(response);
    const item = data?.result?.find((entry) => entry.code === 0) ?? data?.result?.[0];
    if (!item) return null;
    const createTime = Math.floor(Date.now() / 1000);
    return buildRevokeParam(
        receiver,
        item.id,
        item.new_id ?? item.id,
        createTime,
    );
}

export function toSentMessageRecord(
    receiver: string,
    replyType: string,
    preview: string | undefined,
    param: RevokeParam | null,
): SentMessageRecord | null {
    if (!param) return null;
    return {
        ...param,
        receiver: param.receiver || receiver,
        replyType,
        preview,
        storedAt: Math.floor(Date.now() / 1000),
    };
}
