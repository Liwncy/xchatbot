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
    CdnDownloadImageParam,
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
    GetCdnDnsResponse,
    DownloadAppAttachResponse,
    GetMsgImgResponse,
    DownloadVideoResponse,
    DownloadVoiceResponse,
    SyncResult,
} from './api-types.js';

const BROWSER_LIKE_HEADERS: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Referer: 'https://liwncy.us.ci/',
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
};

export class WechatApi {
    private readonly baseUrl: string;

    constructor(baseUrl: string) {
        // 移除尾部斜杠，避免调用方重复处理
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }

    // -----------------------------------------------------------------------
    // 内部辅助方法
    // -----------------------------------------------------------------------

    /** 发送 JSON POST 请求并返回解析后的响应体。 */
    private async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: {
                ...BROWSER_LIKE_HEADERS,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        return this.parseApiResponse<T>(path, res);
    }

    /** 发送 GET 请求（可附带查询参数）并返回解析后的 JSON。 */
    private async get<T>(path: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
        const url = new URL(`${this.baseUrl}${path}`);
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                url.searchParams.set(k, v);
            }
        }
        const res = await fetch(url.toString(), {
            method: 'GET',
            headers: BROWSER_LIKE_HEADERS,
        });
        return this.parseApiResponse<T>(path, res);
    }

    /** 发送不带 body 的 POST 请求（可附带查询参数）并返回解析后的 JSON。 */
    private async postQuery<T>(path: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
        const url = new URL(`${this.baseUrl}${path}`);
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                url.searchParams.set(k, v);
            }
        }
        const res = await fetch(url.toString(), {
            method: 'POST',
            headers: BROWSER_LIKE_HEADERS,
        });
        return this.parseApiResponse<T>(path, res);
    }

    /**
     * 网关偶发返回纯文本错误（例如：error code: 1003），这里统一做兼容解析。
     */
    private async parseApiResponse<T>(path: string, res: Response): Promise<ApiResponse<T>> {
        const raw = await res.text();

        try {
            return JSON.parse(raw) as ApiResponse<T>;
        } catch {
            const compact = raw.replace(/\s+/g, ' ').trim();
            throw new Error(`WechatApi ${path} returned non-JSON response (status ${res.status}): ${compact}`);
        }
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
        return this.post<UploadImageResponse>('/api/message/image', params);
    }

    /** 发送视频消息。POST /api/message/video */
    async sendVideo(params: SendVideoParam): Promise<ApiResponse<UploadVideoResponse>> {
        return this.post<UploadVideoResponse>('/api/message/video', params);
    }

    /** 发送语音消息。POST /api/message/voice */
    async sendVoice(params: SendVoiceParam): Promise<ApiResponse<UploadVoiceResponse>> {
        return this.post<UploadVoiceResponse>('/api/message/voice', params);
    }

    /** 发送表情消息。POST /api/message/emoji */
    async sendEmoji(params: SendEmojiParam): Promise<ApiResponse<UploadEmojiResponse>> {
        return this.post<UploadEmojiResponse>('/api/message/emoji', params);
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

    /** 撤回已发送的消息。POST /api/message/revoke */
    async revokeMessage(params: RevokeParam): Promise<ApiResponse<RevokeMessageResponse>> {
        return this.post<RevokeMessageResponse>('/api/message/revoke', params);
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

    /** 获取 CDN DNS 信息。GET /api/message/cdn/dns */
    async getCdnDns(): Promise<ApiResponse<GetCdnDnsResponse>> {
        return this.get<GetCdnDnsResponse>('/api/message/cdn/dns');
    }

    /** CDN 下载高清图片（返回 base64 字符串）。POST /api/message/cdn/image */
    async cdnDownloadImage(params: CdnDownloadImageParam): Promise<ApiResponse<string>> {
        return this.post<string>('/api/message/cdn/image', params);
    }

    /** 下载文件附件。POST /api/message/download/file */
    async downloadFile(params: DownloadFileParam): Promise<ApiResponse<DownloadAppAttachResponse>> {
        return this.post<DownloadAppAttachResponse>('/api/message/download/file', params);
    }

    /** 下载图片。POST /api/message/download/image */
    async downloadImage(params: DownloadImgParam): Promise<ApiResponse<GetMsgImgResponse>> {
        return this.post<GetMsgImgResponse>('/api/message/download/image', params);
    }

    /** 下载视频。POST /api/message/download/video */
    async downloadVideo(params: DownloadVideoParam): Promise<ApiResponse<DownloadVideoResponse>> {
        return this.post<DownloadVideoResponse>('/api/message/download/video', params);
    }

    /** 下载语音。POST /api/message/download/voice */
    async downloadVoice(params: DownloadVoiceParam): Promise<ApiResponse<DownloadVoiceResponse>> {
        return this.post<DownloadVoiceResponse>('/api/message/download/voice', params);
    }
}
