import type {RevokeParam} from '../wechat/api/types.js';

export const WECHAT_REVOKE_PAYLOAD_KEY = 'wechat_revoke';

function parseMessageId(value: unknown): number | string | null {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return /^\d+$/.test(trimmed) ? trimmed : null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.floor(value);
    }
    return null;
}

export function mergeWechatRevokeIntoPayload(
    payloadJson: string,
    revoke?: RevokeParam | null,
): string {
    const base = payloadJson.trim()
        ? JSON.parse(payloadJson) as Record<string, unknown>
        : {};
    if (revoke) {
        base[WECHAT_REVOKE_PAYLOAD_KEY] = revoke;
    }
    return JSON.stringify(base);
}

export function parseWechatRevokeFromPayload(payloadJson: string): RevokeParam | null {
    try {
        const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
        const raw = parsed[WECHAT_REVOKE_PAYLOAD_KEY];
        if (!raw || typeof raw !== 'object') return null;

        const record = raw as Record<string, unknown>;
        const receiver = typeof record.receiver === 'string' ? record.receiver.trim() : '';
        const clientId = parseMessageId(record.client_id);
        const newId = parseMessageId(record.new_id);
        const createTime = typeof record.create_time === 'number' ? record.create_time : Number(record.create_time);

        if (!receiver || newId == null) {
            return null;
        }

        const param: RevokeParam = {
            receiver,
            new_id: typeof newId === 'number' ? Math.floor(newId) : newId,
        };
        if (clientId != null) {
            param.client_id = typeof clientId === 'number' ? Math.floor(clientId) : clientId;
        }
        if (Number.isFinite(createTime)) {
            param.create_time = Math.floor(createTime);
        }
        return param;
    } catch {
        return null;
    }
}

export function stripWechatRevokeFromPayload(payloadJson: string): string {
    try {
        const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
        delete parsed[WECHAT_REVOKE_PAYLOAD_KEY];
        return JSON.stringify(parsed);
    } catch {
        return payloadJson;
    }
}
