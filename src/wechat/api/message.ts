import type {
    ApiResponse,
    CdnDownloadImageParam,
    CdnDownloadMomentsVideoParam,
    CdnDownloadVideoParam,
    CdnUploadImageParam,
    CdnUploadMomentsImageParam,
    CdnUploadMomentsVideoParam,
    CdnUploadVideoParam,
    CollectMoneyParam,
    ConfirmPreTransferParam,
    CreateHongBaoParam,
    CreatePreTransferParam,
    DownloadAppAttachResponse,
    DownloadFileParam,
    DownloadImageResponse,
    DownloadImgParam,
    DownloadVideoParam,
    DownloadVideoResponse,
    DownloadVoiceParam,
    DownloadVoiceResponse,
    ForwardParam,
    GrabHongBaoParam,
    HongBaoResponse,
    OpenHongBaoParam,
    QueryHongBaoDetailParam,
    QueryHongBaoListParam,
    ReceiveHongBaoParam,
    RevokeMessageResponse,
    RevokeParam,
    SendAppMessageResponse,
    SendAppParam,
    SendCardParam,
    SendEmojiParam,
    SendImageParam,
    SendLinkParam,
    SendMessageResponse,
    SendPositionParam,
    SendTextParam,
    SendVideoParam,
    SendVoiceParam,
    SyncResult,
    TenPayResponse,
    UploadEmojiResponse,
    UploadImageResponse,
    UploadVideoResponse,
    UploadVoiceResponse,
 } from './types.js';
import {logger} from '../../utils/logger.js';
import {WechatApiClient, resolveVoiceBinaryMeta} from './client.js';

function serializeJsonNumber(value: number | string): string {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new Error('invalid JSON number');
        }
        return String(Math.floor(value));
    }

    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
        throw new Error('invalid JSON number string');
    }
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

export class WechatMessageApi extends WechatApiClient {
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
        const voiceBinaryMeta = resolveVoiceBinaryMeta(params.format);
        const voiceUrl = params.voice_url?.trim() || '';
        logger.info('WechatApi.sendVoice request build', {
            receiver: params.receiver,
            format: params.format,
            duration: params.duration,
            hasInlineVoice: params.voice != null,
            inlineVoiceType: typeof params.voice,
            inlineVoiceBlobSize: typeof Blob !== 'undefined' && params.voice instanceof Blob ? params.voice.size : undefined,
            inlineVoiceLength: typeof params.voice === 'string' ? params.voice.length : undefined,
            hasVoiceUrl: Boolean(voiceUrl),
            hasVoiceUrlAlias: Boolean(voiceUrl),
            voiceUrl,
            fileName: voiceBinaryMeta.fileName,
            mimeType: voiceBinaryMeta.mimeType,
        });
        const multipart = await this.buildMultipartBody([
            ['receiver', params.receiver],
            ['voice_url', voiceUrl || undefined],
            ['voice_url_url', voiceUrl || undefined],
            ['duration', params.duration],
            ['format', params.format],
        ], {
            fieldName: 'voice',
            input: params.voice,
            fileName: voiceBinaryMeta.fileName,
            mimeType: voiceBinaryMeta.mimeType,
        });
        logger.info('WechatApi.sendVoice multipart body ready', {
            receiver: params.receiver,
            boundary: multipart.boundary,
            bodySize: multipart.body.size,
            hasBinaryVoice: params.voice != null,
            hasVoiceUrl: Boolean(voiceUrl),
        });
        return this.postMultipartBody<UploadVoiceResponse>('/api/message/voice', multipart.body, multipart.boundary);
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
        const body = serializeRevokeParam(params);
        const res = await this.requestRaw('POST', '/api/message/revoke', {
            body,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        return this.parseApiResponse<RevokeMessageResponse>('/api/message/revoke', res);
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

    /** CDN 下载高清图片原始数据。POST /api/cdn/download/image */
    async cdnDownloadImageRaw(params: CdnDownloadImageParam): Promise<ArrayBuffer> {
        const query = this.resolveImageDownloadQuery(params);
        return this.postBinary('/api/cdn/download/image', query);
    }

    /** CDN 下载高清图片并返回 base64 包装结果。POST /api/cdn/download/image */
    async cdnDownloadImage(params: CdnDownloadImageParam): Promise<ApiResponse<string>> {
        const raw = await this.cdnDownloadImageRaw(params);
        return {code: 0, message: 'OK', data: this.encodeBase64(raw)};
    }

    /** CDN 下载视频封面原始数据。POST /api/cdn/download/video/cover */
    async cdnDownloadVideoCoverRaw(params: CdnDownloadVideoParam): Promise<ArrayBuffer> {
        const query = this.resolveVideoDownloadQuery(params);
        return this.postBinary('/api/cdn/download/video/cover', query);
    }

    /** CDN 下载视频封面并返回 base64 包装结果。POST /api/cdn/download/video/cover */
    async cdnDownloadVideoCover(params: CdnDownloadVideoParam): Promise<ApiResponse<string>> {
        const raw = await this.cdnDownloadVideoCoverRaw(params);
        return {code: 0, message: 'OK', data: this.encodeBase64(raw)};
    }

    /** CDN 下载聊天视频原始数据。POST /api/cdn/download/video */
    async cdnDownloadChatVideoRaw(params: CdnDownloadVideoParam): Promise<ArrayBuffer> {
        const query = this.resolveVideoDownloadQuery(params);
        return this.postBinary('/api/cdn/download/video', query);
    }

    /** CDN 下载聊天视频并返回 base64 包装结果。POST /api/cdn/download/video */
    async cdnDownloadChatVideo(params: CdnDownloadVideoParam): Promise<ApiResponse<string>> {
        const raw = await this.cdnDownloadChatVideoRaw(params);
        return {code: 0, message: 'OK', data: this.encodeBase64(raw)};
    }

    /** CDN 下载朋友圈视频原始数据。POST /api/cdn/download/moments/video */
    async cdnDownloadMomentsVideoRaw(params: CdnDownloadMomentsVideoParam): Promise<ArrayBuffer> {
        const query = this.resolveMomentsVideoDownloadQuery(params);
        return this.postBinary('/api/cdn/download/moments/video', query);
    }

    /** CDN 下载朋友圈视频并返回 base64 包装结果。POST /api/cdn/download/moments/video */
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
}

