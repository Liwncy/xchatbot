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

function parseMessageId(value: unknown): number | string | undefined {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return /^\d+$/.test(trimmed) ? trimmed : undefined;
    }
    return parseNumeric(value);
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
    clientId: number | string | undefined,
    newId: number | string | undefined,
    createTime: number | undefined,
): RevokeParam | null {
    if (!receiver.trim() || newId == null) {
        return null;
    }
    const param: RevokeParam = {
        receiver: receiver.trim(),
        new_id: newId,
    };
    if (clientId != null) {
        param.client_id = clientId;
    }
    if (createTime != null) {
        param.create_time = createTime;
    }
    return param;
}

function resolveResponseData<T>(response: ApiResponse<T>): T | undefined {
    return response.data;
}

function pickNumericField(record: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
        const parsed = parseNumeric(record[key]);
        if (parsed != null) return parsed;
    }
    return undefined;
}

function pickMessageIdField(record: Record<string, unknown>, keys: string[]): number | string | undefined {
    for (const key of keys) {
        const parsed = parseMessageId(record[key]);
        if (parsed != null) return parsed;
    }
    return undefined;
}

function findRevokeFieldsInRecord(
    source: unknown,
    maxDepth = 3,
): {
    clientId?: number | string;
    newId?: number | string;
    createTime?: number;
    receiver?: string;
} | null {
    if (!source || typeof source !== 'object' || maxDepth < 0) return null;

    const queue: Array<{record: Record<string, unknown>; depth: number}> = [
        {record: source as Record<string, unknown>, depth: 0},
    ];
    const seen = new Set<object>();

    while (queue.length > 0) {
        const current = queue.shift();
        if (!current || seen.has(current.record)) continue;
        seen.add(current.record);

        const newId = pickMessageIdField(current.record, ['new_id', 'new_msg_id', 'newId', 'msgid']);
        const clientId = pickMessageIdField(current.record, ['client_id', 'clientId', 'id', 'msg_id']) ?? newId;
        const createTime = pickNumericField(current.record, ['create_time', 'createTime', 'createtime', 'server_time']);
        const nestedReceiver = parseReceiver(current.record.receiver, '');

        if (newId != null) {
            return {
                clientId,
                newId,
                ...(createTime != null ? {createTime} : {}),
                ...(nestedReceiver ? {receiver: nestedReceiver} : {}),
            };
        }

        if (current.depth >= maxDepth) continue;
        for (const value of Object.values(current.record)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                queue.push({record: value as Record<string, unknown>, depth: current.depth + 1});
            }
        }
    }

    return null;
}

function extractRevokeFromResponsePayload(
    receiver: string,
    response: ApiResponse<unknown>,
): RevokeParam | null {
    const root = response as unknown as Record<string, unknown>;
    const candidates: unknown[] = [];
    if (root.data != null) candidates.push(root.data);
    candidates.push(root);

    for (const candidate of candidates) {
        const fields = findRevokeFieldsInRecord(candidate);
        if (!fields) continue;
        return buildRevokeParam(
            fields.receiver || receiver,
            fields.clientId,
            fields.newId,
            fields.createTime,
        );
    }

    return null;
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
    return extractRevokeFromResponsePayload(receiver, response as ApiResponse<unknown>)
        ?? (() => {
            const data = resolveResponseData(response);
            if (!data) return null;
            return buildRevokeParam(
                parseReceiver(data.receiver, receiver),
                parseNumeric(data.client_id) ?? data.id,
                data.new_id ?? data.id,
                data.create_time ?? Math.floor(Date.now() / 1000),
            );
        })();
}

export function extractRevokeFromUploadVideoResponse(
    receiver: string,
    response: ApiResponse<UploadVideoResponse>,
): RevokeParam | null {
    return extractRevokeFromResponsePayload(receiver, response as ApiResponse<unknown>)
        ?? (() => {
            const data = resolveResponseData(response);
            if (!data) return null;
            const createTime = Math.floor(Date.now() / 1000);
            return buildRevokeParam(
                receiver,
                parseNumeric(data.client_id) ?? data.id,
                data.new_id ?? data.id,
                createTime,
            );
        })();
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
    const generic = extractRevokeFromResponsePayload(receiver, response as ApiResponse<unknown>);
    if (generic) return generic;

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
