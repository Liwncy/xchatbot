import type {RevokeParam} from '../wechat/api/types.js';

export const WECHAT_REVOKE_PAYLOAD_KEY = 'wechat_revoke';

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
        const clientId = typeof record.client_id === 'number' ? record.client_id : Number(record.client_id);
        const newId = typeof record.new_id === 'number' ? record.new_id : Number(record.new_id);
        const createTime = typeof record.create_time === 'number' ? record.create_time : Number(record.create_time);

        if (!receiver || !Number.isFinite(clientId) || !Number.isFinite(newId) || !Number.isFinite(createTime)) {
            return null;
        }

        return {
            receiver,
            client_id: Math.floor(clientId),
            new_id: Math.floor(newId),
            create_time: Math.floor(createTime),
        };
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
