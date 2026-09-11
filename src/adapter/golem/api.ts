import type {ApiResponse, RevokeParam} from './types.js';

function serializeJsonNumber(value: number | string): string {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('invalid JSON number');
        return String(Math.floor(value));
    }
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) throw new Error('invalid JSON number string');
    return trimmed;
}

function serializeRevokeParam(params: RevokeParam): string {
    const fields = [
        `"receiver":${JSON.stringify(params.receiver)}`,
        `"new_id":${serializeJsonNumber(params.new_id)}`,
    ];
    if (params.client_id != null) {
        fields.push(`"client_id":${serializeJsonNumber(params.client_id)}`);
    }
    if (params.create_time != null) {
        fields.push(`"create_time":${serializeJsonNumber(params.create_time)}`);
    }
    return `{${fields.join(',')}}`;
}

export class GolemApi {
    private readonly baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }

    async sendText(params: {receiver: string; content: string; remind?: string}): Promise<ApiResponse> {
        const response = await fetch(`${this.baseUrl}/api/message/text`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(params),
        });
        return response.json() as Promise<ApiResponse>;
    }

    async revokeMessage(params: RevokeParam): Promise<ApiResponse> {
        const response = await fetch(`${this.baseUrl}/api/message/revoke`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: serializeRevokeParam(params),
        });
        return response.json() as Promise<ApiResponse>;
    }
}

export function buildRevokeParam(
    receiver: string,
    clientId: number | string | undefined,
    newId: number | string | undefined,
    createTime: number | undefined,
): RevokeParam | null {
    if (!receiver.trim() || newId == null) return null;
    const param: RevokeParam = {
        receiver: receiver.trim(),
        new_id: newId,
    };
    if (clientId != null) param.client_id = clientId;
    if (createTime != null) param.create_time = createTime;
    return param;
}
