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

    async sendImage(params: {receiver: string; imageUrl: string}): Promise<ApiResponse> {
        const form = new FormData();
        form.append('receiver', params.receiver);
        form.append('image_url', params.imageUrl);
        const response = await fetch(`${this.baseUrl}/api/message/image`, {
            method: 'POST',
            body: form,
        });
        return response.json() as Promise<ApiResponse>;
    }

    async sendEmoji(params: {receiver: string; md5?: string; emojiUrl?: string}): Promise<ApiResponse> {
        const form = new FormData();
        form.append('receiver', params.receiver);
        if (params.md5) form.append('md5', params.md5);
        if (params.emojiUrl) form.append('emoji_url', params.emojiUrl);
        const response = await fetch(`${this.baseUrl}/api/message/emoji`, {
            method: 'POST',
            body: form,
        });
        return response.json() as Promise<ApiResponse>;
    }

    async sendLink(params: {
        receiver: string;
        title: string;
        desc?: string;
        url: string;
        thumbUrl?: string;
    }): Promise<ApiResponse> {
        const response = await fetch(`${this.baseUrl}/api/message/link`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                receiver: params.receiver,
                title: params.title,
                desc: params.desc ?? '',
                url: params.url,
                thumb_url: params.thumbUrl ?? '',
            }),
        });
        return response.json() as Promise<ApiResponse>;
    }

    async sendVideo(params: {
        receiver: string;
        videoUrl: string;
        thumbUrl?: string;
        thumb?: Blob;
        duration: number;
    }): Promise<ApiResponse> {
        const form = new FormData();
        form.append('receiver', params.receiver);
        form.append('video_url', params.videoUrl);
        form.append('duration', String(params.duration));
        if (params.thumbUrl) form.append('thumb_url', params.thumbUrl);
        if (params.thumb) form.append('thumb', params.thumb, 'thumb.jpg');
        const response = await fetch(`${this.baseUrl}/api/message/video`, {
            method: 'POST',
            body: form,
        });
        return response.json() as Promise<ApiResponse>;
    }

    async sendVoice(params: {
        receiver: string;
        voiceUrl: string;
        duration: number;
        format: number;
    }): Promise<ApiResponse> {
        const form = new FormData();
        form.append('receiver', params.receiver);
        form.append('voice_url', params.voiceUrl);
        form.append('duration', String(params.duration));
        form.append('format', String(params.format));
        const response = await fetch(`${this.baseUrl}/api/message/voice`, {
            method: 'POST',
            body: form,
        });
        return response.json() as Promise<ApiResponse>;
    }

    async sendApp(params: {receiver: string; appType: number; xml: string}): Promise<ApiResponse> {
        const response = await fetch(`${this.baseUrl}/api/message/app`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                receiver: params.receiver,
                type: params.appType,
                xml: params.xml,
            }),
        });
        return response.json() as Promise<ApiResponse>;
    }

    async sendCard(params: {
        receiver: string;
        username: string;
        nickname?: string;
        alias?: string;
    }): Promise<ApiResponse> {
        const response = await fetch(`${this.baseUrl}/api/message/card`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                receiver: params.receiver,
                card_username: params.username,
                card_nickname: params.nickname ?? '',
                card_alias: params.alias ?? '',
            }),
        });
        return response.json() as Promise<ApiResponse>;
    }

    async sendPosition(params: {
        receiver: string;
        lat: number;
        lon: number;
        label?: string;
        poiName?: string;
        scale?: number;
    }): Promise<ApiResponse> {
        const response = await fetch(`${this.baseUrl}/api/message/position`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                receiver: params.receiver,
                lat: params.lat,
                lon: params.lon,
                label: params.label ?? '',
                poi_name: params.poiName ?? '',
                scale: params.scale ?? 15,
            }),
        });
        return response.json() as Promise<ApiResponse>;
    }

    async sendForward(params: {
        receiver: string;
        xml: string;
        forwardType?: string;
    }): Promise<ApiResponse> {
        const response = await fetch(`${this.baseUrl}/api/message/forward`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                receiver: params.receiver,
                type: params.forwardType ?? 'image',
                xml: params.xml,
            }),
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
