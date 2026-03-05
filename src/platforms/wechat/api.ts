/**
 * WeChat API client.
 *
 * Wraps the HTTP endpoints exposed by the WeChat bridge/gateway service
 * (documented in _docs/wechat/apidoc.json) as typed async methods.
 *
 * Usage:
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
    // Strip trailing slash so callers don't need to worry about it
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /** Send a JSON POST request and return the parsed response body. */
  private async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as ApiResponse<T>;
  }

  /** Send a GET request (with optional query string) and return parsed JSON. */
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
  // Message endpoints
  // -----------------------------------------------------------------------

  /** Send a text message. POST /api/message/text */
  async sendText(params: SendTextParam): Promise<ApiResponse<SendMessageResponse>> {
    return this.post<SendMessageResponse>('/api/message/text', params);
  }

  /** Send an image message. POST /api/message/image */
  async sendImage(params: SendImageParam): Promise<ApiResponse<UploadImageResponse>> {
    return this.post<UploadImageResponse>('/api/message/image', params);
  }

  /** Send a video message. POST /api/message/video */
  async sendVideo(params: SendVideoParam): Promise<ApiResponse<UploadVideoResponse>> {
    return this.post<UploadVideoResponse>('/api/message/video', params);
  }

  /** Send a voice message. POST /api/message/voice */
  async sendVoice(params: SendVoiceParam): Promise<ApiResponse<UploadVoiceResponse>> {
    return this.post<UploadVoiceResponse>('/api/message/voice', params);
  }

  /** Send an emoji message. POST /api/message/emoji */
  async sendEmoji(params: SendEmojiParam): Promise<ApiResponse<UploadEmojiResponse>> {
    return this.post<UploadEmojiResponse>('/api/message/emoji', params);
  }

  /** Send a business card. POST /api/message/card */
  async sendCard(params: SendCardParam): Promise<ApiResponse<SendMessageResponse>> {
    return this.post<SendMessageResponse>('/api/message/card', params);
  }

  /** Send a link message. POST /api/message/link */
  async sendLink(params: SendLinkParam): Promise<ApiResponse<SendAppMessageResponse>> {
    return this.post<SendAppMessageResponse>('/api/message/link', params);
  }

  /** Send a location / position message. POST /api/message/position */
  async sendPosition(params: SendPositionParam): Promise<ApiResponse<SendMessageResponse>> {
    return this.post<SendMessageResponse>('/api/message/position', params);
  }

  /** Send an app / card message (rich XML). POST /api/message/app */
  async sendApp(params: SendAppParam): Promise<ApiResponse<SendAppMessageResponse>> {
    return this.post<SendAppMessageResponse>('/api/message/app', params);
  }

  /** Forward a message. POST /api/message/forward */
  async forwardMessage(params: ForwardParam): Promise<ApiResponse<SendAppMessageResponse>> {
    return this.post<SendAppMessageResponse>('/api/message/forward', params);
  }

  /** Revoke (recall) a sent message. POST /api/message/revoke */
  async revokeMessage(params: RevokeParam): Promise<ApiResponse<RevokeMessageResponse>> {
    return this.post<RevokeMessageResponse>('/api/message/revoke', params);
  }

  /** Start a typing indicator. POST /api/message/start */
  async startTyping(receiver: string): Promise<ApiResponse> {
    return this.post('/api/message/start', { receiver });
  }

  /** Stop a typing indicator. POST /api/message/stop */
  async stopTyping(receiver: string): Promise<ApiResponse> {
    return this.post('/api/message/stop', { receiver });
  }

  /** Sync new messages. GET /api/message/sync */
  async syncMessages(): Promise<ApiResponse<SyncResult>> {
    return this.get<SyncResult>('/api/message/sync');
  }
}
