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

function messageText(value: unknown): string {
    if (typeof value === 'string') return value;
    const wrapped = asRecord(value);
    return typeof wrapped?.value === 'string' ? wrapped.value : '';
}

function pickCode(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^-?\d+$/u.test(value.trim())) return Number(value.trim());
    return undefined;
}

function deliveryItems(rec: Record<string, unknown>): unknown[] | undefined {
    if (Array.isArray(rec.list)) return rec.list;
    if (Array.isArray(rec.result)) return rec.result;
    return undefined;
}

function looksDelivered(rec: Record<string, unknown>): boolean {
    if (rec.new_id != null || rec.size != null || rec.id != null || rec.end_flag != null) return true;
    const list = asRecord(deliveryItems(rec)?.[0]);
    return Boolean(list && (pickCode(list.code) === 0 || list.new_id != null));
}

/** 顶层 code 为 0 时，仍可能在 list/result 里带回拒收（-22）或需好友验证（-44）。 */
function normalizeApiResponse(raw: unknown): ApiResponse {
    const parsed = asApiResponse(raw);
    const data = asRecord(parsed.data);
    const nested = data ? pickCode(asRecord(deliveryItems(data)?.[0])?.code) : undefined;
    if (parsed.code === 0 && nested != null && nested !== 0) {
        return {...parsed, code: nested};
    }
    return parsed;
}

/** 按响应内容类型挑选图片扩展名，Golem 靠文件名识别格式。 */
function imageFilename(contentType: string, url: string): string {
    const fromType: Record<string, string> = {
        'image/png': 'image.png',
        'image/jpeg': 'image.jpg',
        'image/gif': 'image.gif',
        'image/webp': 'image.webp',
        'image/bmp': 'image.bmp',
    };
    const byType = fromType[contentType.split(';')[0].trim().toLowerCase()];
    if (byType) return byType;
    const suffix = url.split('?')[0].match(/\.([a-z0-9]{2,5})$/iu);
    return suffix ? `image.${suffix[1].toLowerCase()}` : 'image';
}

async function downloadImageBytes(
    url: string,
): Promise<{data: ArrayBuffer; contentType: string; filename: string} | null> {
    if (!/^https?:\/\//iu.test(url)) return null;
    try {
        const response = await fetch(url, {signal: AbortSignal.timeout(20_000)});
        if (!response.ok) return null;
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType && !contentType.startsWith('image/')) return null;
        const data = await response.arrayBuffer();
        if (!data.byteLength) return null;
        return {data, contentType: contentType || 'image/png', filename: imageFilename(contentType, url)};
    } catch {
        return null;
    }
}

function forwardXmlPath(forwardType?: string): string {
    switch ((forwardType ?? '').trim().toLowerCase()) {
        case 'video':
            return '/api/message/forward/xml/video';
        case 'file':
            return '/api/message/forward/xml/file';
        default:
            return '/api/message/forward/xml/image';
    }
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
        message: messageText(rec.message) || messageText(nested?.message),
        data: rec.data !== undefined ? rec.data : raw,
    };
}

export class GolemApi {
    private readonly baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }

    async sendText(params: {receiver: string; content: string; remind?: string}): Promise<ApiResponse> {
        return this.postJson('/api/message/text', JSON.stringify(params));
    }

    async sendImage(params: {receiver: string; imageUrl: string}): Promise<ApiResponse> {
        const form = new FormData();
        form.append('receiver', params.receiver);
        const bytes = await downloadImageBytes(params.imageUrl.trim());
        if (bytes) {
            // Golem 从 URL 下载需要它自己出网，部分图片域名它直连不通；
            // worker 先把图拉下来，直接以 file 上传，URL 仅作回退。
            form.append('file', new Blob([bytes.data], {type: bytes.contentType}), bytes.filename);
        } else {
            form.append('url', params.imageUrl.trim());
        }
        return this.postForm('/api/message/image', form);
    }

    async sendEmoji(params: {receiver: string; md5?: string; emojiUrl?: string}): Promise<ApiResponse> {
        const form = new FormData();
        form.append('receiver', params.receiver);
        if (params.md5) form.append('md5', params.md5);
        if (params.emojiUrl) form.append('url', params.emojiUrl);
        return this.postForm('/api/message/emoji', form);
    }

    async sendLink(params: {
        receiver: string;
        title: string;
        desc?: string;
        url: string;
        thumbUrl?: string;
    }): Promise<ApiResponse> {
        return this.postJson('/api/message/link', JSON.stringify({
            receiver: params.receiver,
            title: params.title,
            desc: params.desc ?? '',
            url: params.url,
            thumb_url: params.thumbUrl ?? '',
        }));
    }

    async sendVideo(params: {
        receiver: string;
        videoUrl: string;
        thumbUrl?: string;
        thumb?: Blob;
        duration?: number;
    }): Promise<ApiResponse> {
        const form = new FormData();
        form.append('receiver', params.receiver);
        form.append('video_url', params.videoUrl);
        if (params.duration != null && params.duration > 0) {
            form.append('duration', String(params.duration));
        }
        if (params.thumbUrl) form.append('thumb_url', params.thumbUrl);
        if (params.thumb) form.append('thumb_file', params.thumb, 'thumb.jpg');
        return this.postForm('/api/message/video', form);
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
            form.append('file', params.voice, 'voice.silk');
        } else if (params.voiceUrl) {
            form.append('url', params.voiceUrl);
        }
        return this.postForm('/api/message/voice', form);
    }

    async sendApp(params: {receiver: string; appType: number; xml: string}): Promise<ApiResponse> {
        return this.postJson('/api/message/app', JSON.stringify({
            receiver: params.receiver,
            type: params.appType,
            xml: params.xml,
        }));
    }

    async sendCard(params: {
        receiver: string;
        username: string;
        nickname?: string;
        alias?: string;
    }): Promise<ApiResponse> {
        return this.postJson('/api/message/namecard', JSON.stringify({
            receiver: params.receiver,
            username: params.username,
            nickname: params.nickname ?? '',
            alias: params.alias ?? '',
        }));
    }

    async sendPosition(params: {
        receiver: string;
        lat: number;
        lon: number;
        label?: string;
        poiName?: string;
        scale?: number;
    }): Promise<ApiResponse> {
        return this.postJson('/api/message/position', JSON.stringify({
            receiver: params.receiver,
            lat: params.lat,
            lon: params.lon,
            label: params.label ?? '',
            name: params.poiName ?? '',
            scale: params.scale ?? 15,
        }));
    }

    async sendForward(params: {
        receiver: string;
        xml: string;
        forwardType?: string;
    }): Promise<ApiResponse> {
        return this.postJson(forwardXmlPath(params.forwardType), JSON.stringify({
            receiver: params.receiver,
            xml: params.xml,
        }));
    }

    async uploadRecordImage(url: string): Promise<{fileId: string; aesKey: string} | null> {
        const form = new FormData();
        form.append('url', url);
        form.append('purpose', 'record');
        const result = await this.postForm('/api/cdn/upload/image', form);
        if (result.code !== 0) return null;
        const data = asRecord(result.data);
        const fileId = typeof data?.file_id === 'string' ? data.file_id.trim() : '';
        const aesKey = typeof data?.aes_key === 'string' ? data.aes_key.trim() : '';
        if (!fileId || !aesKey) return null;
        return {fileId, aesKey};
    }

    async cdnDownloadImageRaw(id: string, key: string): Promise<ArrayBuffer> {
        return this.getBinary('/api/cdn/download/image', {id, key});
    }

    async cdnDownloadVideoRaw(id: string, key: string): Promise<ArrayBuffer> {
        return this.getBinary('/api/cdn/download/video', {id, key});
    }

    async cdnDownloadVideoCoverRaw(id: string, key: string): Promise<ArrayBuffer> {
        return this.getBinary('/api/cdn/download/video_cover', {id, key});
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
        const url = new URL(`${this.baseUrl}/api/contact/search`);
        url.searchParams.set('keyword', params.keyword);
        url.searchParams.set('from_scene', String(params.fromScene ?? 1));
        url.searchParams.set('search_scene', String(params.searchScene ?? 2));
        const response = await fetch(url, {method: 'GET'});
        return normalizeApiResponse(await response.json());
    }

    async grabHongbao(params: {
        nativeUrl: string;
        inWay: 0 | 1;
        sessionUsername?: string;
    }): Promise<ApiResponse> {
        const body: Record<string, string | number> = {
            native_url: params.nativeUrl,
            in_way: params.inWay,
        };
        const session = params.sessionUsername?.trim();
        if (session) body.session_username = session;
        const result = await this.postJson('/api/payment/hongbao/grab', JSON.stringify(body));
        const data = asRecord(result.data);
        const platformCode = data ? pickCode(data.code) : undefined;
        if (result.code === 0 && platformCode != null && platformCode !== 0) {
            return {
                ...result,
                code: platformCode,
                message: messageText(data?.error_message) || messageText(data?.message) || result.message,
            };
        }
        return result;
    }

    async revokeMessage(params: RevokeParam): Promise<ApiResponse> {
        return this.postJson('/api/message/revoke', serializeRevokeParam(params));
    }

    private async postJson(path: string, body: string): Promise<ApiResponse> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body,
        });
        return this.parseResponse(path, response);
    }

    private async postForm(path: string, form: FormData): Promise<ApiResponse> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            body: form,
        });
        return this.parseResponse(path, response);
    }

    /** Golem 套在 Cloudflare 后面，524 等网关错误的响应体不是 JSON，直接 json() 会掩盖真实原因。 */
    private async parseResponse(path: string, response: Response): Promise<ApiResponse> {
        const text = await response.text();
        try {
            return normalizeApiResponse(JSON.parse(text) as unknown);
        } catch {
            const raw = text.replace(/\s+/g, ' ').trim();
            throw new Error(`Golem ${path} ${response.status}: ${raw.slice(0, 200) || 'empty response'}`);
        }
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
