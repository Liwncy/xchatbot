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

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function pickCode(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^-?\d+$/u.test(value.trim())) return Number(value.trim());
    return undefined;
}

function looksDelivered(rec: Record<string, unknown>): boolean {
    if (rec.new_id != null || rec.size != null || rec.id != null || rec.end_flag != null) return true;
    const list = Array.isArray(rec.list) ? asRecord(rec.list[0]) : undefined;
    return Boolean(list && (pickCode(list.code) === 0 || list.new_id != null));
}

/** 文件上传成功时 Golem 常把语音包直接摊在根上，没有顶层 code。 */
function asApiResponse(raw: unknown): ApiResponse {
    const rec = asRecord(raw);
    if (!rec) return {code: -1, message: 'invalid response', data: raw};
    const data = asRecord(rec.data);
    const nested = asRecord(data?.base_response) ?? asRecord(rec.base_response);
    const payload = data ?? rec;
    const topCode = pickCode(rec.code);
    const nestedCode = pickCode(nested?.code);
    return {
        code: topCode ?? nestedCode ?? (looksDelivered(payload) || looksDelivered(rec) ? 0 : -1),
        message: typeof rec.message === 'string'
            ? rec.message
            : typeof nested?.message === 'string'
                ? nested.message
                : '',
        data: rec.data !== undefined ? rec.data : raw,
    };
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
        duration: number;
        format: number;
        voiceUrl?: string;
        voice?: Blob;
    }): Promise<ApiResponse> {
        const form = new FormData();
        form.append('receiver', params.receiver);
        form.append('duration', String(params.duration));
        form.append('format', String(params.format));
        if (params.voice) {
            form.append('voice', params.voice, 'voice.silk');
        } else if (params.voiceUrl) {
            form.append('voice_url', params.voiceUrl);
        }
        const response = await fetch(`${this.baseUrl}/api/message/voice`, {
            method: 'POST',
            body: form,
        });
        return asApiResponse(await response.json());
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

    async cdnDownloadImageRaw(id: string, key: string): Promise<ArrayBuffer> {
        return this.getBinary('/api/cdn/download/image', {id, key});
    }

    async cdnDownloadVideoRaw(id: string, key: string): Promise<ArrayBuffer> {
        return this.getBinary('/api/cdn/download/video', {id, key});
    }

    async cdnDownloadVideoCoverRaw(id: string, key: string): Promise<ArrayBuffer> {
        return this.getBinary('/api/cdn/download/video/cover', {id, key});
    }

    private async getBinary(path: string, query: Record<string, string>): Promise<ArrayBuffer> {
        const url = new URL(`${this.baseUrl}${path}`);
        for (const [name, value] of Object.entries(query)) {
            url.searchParams.set(name, value);
        }
        const response = await fetch(url.toString(), {method: 'GET'});
        if (!response.ok) {
            const raw = (await response.text()).replace(/\s+/g, ' ').trim();
            throw new Error(`Golem ${path} ${response.status}: ${raw.slice(0, 200)}`);
        }
        return response.arrayBuffer();
    }

    async getChatroomMembers(chatroom: string): Promise<unknown> {
        const id = encodeURIComponent(chatroom.trim());
        const response = await fetch(`${this.baseUrl}/api/chatroom/members/${id}`, {method: 'GET'});
        if (!response.ok) {
            const raw = (await response.text()).replace(/\s+/g, ' ').trim();
            throw new Error(`Golem /api/chatroom/members ${response.status}: ${raw.slice(0, 200)}`);
        }
        return response.json();
    }

    async searchContacts(params: {
        keyword: string;
        fromScene?: number;
        searchScene?: number;
    }): Promise<ApiResponse> {
        const response = await fetch(`${this.baseUrl}/api/contacts/search`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                keyword: params.keyword,
                from_scene: params.fromScene ?? 1,
                search_scene: params.searchScene ?? 2,
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
