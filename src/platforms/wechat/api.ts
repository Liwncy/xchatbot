/**
 * 微信 API 客户端。
 *
 * 封装微信网关服务暴露的 HTTP 接口（详见 _docs/wechat/apidoc.json），
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
  SendMessageResponse,
  SendAppMessageResponse,
  UploadImageResponse,
  UploadVideoResponse,
  UploadVoiceResponse,
  UploadEmojiResponse,
  RevokeMessageResponse,
  SyncResult,
} from './api-types.js';

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as ApiResponse<T>;
  }

  /** 发送 GET 请求（可附带查询参数）并返回解析后的 JSON。 */
  private async get<T>(path: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }
    const res = await fetch(url.toString());
    return (await res.json()) as ApiResponse<T>;
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

  /** 开始输入中状态指示。POST /api/message/start */
  async startTyping(receiver: string): Promise<ApiResponse> {
    return this.post('/api/message/start', { receiver });
  }

  /** 停止输入中状态指示。POST /api/message/stop */
  async stopTyping(receiver: string): Promise<ApiResponse> {
    return this.post('/api/message/stop', { receiver });
  }

  /** 同步新消息。GET /api/message/sync */
  async syncMessages(): Promise<ApiResponse<SyncResult>> {
    return this.get<SyncResult>('/api/message/sync');
  }
}
