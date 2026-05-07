/**
 * 微信 API 客户端。
 *
 * 封装微信网关服务暴露的 HTTP 接口（详见 _docs/wechat/swagger.json），
 * 提供类型化的异步方法。
 *
 * 使用方式：
 *   const api = new WechatApi('http://gateway:8080');
 *   await api.sendText({ receiver: 'wxid_xxx', content: 'hello' });
 */

import type {
    ApiResponse,
    JsonObject,
    SendTextParam,
    SendImageParam,
    SendVideoParam,
    SendVoiceParam,
    SendEmojiParam,
    SendCardParam,
    SendLinkParam,
    SendPositionParam,
    SendAppParam,
    ForwardParam,
    RevokeParam,
    CreateHongBaoParam,
    QueryHongBaoDetailParam,
    GrabHongBaoParam,
    QueryHongBaoListParam,
    OpenHongBaoParam,
    ReceiveHongBaoParam,
    CreatePreTransferParam,
    ConfirmPreTransferParam,
    CollectMoneyParam,
    CdnDownloadImageParam,
    CdnUploadImageParam,
    CdnUploadVideoParam,
    CdnUploadMomentsImageParam,
    CdnUploadMomentsVideoParam,
    CdnDownloadVideoParam,
    CdnDownloadMomentsVideoParam,
    DownloadFileParam,
    DownloadImgParam,
    DownloadVideoParam,
    DownloadVoiceParam,
    SendMessageResponse,
    SendAppMessageResponse,
    UploadImageResponse,
    UploadVideoResponse,
    UploadVoiceResponse,
    UploadEmojiResponse,
    RevokeMessageResponse,
    HongBaoResponse,
    TenPayResponse,
    DownloadAppAttachResponse,
    DownloadImageResponse,
    DownloadVideoResponse,
    DownloadVoiceResponse,
    SyncResult,
    ContactsSyncQuery,
    ContactsPageQuery,
    FavorSyncQuery,
    MomentsTimelineQuery,
    UserCertQuery,
    UserQrcodeQuery,
    PasswordLoginRequest,
    ContactDetailRequest,
    SendFriendRequest,
    VerifyFriendRequest,
    LbsFindRequest,
    SetRemarkRequest,
    SearchContactRequest,
    UploadContactRequest,
    CreateGroupRequest,
    GroupMembersRequest,
    SetAnnouncementRequest,
    FacingCreateRequest,
    ConsentJoinRequest,
    ScanJoinRequest,
    ModifyContactLabelsRequest,
    AddLabelRequest,
    UpdateLabelRequest,
    MiniappAddAvatarRequest,
    MiniappUploadAvatarImgRequest,
    MiniappCloudCallFunctionRequest,
    MiniappJSLoginRequest,
    MiniappQrcodeAuthRequest,
    MiniappDelMobileRequest,
    MiniappAddMobileRequest,
    MiniappCheckVerifyCodeRequest,
    MiniappSendVerifyCodeRequest,
    OauthSdkAppParam,
    ThirdAppGrantParam,
    MiniappGetUserOpenIDRequest,
    MiniappOperateWxDataRequest,
    MiniappAddRecordRequest,
    MiniappGetSessionQRCodeRequest,
    MiniappGetRuntimeSessionRequest,
    PostParam,
    CommentParam,
    SetMomentsPrivacyParam,
    SetAliasRequest,
    BindEmailRequest,
    BindMobileRequest,
    SendVerifyMobileRequest,
    ReportMotionRequest,
    SetPasswordRequest,
    VerifyPasswordRequest,
    SetPrivacyRequest,
    UpdateProfileRequest,
    DelSafeDeviceRequest,
    MomentMediaUploadParam,
    PushConfig,
    StorageConfig,
} from './api-types.js';

const BROWSER_LIKE_HEADERS: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
};

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;
type QueryInput = object;
type BinaryLike = Blob | string;

export class WechatApi {
    private readonly baseUrl: string;
    private readonly requestHeaders: Record<string, string>;

    constructor(baseUrl: string) {
        // 移除尾部斜杠，避免调用方重复处理
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.requestHeaders = {
            ...BROWSER_LIKE_HEADERS,
            // Referer 跟随 WECHAT_API_BASE_URL，避免写死固定域名。
            Referer: this.baseUrl,
        };
    }

    // -----------------------------------------------------------------------
    // 内部辅助方法
    // -----------------------------------------------------------------------

    private buildPath(pathTemplate: string, pathParams?: QueryParams): string {
        let path = pathTemplate;
        for (const [key, value] of Object.entries(pathParams ?? {})) {
            if (value === undefined || value === null) continue;
            path = path.replace(new RegExp(`\\{${key}\\}`, 'g'), encodeURIComponent(String(value)));
        }
        return path;
    }

    private buildUrl(path: string, params?: QueryInput): URL {
        const url = new URL(`${this.baseUrl}${path}`);
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v === undefined || v === null) continue;
                url.searchParams.set(k, String(v));
            }
        }
        return url;
    }

    private async requestRaw(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        path: string,
        options?: {
            query?: QueryInput;
            body?: unknown;
            headers?: Record<string, string>;
        },
    ): Promise<Response> {
        const url = this.buildUrl(path, options?.query);
        const headers: Record<string, string> = {
            ...this.requestHeaders,
            ...options?.headers,
        };

        let body: BodyInit | undefined;
        if (options && 'body' in options && options.body !== undefined) {
            const payload = options.body;
            if (
                (typeof FormData !== 'undefined' && payload instanceof FormData)
                || (typeof Blob !== 'undefined' && payload instanceof Blob)
                || (typeof URLSearchParams !== 'undefined' && payload instanceof URLSearchParams)
                || typeof payload === 'string'
            ) {
                body = payload as BodyInit;
            } else {
                headers['Content-Type'] = 'application/json';
                body = JSON.stringify(payload);
            }
        }

        return fetch(url.toString(), {
            method,
            headers,
            body,
        });
    }

    private async parseJsonResponse<T>(path: string, res: Response): Promise<T> {
        const raw = await res.text();

        try {
            return JSON.parse(raw) as T;
        } catch {
            const compact = raw.replace(/\s+/g, ' ').trim();
            throw new Error(`WechatApi ${path} returned non-JSON response (status ${res.status}): ${compact}`);
        }
    }

    private async getBinary(path: string, params?: QueryInput): Promise<ArrayBuffer> {
        const res = await this.requestRaw('GET', path, {query: params});
        if (!res.ok) {
            const raw = await res.text();
            const compact = raw.replace(/\s+/g, ' ').trim();
            throw new Error(`WechatApi ${path} returned status ${res.status}: ${compact}`);
        }
        return res.arrayBuffer();
    }

    /** 发送 JSON POST 请求并返回解析后的响应体。 */
    private async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
        const res = await this.requestRaw('POST', path, {body});
        return this.parseApiResponse<T>(path, res);
    }

    private async postForm<T>(path: string, formData: FormData): Promise<ApiResponse<T>> {
        const res = await this.requestRaw('POST', path, {body: formData});
        return this.parseApiResponse<T>(path, res);
    }

    /** 发送 GET 请求（可附带查询参数）并返回解析后的 JSON。 */
    private async get<T>(path: string, params?: QueryInput): Promise<ApiResponse<T>> {
        const res = await this.requestRaw('GET', path, {query: params});
        return this.parseApiResponse<T>(path, res);
    }

    /** 发送不带 body 的 POST 请求（可附带查询参数）并返回解析后的 JSON。 */
    private async postQuery<T>(path: string, params?: QueryInput): Promise<ApiResponse<T>> {
        const res = await this.requestRaw('POST', path, {query: params});
        return this.parseApiResponse<T>(path, res);
    }

    /** 发送 PUT 请求并返回解析后的 JSON。 */
    private async put<T>(path: string, body?: unknown, params?: QueryInput): Promise<ApiResponse<T>> {
        const res = await this.requestRaw('PUT', path, {query: params, body});
        return this.parseApiResponse<T>(path, res);
    }

    /** 发送 DELETE 请求并返回解析后的 JSON。 */
    private async delete<T>(path: string, body?: unknown, params?: QueryInput): Promise<ApiResponse<T>> {
        const res = await this.requestRaw('DELETE', path, {query: params, body});
        return this.parseApiResponse<T>(path, res);
    }

    private buildMultipartFormData(fields: Array<[string, string | number | undefined]>, appendBinary?: (formData: FormData) => void): FormData {
        const formData = new FormData();
        for (const [key, value] of fields) {
            if (value === undefined || value === null) continue;
            formData.set(key, String(value));
        }
        appendBinary?.(formData);
        return formData;
    }

    private appendBinaryInput(
        formData: FormData,
        fieldName: string,
        input: BinaryLike | undefined,
        fileName: string,
        mimeType: string,
    ): void {
        if (input == null) return;
        if (typeof Blob !== 'undefined' && input instanceof Blob) {
            formData.set(fieldName, input, fileName);
            return;
        }
        const blob = this.base64ToBlob(String(input), mimeType);
        formData.set(fieldName, blob, fileName);
    }

    private base64ToBlob(base64: string, mimeType: string): Blob {
        const normalized = this.normalizeBase64Input(base64);
        const bytes = this.decodeBase64(normalized.base64);
        return new Blob([bytes], {type: normalized.mimeType || mimeType});
    }

    private normalizeBase64Input(input: string): {base64: string; mimeType?: string} {
        const trimmed = input.trim();
        const dataUrlMatch = trimmed.match(/^data:([^;,]+)?;base64,(.+)$/i);
        if (dataUrlMatch) {
            return {
                mimeType: dataUrlMatch[1]?.trim() || undefined,
                base64: dataUrlMatch[2].trim(),
            };
        }
        return {base64: trimmed};
    }

    private decodeBase64(base64: string): Uint8Array {
        if (typeof atob === 'function') {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) {
                bytes[index] = binary.charCodeAt(index);
            }
            return bytes;
        }
        const bufferCtor = (globalThis as typeof globalThis & {Buffer?: {from(input: string, encoding: string): Uint8Array}}).Buffer;
        if (bufferCtor) {
            return Uint8Array.from(bufferCtor.from(base64, 'base64'));
        }
        throw new Error('Base64 decode unavailable in current runtime');
    }

    private encodeBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        if (typeof btoa === 'function') {
            let binary = '';
            for (const byte of bytes) {
                binary += String.fromCharCode(byte);
            }
            return btoa(binary);
        }
        const bufferCtor = (globalThis as typeof globalThis & {Buffer?: {from(input: Uint8Array): {toString(encoding: string): string}}}).Buffer;
        if (bufferCtor) {
            return bufferCtor.from(bytes).toString('base64');
        }
        throw new Error('Base64 encode unavailable in current runtime');
    }

    private resolveImageDownloadQuery(params: CdnDownloadImageParam): {id: string; key: string} {
        return {id: params.id, key: params.key};
    }

    private resolveVideoDownloadQuery(params: CdnDownloadVideoParam): {id: string; key: string} {
        return {id: params.id, key: params.key};
    }

    private resolveMomentsVideoDownloadQuery(params: CdnDownloadMomentsVideoParam): {url: string; key: string} {
        return {url: params.url, key: params.key};
    }

    /** 发送 GET 请求并返回非 ApiResponse 包装的 JSON。 */
    private async getJson<T>(path: string, params?: QueryParams): Promise<T> {
        const res = await this.requestRaw('GET', path, {query: params});
        return this.parseJsonResponse<T>(path, res);
    }

    /** 发送 GET 请求并返回纯文本。 */
    private async getText(path: string, params?: QueryParams): Promise<string> {
        const res = await this.requestRaw('GET', path, {query: params});
        return res.text();
    }

    /**
     * 网关偶发返回纯文本错误（例如：error code: 1003），这里统一做兼容解析。
     */
    private async parseApiResponse<T>(path: string, res: Response): Promise<ApiResponse<T>> {
        return this.parseJsonResponse<ApiResponse<T>>(path, res);
    }

    // -----------------------------------------------------------------------
    // 消息接口
    // -----------------------------------------------------------------------

    /** 发送文本消息。POST /api/message/text */
    async sendText(params: SendTextParam): Promise<ApiResponse<SendMessageResponse>> {
        return this.post<SendMessageResponse>('/api/message/text', params);
    }

    /** 发送图片消息。POST /api/message/image */
    async sendImage(params: SendImageParam): Promise<ApiResponse<UploadImageResponse>> {
        const formData = this.buildMultipartFormData([
            ['receiver', params.receiver],
            ['image_url', params.image_url],
        ], (data) => {
            this.appendBinaryInput(data, 'image', params.image, 'image.jpg', 'image/jpeg');
        });
        return this.postForm<UploadImageResponse>('/api/message/image', formData);
    }

    /** 发送视频消息。POST /api/message/video */
    async sendVideo(params: SendVideoParam): Promise<ApiResponse<UploadVideoResponse>> {
        const formData = this.buildMultipartFormData([
            ['receiver', params.receiver],
            ['video_url', params.video_url],
            ['thumb_url', params.thumb_url],
            ['duration', params.duration],
        ], (data) => {
            this.appendBinaryInput(data, 'video', params.video, 'video.mp4', 'video/mp4');
            this.appendBinaryInput(data, 'thumb', params.thumb, 'thumb.jpg', 'image/jpeg');
        });
        return this.postForm<UploadVideoResponse>('/api/message/video', formData);
    }

    /** 发送语音消息。POST /api/message/voice */
    async sendVoice(params: SendVoiceParam): Promise<ApiResponse<UploadVoiceResponse>> {
        const formData = this.buildMultipartFormData([
            ['receiver', params.receiver],
            ['voice_url', params.voice_url],
            ['duration', params.duration],
            ['format', params.format],
        ], (data) => {
            this.appendBinaryInput(data, 'voice', params.voice, 'voice.dat', 'application/octet-stream');
        });
        return this.postForm<UploadVoiceResponse>('/api/message/voice', formData);
    }

    /** 发送表情消息。POST /api/message/emoji */
    async sendEmoji(params: SendEmojiParam): Promise<ApiResponse<UploadEmojiResponse>> {
        const formData = this.buildMultipartFormData([
            ['receiver', params.receiver],
            ['md5', params.md5],
            ['emoji_url', params.emoji_url],
        ], (data) => {
            this.appendBinaryInput(data, 'file', params.file, 'emoji.gif', 'image/gif');
        });
        return this.postForm<UploadEmojiResponse>('/api/message/emoji', formData);
    }

    /** 发送名片消息。POST /api/message/card */
    async sendCard(params: SendCardParam): Promise<ApiResponse<SendMessageResponse>> {
        return this.post<SendMessageResponse>('/api/message/card', params);
    }

    /** 发送链接消息。POST /api/message/link */
    async sendLink(params: SendLinkParam): Promise<ApiResponse<SendAppMessageResponse>> {
        return this.post<SendAppMessageResponse>('/api/message/link', params);
    }

    /** 发送位置消息。POST /api/message/position */
    async sendPosition(params: SendPositionParam): Promise<ApiResponse<SendMessageResponse>> {
        return this.post<SendMessageResponse>('/api/message/position', params);
    }

    /** 发送应用/卡片消息（富 XML）。POST /api/message/app */
    async sendApp(params: SendAppParam): Promise<ApiResponse<SendAppMessageResponse>> {
        return this.post<SendAppMessageResponse>('/api/message/app', params);
    }

    /** 转发消息。POST /api/message/forward */
    async forwardMessage(params: ForwardParam): Promise<ApiResponse<SendAppMessageResponse>> {
        return this.post<SendAppMessageResponse>('/api/message/forward', params);
    }

    /** 转发文件消息。POST /api/message/forward/file */
    async forwardFileMessage(params: ForwardParam): Promise<ApiResponse<SendAppMessageResponse>> {
        return this.post<SendAppMessageResponse>('/api/message/forward/file', params);
    }

    /** 撤回已发送的消息。POST /api/message/revoke */
    async revokeMessage(params: RevokeParam): Promise<ApiResponse<RevokeMessageResponse>> {
        return this.post<RevokeMessageResponse>('/api/message/revoke', params);
    }

    /** 创建微信红包。POST /api/payment/hongbao/create */
    async createHongBao(params: CreateHongBaoParam): Promise<ApiResponse<HongBaoResponse>> {
        return this.post<HongBaoResponse>('/api/payment/hongbao/create', params);
    }

    /** 查询红包领取详情。POST /api/payment/hongbao/detail */
    async queryHongBaoDetail(params: QueryHongBaoDetailParam): Promise<ApiResponse<HongBaoResponse>> {
        return this.post<HongBaoResponse>('/api/payment/hongbao/detail', params);
    }

    /** 抢红包（接收+打开一步完成）。POST /api/payment/hongbao/grab */
    async grabHongBao(params: GrabHongBaoParam): Promise<ApiResponse<HongBaoResponse>> {
        return this.post<HongBaoResponse>('/api/payment/hongbao/grab', params);
    }

    /** 查询红包领取列表。POST /api/payment/hongbao/list */
    async queryHongBaoList(params: QueryHongBaoListParam): Promise<ApiResponse<HongBaoResponse>> {
        return this.post<HongBaoResponse>('/api/payment/hongbao/list', params);
    }

    /** 打开红包（第二步）。POST /api/payment/hongbao/open */
    async openHongBao(params: OpenHongBaoParam): Promise<ApiResponse<HongBaoResponse>> {
        return this.post<HongBaoResponse>('/api/payment/hongbao/open', params);
    }

    /** 接收红包（第一步）。POST /api/payment/hongbao/receive */
    async receiveHongBao(params: ReceiveHongBaoParam): Promise<ApiResponse<HongBaoResponse>> {
        return this.post<HongBaoResponse>('/api/payment/hongbao/receive', params);
    }

    /** 确认微信转账。POST /api/payment/transfer/confirm */
    async confirmTransfer(params: ConfirmPreTransferParam): Promise<ApiResponse<TenPayResponse>> {
        return this.post<TenPayResponse>('/api/payment/transfer/confirm', params);
    }

    /** 创建微信转账。POST /api/payment/transfer/create */
    async createTransfer(params: CreatePreTransferParam): Promise<ApiResponse<TenPayResponse>> {
        return this.post<TenPayResponse>('/api/payment/transfer/create', params);
    }

    /** 确认收款。POST /api/payment/collect */
    async collectMoney(params: CollectMoneyParam): Promise<ApiResponse<TenPayResponse>> {
        return this.post<TenPayResponse>('/api/payment/collect', params);
    }

    /** 开始输入中状态指示。POST /api/message/start?receiver=... */
    async startTyping(receiver: string): Promise<ApiResponse> {
        return this.postQuery('/api/message/start', {receiver});
    }

    /** 停止输入中状态指示。POST /api/message/stop?receiver=... */
    async stopTyping(receiver: string): Promise<ApiResponse> {
        return this.postQuery('/api/message/stop', {receiver});
    }

    /** 同步新消息。GET /api/message/sync */
    async syncMessages(): Promise<ApiResponse<SyncResult>> {
        return this.get<SyncResult>('/api/message/sync');
    }

    /** CDN 上传聊天图片。POST /api/cdn/upload/image */
    async cdnUploadImage(params: CdnUploadImageParam): Promise<ApiResponse> {
        const formData = this.buildMultipartFormData([
            ['receiver', params.receiver],
            ['image_url', params.image_url],
        ], (data) => {
            this.appendBinaryInput(data, 'image', params.image, 'image.jpg', 'image/jpeg');
        });
        return this.postForm('/api/cdn/upload/image', formData);
    }

    /** CDN 上传聊天视频。POST /api/cdn/upload/video */
    async cdnUploadVideo(params: CdnUploadVideoParam): Promise<ApiResponse> {
        const formData = this.buildMultipartFormData([
            ['receiver', params.receiver],
            ['video_url', params.video_url],
            ['thumb_url', params.thumb_url],
            ['duration', params.duration],
        ], (data) => {
            this.appendBinaryInput(data, 'video', params.video, 'video.mp4', 'video/mp4');
            this.appendBinaryInput(data, 'thumb', params.thumb, 'thumb.jpg', 'image/jpeg');
        });
        return this.postForm('/api/cdn/upload/video', formData);
    }

    /** CDN 上传朋友圈图片。POST /api/cdn/upload/moments/image */
    async cdnUploadMomentsImage(params: CdnUploadMomentsImageParam): Promise<ApiResponse> {
        const formData = this.buildMultipartFormData([
            ['image_url', params.image_url],
        ], (data) => {
            this.appendBinaryInput(data, 'image', params.image, 'moments-image.jpg', 'image/jpeg');
        });
        return this.postForm('/api/cdn/upload/moments/image', formData);
    }

    /** CDN 上传朋友圈视频。POST /api/cdn/upload/moments/video */
    async cdnUploadMomentsVideo(params: CdnUploadMomentsVideoParam): Promise<ApiResponse> {
        const formData = this.buildMultipartFormData([
            ['video_url', params.video_url],
            ['thumb_url', params.thumb_url],
        ], (data) => {
            this.appendBinaryInput(data, 'video', params.video, 'moments-video.mp4', 'video/mp4');
            this.appendBinaryInput(data, 'thumb', params.thumb, 'moments-thumb.jpg', 'image/jpeg');
        });
        return this.postForm('/api/cdn/upload/moments/video', formData);
    }

    /** CDN 下载高清图片原始数据。GET /api/cdn/download/image */
    async cdnDownloadImageRaw(params: CdnDownloadImageParam): Promise<ArrayBuffer> {
        const query = this.resolveImageDownloadQuery(params);
        return this.getBinary('/api/cdn/download/image', query);
    }

    /** CDN 下载高清图片并返回 base64 包装结果。GET /api/cdn/download/image */
    async cdnDownloadImage(params: CdnDownloadImageParam): Promise<ApiResponse<string>> {
        const raw = await this.cdnDownloadImageRaw(params);
        return {code: 0, message: 'OK', data: this.encodeBase64(raw)};
    }

    /** CDN 下载视频封面原始数据。GET /api/cdn/download/video/cover */
    async cdnDownloadVideoCoverRaw(params: CdnDownloadVideoParam): Promise<ArrayBuffer> {
        const query = this.resolveVideoDownloadQuery(params);
        return this.getBinary('/api/cdn/download/video/cover', query);
    }

    /** CDN 下载视频封面并返回 base64 包装结果。GET /api/cdn/download/video/cover */
    async cdnDownloadVideoCover(params: CdnDownloadVideoParam): Promise<ApiResponse<string>> {
        const raw = await this.cdnDownloadVideoCoverRaw(params);
        return {code: 0, message: 'OK', data: this.encodeBase64(raw)};
    }

    /** CDN 下载聊天视频原始数据。GET /api/cdn/download/video */
    async cdnDownloadChatVideoRaw(params: CdnDownloadVideoParam): Promise<ArrayBuffer> {
        const query = this.resolveVideoDownloadQuery(params);
        return this.getBinary('/api/cdn/download/video', query);
    }

    /** CDN 下载聊天视频并返回 base64 包装结果。GET /api/cdn/download/video */
    async cdnDownloadChatVideo(params: CdnDownloadVideoParam): Promise<ApiResponse<string>> {
        const raw = await this.cdnDownloadChatVideoRaw(params);
        return {code: 0, message: 'OK', data: this.encodeBase64(raw)};
    }

    /** CDN 下载朋友圈视频原始数据。GET /api/cdn/download/moments/video */
    async cdnDownloadMomentsVideoRaw(params: CdnDownloadMomentsVideoParam): Promise<ArrayBuffer> {
        const query = this.resolveMomentsVideoDownloadQuery(params);
        return this.getBinary('/api/cdn/download/moments/video', query);
    }

    /** CDN 下载朋友圈视频并返回 base64 包装结果。GET /api/cdn/download/moments/video */
    async cdnDownloadMomentsVideo(params: CdnDownloadMomentsVideoParam): Promise<ApiResponse<string>> {
        const raw = await this.cdnDownloadMomentsVideoRaw(params);
        return {code: 0, message: 'OK', data: this.encodeBase64(raw)};
    }


    /** 下载文件附件。POST /api/message/download/file */
    async downloadFile(params: DownloadFileParam): Promise<ApiResponse<DownloadAppAttachResponse>> {
        return this.post<DownloadAppAttachResponse>('/api/message/download/file', params);
    }

    /** 下载图片。POST /api/message/download/image */
    async downloadImage(params: DownloadImgParam): Promise<ApiResponse<DownloadImageResponse>> {
        return this.post<DownloadImageResponse>('/api/message/download/image', params);
    }

    /** 下载视频。POST /api/message/download/video */
    async downloadVideo(params: DownloadVideoParam): Promise<ApiResponse<DownloadVideoResponse>> {
        return this.post<DownloadVideoResponse>('/api/message/download/video', params);
    }

    /** 下载语音。POST /api/message/download/voice */
    async downloadVoice(params: DownloadVoiceParam): Promise<ApiResponse<DownloadVoiceResponse>> {
        return this.post<DownloadVoiceResponse>('/api/message/download/voice', params);
    }

    // -----------------------------------------------------------------------
    // 文档 / 系统接口
    // -----------------------------------------------------------------------

    /** 访问文档首页（302 跳转）。GET / */
    async getDocsRedirect(): Promise<Response> {
        return this.requestRaw('GET', '/');
    }

    /** 获取 Swagger JSON 文档。GET /doc/json */
    async getSwaggerJson(): Promise<JsonObject> {
        return this.getJson<JsonObject>('/doc/json');
    }

    /** 获取 Swagger YAML 文档。GET /doc/yaml */
    async getSwaggerYaml(): Promise<string> {
        return this.getText('/doc/yaml');
    }

    /** 获取服务健康状态。GET /health */
    async getHealth(): Promise<string> {
        return this.getText('/health');
    }

    // -----------------------------------------------------------------------
    // 登录接口
    // -----------------------------------------------------------------------

    /** 开始登录并获取二维码。GET /api/login/login */
    async startLogin(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/login/login');
    }

    /** 账号密码登录。POST /api/login/password */
    async loginWithPassword(params: PasswordLoginRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/login/password', params);
    }

    /** 首次登录初始化。GET /api/login/init */
    async initLogin(): Promise<ApiResponse<SyncResult>> {
        return this.get<SyncResult>('/api/login/init');
    }

    /** 唤醒登录。GET /api/login/awaken */
    async awakenLogin(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/login/awaken');
    }

    /** 退出登录。GET /api/login/logout */
    async logout(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/login/logout');
    }

    /** 获取登录状态。GET /api/login/status */
    async getLoginStatus(): Promise<ApiResponse<string>> {
        return this.get<string>('/api/login/status');
    }

    // -----------------------------------------------------------------------
    // 联系人接口
    // -----------------------------------------------------------------------

    /** 获取联系人增量列表。GET /api/contacts */
    async getContacts(params?: ContactsSyncQuery): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/contacts', params);
    }

    /** 删除联系人。DELETE /api/contacts/{username} */
    async deleteContact(username: string): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/contacts/{username}', {username}));
    }

    /** 获取全部联系人（分页）。GET /api/contacts/all */
    async getAllContacts(params?: ContactsPageQuery): Promise<ApiResponse<unknown[]>> {
        return this.get<unknown[]>('/api/contacts/all', params);
    }

    /** 加入黑名单。POST /api/contacts/blacklist/{username} */
    async addContactToBlacklist(username: string): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>(this.buildPath('/api/contacts/blacklist/{username}', {username}));
    }

    /** 移出黑名单。DELETE /api/contacts/blacklist/{username} */
    async removeContactFromBlacklist(username: string): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/contacts/blacklist/{username}', {username}));
    }

    /** 获取联系人详情。POST /api/contacts/detail */
    async getContactDetail(params: ContactDetailRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/contacts/detail', params);
    }

    /** 发送好友申请。POST /api/contacts/friend-requests */
    async sendFriendRequest(params: SendFriendRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/contacts/friend-requests', params);
    }

    /** 通过好友验证。POST /api/contacts/friend-requests/verify */
    async verifyFriendRequest(params: VerifyFriendRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/contacts/friend-requests/verify', params);
    }

    /** 搜索附近的人。POST /api/contacts/lbs */
    async findNearbyContacts(params: LbsFindRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/contacts/lbs', params);
    }

    /** 设置联系人备注。PUT /api/contacts/remark/{username} */
    async setContactRemark(username: string, params: SetRemarkRequest): Promise<ApiResponse<unknown>> {
        return this.put<unknown>(this.buildPath('/api/contacts/remark/{username}', {username}), params);
    }

    /** 搜索联系人。POST /api/contacts/search */
    async searchContacts(params: SearchContactRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/contacts/search', params);
    }

    /** 上传手机联系人。POST /api/contacts/upload */
    async uploadContacts(params: UploadContactRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/contacts/upload', params);
    }

    /** 修改联系人标签。PUT /api/contacts/{username}/labels */
    async updateContactLabels(username: string, params: ModifyContactLabelsRequest): Promise<ApiResponse<unknown>> {
        return this.put<unknown>(this.buildPath('/api/contacts/{username}/labels', {username}), params);
    }

    // -----------------------------------------------------------------------
    // 群聊接口
    // -----------------------------------------------------------------------

    /** 创建群聊。POST /api/groups */
    async createGroup(params: CreateGroupRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/groups', params);
    }

    /** 添加群管理员。POST /api/groups/admins/{group} */
    async addGroupAdmins(group: string, params: GroupMembersRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>(this.buildPath('/api/groups/admins/{group}', {group}), params);
    }

    /** 移除群管理员。DELETE /api/groups/admins/{group} */
    async removeGroupAdmins(group: string, params: GroupMembersRequest): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/groups/admins/{group}', {group}), params);
    }

    /** 设置群公告。PUT /api/groups/announcement/{group} */
    async setGroupAnnouncement(group: string, params: SetAnnouncementRequest): Promise<ApiResponse<unknown>> {
        return this.put<unknown>(this.buildPath('/api/groups/announcement/{group}', {group}), params);
    }

    /** 设置群保存到通讯录。PUT /api/groups/contact-list/{group} */
    async setGroupContactList(group: string, save: boolean): Promise<ApiResponse<unknown>> {
        return this.put<unknown>(this.buildPath('/api/groups/contact-list/{group}', {group}), undefined, {save});
    }

    /** 面对面建群。POST /api/groups/facing */
    async createFacingGroup(params: FacingCreateRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/groups/facing', params);
    }

    /** 获取群信息。GET /api/groups/info/{group} */
    async getGroupInfo(group: string): Promise<ApiResponse<unknown>> {
        return this.get<unknown>(this.buildPath('/api/groups/info/{group}', {group}));
    }

    /** 邀请成员进群。POST /api/groups/invite/{group} */
    async inviteGroupMembers(group: string, params: GroupMembersRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>(this.buildPath('/api/groups/invite/{group}', {group}), params);
    }

    /** 同意入群。POST /api/groups/join/consent */
    async consentJoinGroup(params: ConsentJoinRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/groups/join/consent', params);
    }

    /** 扫码入群。POST /api/groups/join/scan */
    async scanJoinGroup(params: ScanJoinRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/groups/join/scan', params);
    }

    /** 获取群成员列表。GET /api/groups/members/{group} */
    async getGroupMembers(group: string): Promise<ApiResponse<unknown>> {
        return this.get<unknown>(this.buildPath('/api/groups/members/{group}', {group}));
    }

    /** 添加群成员。POST /api/groups/members/{group} */
    async addGroupMembers(group: string, params: GroupMembersRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>(this.buildPath('/api/groups/members/{group}', {group}), params);
    }

    /** 删除群成员。DELETE /api/groups/members/{group} */
    async removeGroupMembers(group: string, params: GroupMembersRequest): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/groups/members/{group}', {group}), params);
    }

    /** 修改群名称。PUT /api/groups/name/{group} */
    async renameGroup(group: string, name: string): Promise<ApiResponse<unknown>> {
        return this.put<unknown>(this.buildPath('/api/groups/name/{group}', {group}), undefined, {name});
    }

    /** 获取群二维码。GET /api/groups/qrcode/{group} */
    async getGroupQrcode(group: string): Promise<ApiResponse<unknown>> {
        return this.get<unknown>(this.buildPath('/api/groups/qrcode/{group}', {group}));
    }

    /** 退出群聊。DELETE /api/groups/quit/{group} */
    async quitGroup(group: string): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/groups/quit/{group}', {group}));
    }

    /** 设置群备注。PUT /api/groups/remark/{group} */
    async setGroupRemark(group: string, remark: string): Promise<ApiResponse<unknown>> {
        return this.put<unknown>(this.buildPath('/api/groups/remark/{group}', {group}), undefined, {remark});
    }

    /** 转让群主。POST /api/groups/transfer/{group} */
    async transferGroup(group: string, newOwner: string): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>(this.buildPath('/api/groups/transfer/{group}', {group}), {new_owner: newOwner});
    }

    // -----------------------------------------------------------------------
    // 标签 / 收藏接口
    // -----------------------------------------------------------------------

    /** 获取标签列表。GET /api/labels */
    async getLabels(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/labels');
    }

    /** 创建标签。POST /api/labels */
    async createLabel(params: AddLabelRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/labels', params);
    }

    /** 删除标签。DELETE /api/labels/{id} */
    async deleteLabel(id: string | number): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/labels/{id}', {id}));
    }

    /** 更新标签。PUT /api/labels/{id} */
    async updateLabel(id: number, params: UpdateLabelRequest): Promise<ApiResponse<unknown>> {
        return this.put<unknown>(this.buildPath('/api/labels/{id}', {id}), params);
    }

    /** 获取收藏概览。GET /api/favor/info */
    async getFavorInfo(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/favor/info');
    }

    /** 删除收藏项。DELETE /api/favor/item/{id} */
    async deleteFavorItem(id: number): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/favor/item/{id}', {id}));
    }

    /** 获取收藏项详情。GET /api/favor/item/{id} */
    async getFavorItem(id: number): Promise<ApiResponse<unknown>> {
        return this.get<unknown>(this.buildPath('/api/favor/item/{id}', {id}));
    }

    /** 同步收藏。POST /api/favor/sync */
    async syncFavor(params?: FavorSyncQuery): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>('/api/favor/sync', params);
    }

    // -----------------------------------------------------------------------
    // 小程序接口
    // -----------------------------------------------------------------------

    /** 添加小程序头像记录。POST /api/miniapp/avatar */
    async addMiniappAvatar(params: MiniappAddAvatarRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/avatar', params);
    }

    /** 获取随机小程序头像。GET /api/miniapp/avatar/random */
    async getRandomMiniappAvatar(appId: string): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/miniapp/avatar/random', {app_id: appId});
    }

    /** 上传小程序头像图片。POST /api/miniapp/avatar/upload */
    async uploadMiniappAvatar(params: MiniappUploadAvatarImgRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/avatar/upload', params);
    }

    /** 调用小程序云函数。POST /api/miniapp/cloud/function */
    async callMiniappCloudFunction(params: MiniappCloudCallFunctionRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/cloud/function', params);
    }

    /** 小程序 JS 登录。POST /api/miniapp/login/js */
    async miniappJsLogin(params: MiniappJSLoginRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/login/js', params);
    }

    /** 小程序二维码授权登录。POST /api/miniapp/login/qrcode */
    async miniappQrcodeLogin(params: MiniappQrcodeAuthRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/login/qrcode', params);
    }

    /** 删除小程序绑定手机号。DELETE /api/miniapp/mobile */
    async deleteMiniappMobile(params: MiniappDelMobileRequest): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>('/api/miniapp/mobile', params);
    }

    /** 获取小程序绑定手机号。GET /api/miniapp/mobile */
    async getMiniappMobile(appId: string): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/miniapp/mobile', {app_id: appId});
    }

    /** 添加小程序绑定手机号。POST /api/miniapp/mobile */
    async addMiniappMobile(params: MiniappAddMobileRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/mobile', params);
    }

    /** 校验小程序短信验证码。POST /api/miniapp/mobile/check-code */
    async checkMiniappMobileCode(params: MiniappCheckVerifyCodeRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/mobile/check-code', params);
    }

    /** 发送小程序短信验证码。POST /api/miniapp/mobile/send-code */
    async sendMiniappMobileCode(params: MiniappSendVerifyCodeRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/mobile/send-code', params);
    }

    /** 小程序 OAuth SDK 授权。POST /api/miniapp/oauth/sdk */
    async miniappOauthSdk(params: OauthSdkAppParam): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/oauth/sdk', params);
    }

    /** 小程序第三方授权。POST /api/miniapp/oauth/third */
    async miniappOauthThird(params: ThirdAppGrantParam): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/oauth/third', params);
    }

    /** 获取小程序 OpenID。POST /api/miniapp/openid */
    async getMiniappOpenId(params: MiniappGetUserOpenIDRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/openid', params);
    }

    /** 操作小程序 wxData。POST /api/miniapp/operate */
    async operateMiniappWxData(params: MiniappOperateWxDataRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/operate', params);
    }

    /** 获取小程序记录。GET /api/miniapp/record */
    async getMiniappRecord(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/miniapp/record');
    }

    /** 添加小程序记录。POST /api/miniapp/record */
    async addMiniappRecord(params: MiniappAddRecordRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/record', params);
    }

    /** 获取小程序会话二维码。POST /api/miniapp/session/qrcode */
    async getMiniappSessionQrcode(params: MiniappGetSessionQRCodeRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/session/qrcode', params);
    }

    /** 获取小程序运行时会话。POST /api/miniapp/session/runtime */
    async getMiniappRuntimeSession(params: MiniappGetRuntimeSessionRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/miniapp/session/runtime', params);
    }

    // -----------------------------------------------------------------------
    // 朋友圈接口
    // -----------------------------------------------------------------------

    /** 发表朋友圈。POST /api/moments */
    async createMoment(params: PostParam): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/moments', params);
    }

    /** 删除朋友圈。DELETE /api/moments/{id} */
    async deleteMoment(id: number): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/moments/{id}', {id}));
    }

    /** 获取朋友圈详情。GET /api/moments/{id} */
    async getMoment(id: number): Promise<ApiResponse<unknown>> {
        return this.get<unknown>(this.buildPath('/api/moments/{id}', {id}));
    }

    /** 删除朋友圈评论。DELETE /api/moments/comment/{id} */
    async deleteMomentComment(id: number, commentId: number): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/moments/comment/{id}', {id}), undefined, {comment_id: commentId});
    }

    /** 朋友圈评论。POST /api/moments/comment/{id} */
    async commentMoment(id: number, params: CommentParam): Promise<ApiResponse<unknown>> {
        return this.post<unknown>(this.buildPath('/api/moments/comment/{id}', {id}), params);
    }

    /** 取消朋友圈点赞。DELETE /api/moments/like/{id} */
    async unlikeMoment(id: number): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/moments/like/{id}', {id}));
    }

    /** 点赞朋友圈。POST /api/moments/like/{id} */
    async likeMoment(id: number): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>(this.buildPath('/api/moments/like/{id}', {id}));
    }

    /** 设置朋友圈隐私。PUT /api/moments/privacy */
    async setMomentsPrivacy(params: SetMomentsPrivacyParam): Promise<ApiResponse<unknown>> {
        return this.put<unknown>('/api/moments/privacy', params);
    }

    /** 同步朋友圈。POST /api/moments/sync */
    async syncMoments(key: string): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>('/api/moments/sync', {key});
    }

    /** 获取朋友圈时间线。GET /api/moments/timeline */
    async getMomentsTimeline(params?: MomentsTimelineQuery): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/moments/timeline', params);
    }

    /** 上传朋友圈媒体文件。POST /api/moments/upload */
    async uploadMomentMedia(params: MomentMediaUploadParam | Blob): Promise<ApiResponse<unknown>> {
        let input: MomentMediaUploadParam;
        if (typeof Blob !== 'undefined' && params instanceof Blob) {
            input = {media: params};
        } else {
            input = params as MomentMediaUploadParam;
        }
        const formData = this.buildMultipartFormData([
            ['media_url', input.media_url],
        ], (data) => {
            this.appendBinaryInput(data, 'media', input.media, 'moment-media.bin', 'application/octet-stream');
        });
        return this.postForm<unknown>('/api/moments/upload', formData);
    }

    /** 获取指定用户朋友圈。GET /api/moments/user/{username} */
    async getUserMoments(username: string, params?: MomentsTimelineQuery): Promise<ApiResponse<unknown>> {
        return this.get<unknown>(this.buildPath('/api/moments/user/{username}', {username}), params);
    }

    // -----------------------------------------------------------------------
    // 公众号 / 支付接口
    // -----------------------------------------------------------------------

    /** 删除公众号。DELETE /api/official/{appid} */
    async deleteOfficial(appid: string): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>(this.buildPath('/api/official/{appid}', {appid}));
    }

    /** 关注公众号。POST /api/official/{appid}/follow */
    async followOfficial(appid: string): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>(this.buildPath('/api/official/{appid}/follow', {appid}));
    }

    /** 获取公众号 A8Key。POST /api/official/a8key */
    async getOfficialA8Key(url: string): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>('/api/official/a8key', {url});
    }

    /** 公众号文章点赞。POST /api/official/article/like */
    async likeOfficialArticle(url: string): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>('/api/official/article/like', {url});
    }

    /** 公众号文章阅读上报。POST /api/official/article/read */
    async readOfficialArticle(url: string): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>('/api/official/article/read', {url});
    }

    /** 获取公众号 JSAPI 信息。POST /api/official/jsapi */
    async getOfficialJsapi(url: string, appid: string): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>('/api/official/jsapi', {url, appid});
    }

    /** 获取公众号 OAuth 信息。POST /api/official/oauth */
    async getOfficialOauth(url: string, appid: string): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>('/api/official/oauth', {url, appid});
    }

    /** 获取支付银行卡列表。GET /api/payment/cards */
    async getPaymentCards(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/payment/cards');
    }

    /** 获取支付收款码。GET /api/payment/qrcode */
    async getPaymentQrcode(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/payment/qrcode');
    }

    // -----------------------------------------------------------------------
    // 用户接口
    // -----------------------------------------------------------------------

    /** 设置微信号。PUT /api/user/alias */
    async setUserAlias(params: SetAliasRequest): Promise<ApiResponse<unknown>> {
        return this.put<unknown>('/api/user/alias', params);
    }

    /** 上传用户头像。POST /api/user/avatar */
    async uploadUserAvatar(file: Blob): Promise<ApiResponse<unknown>> {
        const formData = new FormData();
        formData.set('file', file);
        const res = await this.requestRaw('POST', '/api/user/avatar', {body: formData});
        return this.parseApiResponse<unknown>('/api/user/avatar', res);
    }

    /** 获取用户证书。GET /api/user/cert */
    async getUserCert(params?: UserCertQuery): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/user/cert', params);
    }

    /** 获取登录设备列表。GET /api/user/devices */
    async getUserDevices(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/user/devices');
    }

    /** 绑定邮箱。POST /api/user/email */
    async bindUserEmail(params: BindEmailRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/user/email', params);
    }

    /** 触发邮箱验证。POST /api/user/email/verify */
    async verifyUserEmail(): Promise<ApiResponse<unknown>> {
        return this.postQuery<unknown>('/api/user/email/verify');
    }

    /** 绑定手机号。POST /api/user/mobile */
    async bindUserMobile(params: BindMobileRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/user/mobile', params);
    }

    /** 发送手机验证码。POST /api/user/mobile/verify-code */
    async sendUserMobileVerifyCode(params: SendVerifyMobileRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/user/mobile/verify-code', params);
    }

    /** 上报运动数据。POST /api/user/motion */
    async reportUserMotion(params: ReportMotionRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/user/motion', params);
    }

    /** 设置密码。PUT /api/user/password */
    async setUserPassword(params: SetPasswordRequest): Promise<ApiResponse<unknown>> {
        return this.put<unknown>('/api/user/password', params);
    }

    /** 验证密码。POST /api/user/password/verify */
    async verifyUserPassword(params: VerifyPasswordRequest): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/user/password/verify', params);
    }

    /** 设置用户隐私。PUT /api/user/privacy */
    async setUserPrivacy(params: SetPrivacyRequest): Promise<ApiResponse<unknown>> {
        return this.put<unknown>('/api/user/privacy', params);
    }

    /** 获取用户资料。GET /api/user/profile */
    async getUserProfile(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/user/profile');
    }

    /** 更新用户资料。PUT /api/user/profile */
    async updateUserProfile(params: UpdateProfileRequest): Promise<ApiResponse<unknown>> {
        return this.put<unknown>('/api/user/profile', params);
    }

    /** 获取用户二维码。GET /api/user/qrcode */
    async getUserQrcode(params?: UserQrcodeQuery): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/user/qrcode', params);
    }

    /** 删除安全设备。DELETE /api/user/safety/devices */
    async deleteSafeDevice(params: DelSafeDeviceRequest): Promise<ApiResponse<unknown>> {
        return this.delete<unknown>('/api/user/safety/devices', params);
    }

    /** 获取安全设备列表。GET /api/user/safety/devices */
    async getSafeDevices(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/user/safety/devices');
    }

    // -----------------------------------------------------------------------
    // 管理接口
    // -----------------------------------------------------------------------

    /** 获取推送地址配置。GET /api/manager/push_url */
    async getPushUrlConfig(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/manager/push_url');
    }

    /** 设置推送地址配置。POST /api/manager/push_url */
    async setPushUrlConfig(params: PushConfig): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/manager/push_url', params);
    }

    /** 获取存储状态。GET /api/manager/storage/status */
    async getStorageStatus(): Promise<ApiResponse<unknown>> {
        return this.get<unknown>('/api/manager/storage/status');
    }

    /** 设置存储状态。POST /api/manager/storage/status */
    async setStorageStatus(params: StorageConfig): Promise<ApiResponse<unknown>> {
        return this.post<unknown>('/api/manager/storage/status', params);
    }
}
