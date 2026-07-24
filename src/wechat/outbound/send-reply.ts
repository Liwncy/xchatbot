import type {ReplyMessage} from '../../types/reply.js';
import {logger} from '../../utils/logger.js';
import {normalizeVoiceForWechat} from '../../utils/silk-converter.js';
import {fetchImageAsBase64FromUrl} from '../../utils/fetch-image.js';
import {DEFAULT_VIDEO_DURATION, DEFAULT_VIDEO_THUMB_BASE64} from '../constants.js';
import {WechatApi} from '../api';
import type {ApiResponse, UploadImageResponse, UploadVideoResponse} from '../api/types.js';
import {
    extractRevokeFromSendAppMessageResponse,
    extractRevokeFromSendMessageResponse,
    extractRevokeFromUploadEmojiResponse,
    extractRevokeFromUploadImageResponse,
    extractRevokeFromUploadVideoResponse,
    extractRevokeFromUploadVoiceResponse,
    toSentMessageRecord,
    type SentMessageRecord,
} from './extract-revoke-param.js';

function isHttpUrl(value?: string): boolean {
    return /^https?:\/\//i.test(value?.trim() ?? '');
}

function normalizeBase64(value?: string): string {
    const trimmed = (value ?? '').trim();
    const match = trimmed.match(/^data:[^;]+;base64,(.+)$/i);
    return match?.[1] ?? trimmed;
}

function estimateBase64Bytes(value?: string): number {
    const normalized = normalizeBase64(value);
    if (!normalized) return 0;
    const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function ensureWechatApiSuccess(op: string, result: unknown): void {
    const code = (result as { code?: unknown })?.code;
    const message = (result as { message?: unknown })?.message;
    if (typeof code === 'number' && code !== 0) {
        const detail = JSON.stringify(result).slice(0, 500);
        throw new Error(`${op} failed: code=${code}, message=${String(message ?? '')}, detail=${detail}`);
    }
}

function resolveVideoOptions(reply?: { thumbData?: string; duration?: number }): { thumbData: string; duration: number } {
    return {
        thumbData: reply?.thumbData?.trim() || DEFAULT_VIDEO_THUMB_BASE64,
        duration: Number.isFinite(reply?.duration) ? Math.max(1, Math.floor(Number(reply?.duration))) : DEFAULT_VIDEO_DURATION,
    };
}

function detectImageFormat(base64?: string): string {
    if (!base64) return 'empty';
    const head = base64.slice(0, 16);
    if (head.startsWith('/9j/')) return 'jpeg';
    if (head.startsWith('iVBOR')) return 'png';
    if (head.startsWith('R0lGO')) return 'gif';
    if (head.startsWith('UklGR')) return 'webp';
    if (head.startsWith('Qk')) return 'bmp';
    return `unknown(${head})`;
}

function detectMediaSignature(base64?: string): string {
    if (!base64) return 'empty';
    const head = base64.slice(0, 24);
    if (head.startsWith('iVBOR')) return 'png';
    if (head.startsWith('/9j/')) return 'jpeg';
    if (head.startsWith('R0lGO')) return 'gif';
    if (head.startsWith('UklGR')) return 'webp-or-riff';
    if (head.startsWith('AAAAIGZ0eX') || head.startsWith('AAAAGGZ0eX') || head.startsWith('AAAAG2Z0eX')) return 'mp4/quicktime';
    if (head.startsWith('GkXfow')) return 'webm';
    return `unknown(${head})`;
}

function buildReplyPreview(reply: ReplyMessage): string | undefined {
    switch (reply.type) {
        case 'text':
        case 'markdown':
            return reply.content.slice(0, 80);
        case 'image':
            return '[图片]';
        case 'voice':
            return '[语音]';
        case 'video':
            return reply.title?.trim() || '[视频]';
        case 'news':
            return reply.articles[0]?.title?.trim() || '[链接]';
        case 'card':
            return reply.cardContent.card_nickname?.trim() || '[名片]';
        case 'app':
            return '[应用消息]';
        case 'emoji':
            return '[表情]';
        default:
            return undefined;
    }
}

/**
 * 通过微信网关 API 发送回复。
 *
 * 使用类型化的 {@link WechatApi} 客户端，根据回复类型调用对应消息接口。
 *
 * 当 `reply.to` 被设置时会覆盖默认 `receiver`。
 * 当 `reply.mentions` 被设置时，`remind` 参数会被转发，
 * 以便网关在群聊中 @ 提及这些用户。
 */
export async function sendWechatReply(
    api: WechatApi,
    reply: ReplyMessage,
    receiver: string,
    options?: {
        voiceConvertApiUrl?: string;
    },
): Promise<SentMessageRecord | null> {
    const effectiveReceiver = reply.to ?? receiver;
    let sentRecord: SentMessageRecord | null = null;

    switch (reply.type) {
        case 'text':
        case 'markdown': {
            const result = await api.sendText({
                receiver: effectiveReceiver,
                content: reply.content,
                remind: reply.mentions?.length ? reply.mentions.join(',') : undefined,
            });
            ensureWechatApiSuccess('sendText', result);
            sentRecord = toSentMessageRecord(
                effectiveReceiver,
                reply.type,
                buildReplyPreview(reply),
                extractRevokeFromSendMessageResponse(effectiveReceiver, result),
            );
            break;
        }
        case 'image': {
            const remoteUrl = reply.originalUrl?.trim() || (isHttpUrl(reply.mediaId) ? reply.mediaId.trim() : '');
            let uploadMode: 'url' | 'binary-base64' = remoteUrl ? 'url' : 'binary-base64';
            let uploadPayload = remoteUrl || reply.mediaId;
            let prefetchError: string | undefined;

            if (remoteUrl) {
                try {
                    uploadPayload = await fetchImageAsBase64FromUrl(remoteUrl);
                    uploadMode = 'binary-base64';
                    logger.info('图片 URL 已由 Worker 预下载，改走 binary CDN 上传', {
                        receiver: effectiveReceiver,
                        imageUrl: remoteUrl,
                        base64Length: uploadPayload.length,
                        estimatedBytes: Math.floor(uploadPayload.length * 0.75),
                    });
                } catch (error) {
                    prefetchError = error instanceof Error ? error.message : String(error);
                    logger.warn('图片 URL 预下载失败，仍尝试交给网关 image_url', {
                        receiver: effectiveReceiver,
                        imageUrl: remoteUrl,
                        error: prefetchError,
                    });
                }
            }

            const dataSize = uploadMode === 'binary-base64' ? uploadPayload.length : 0;
            const format = uploadMode === 'url' ? 'url' : detectImageFormat(uploadPayload);
            logger.debug('发送图片消息（CDN 上传）', {
                receiver: effectiveReceiver,
                transferMode: uploadMode,
                imageUrl: uploadMode === 'url' ? remoteUrl : remoteUrl || undefined,
                base64Length: dataSize,
                estimatedBytes: Math.floor(dataSize * 0.75),
                format,
                head: uploadMode === 'binary-base64' ? uploadPayload.slice(0, 20) : '',
                prefetchError,
            });
            try {
                const result = uploadMode === 'url'
                    ? await api.cdnUploadImage({receiver: effectiveReceiver, image_url: remoteUrl})
                    : await api.cdnUploadImage({receiver: effectiveReceiver, image: uploadPayload});
                ensureWechatApiSuccess('cdnUploadImage', result);
                logger.info('图片 CDN 上传完成', {
                    receiver: effectiveReceiver,
                    transferMode: uploadMode,
                });
                sentRecord = toSentMessageRecord(
                    effectiveReceiver,
                    reply.type,
                    buildReplyPreview(reply),
                    extractRevokeFromUploadImageResponse(effectiveReceiver, result as ApiResponse<UploadImageResponse>),
                );
            } catch (imgErr) {
                const originalUrl = remoteUrl || reply.originalUrl;
                if (originalUrl) {
                    logger.warn('图片发送失败（CDN 上传），降级为链接消息', {
                        error: imgErr instanceof Error ? imgErr.message : String(imgErr),
                        fallbackUrl: originalUrl,
                    });
                    const linkResult = await api.sendLink({
                        receiver: effectiveReceiver,
                        url: originalUrl,
                        title: '📷 图片',
                        desc: '点击查看原图',
                        thumb_url: originalUrl,
                    });
                    ensureWechatApiSuccess('sendLink(fallback)', linkResult);
                    sentRecord = toSentMessageRecord(
                        effectiveReceiver,
                        'link',
                        '[图片链接]',
                        extractRevokeFromSendAppMessageResponse(effectiveReceiver, linkResult),
                    );
                } else {
                    throw imgErr;
                }
            }
            break;
        }
        case 'voice': {
            // 主路径：mp3 base64/URL → convert → SILK(format=4) → 直发；不做 MiMo / mp3 URL 降级。
            const requestedFormat = Number.isFinite(reply.format) ? Number(reply.format) : 2;
            const duration = Number.isFinite(reply.duration) ? Math.max(0, Number(reply.duration)) : 5000;
            const mediaData = reply.mediaId?.trim() || '';
            const originalUrl = reply.originalUrl?.trim() || (isHttpUrl(mediaData) ? mediaData : '');
            const inlineBase64 = isHttpUrl(mediaData) ? '' : normalizeBase64(mediaData);
            const fallbackText = reply.fallbackText?.trim()
                || (originalUrl ? `语音发不出去了，你可以直接打开这个链接听：${originalUrl}` : '语音没发出去，等下再试试');

            if (!mediaData) {
                throw new Error('voice 缺少 mediaId：需要本地 mp3 的 base64 或可下载 URL');
            }

            logger.info('微信语音发送开始', {
                receiver: effectiveReceiver,
                requestedFormat,
                duration,
                mediaIsUrl: isHttpUrl(mediaData),
                mediaBase64Length: inlineBase64.length,
                mediaEstimatedBytes: estimateBase64Bytes(inlineBase64),
            });

            try {
                const normalizedVoice = await normalizeVoiceForWechat(
                    {
                        format: requestedFormat,
                        mediaData,
                        durationMs: duration,
                        originalUrl: reply.originalUrl,
                    },
                    {convertApiUrl: options?.voiceConvertApiUrl},
                );
                if (!normalizedVoice || normalizedVoice.format !== 4) {
                    throw new Error(`voice conversion unavailable: format=${requestedFormat}`);
                }

                const silkBase64 = isHttpUrl(normalizedVoice.mediaData)
                    ? ''
                    : normalizeBase64(normalizedVoice.mediaData);
                const silkBlob = normalizedVoice.mediaBlob;
                if (!silkBlob && !silkBase64) {
                    throw new Error('voice conversion produced empty SILK payload');
                }

                logger.info('微信语音准备调用 sendVoice', {
                    receiver: effectiveReceiver,
                    sendFormat: 4,
                    converted: normalizedVoice.converted,
                    duration: normalizedVoice.durationMs,
                    sendBy: silkBlob ? 'voice-blob' : 'voice-base64',
                    voiceBlobSize: silkBlob?.size,
                    voiceBase64Length: silkBase64.length,
                    voiceEstimatedBytes: estimateBase64Bytes(silkBase64),
                });

                const result = await api.sendVoice({
                    receiver: effectiveReceiver,
                    voice: silkBlob ?? silkBase64,
                    duration: normalizedVoice.durationMs,
                    format: 4,
                });
                ensureWechatApiSuccess('sendVoice', result);
                logger.info('微信语音 sendVoice 成功', {
                    receiver: effectiveReceiver,
                    sendFormat: 4,
                    converted: normalizedVoice.converted,
                });
                sentRecord = toSentMessageRecord(
                    effectiveReceiver,
                    reply.type,
                    buildReplyPreview(reply),
                    extractRevokeFromUploadVoiceResponse(effectiveReceiver, result),
                );
            } catch (voiceErr) {
                logger.warn('语音发送失败，降级为文本提示', {
                    receiver: effectiveReceiver,
                    requestedFormat,
                    duration,
                    error: voiceErr instanceof Error ? voiceErr.message : String(voiceErr),
                });
                const textResult = await api.sendText({
                    receiver: effectiveReceiver,
                    content: fallbackText,
                    remind: reply.mentions?.length ? reply.mentions.join(',') : undefined,
                });
                ensureWechatApiSuccess('sendText(fallback)', textResult);
                sentRecord = toSentMessageRecord(
                    effectiveReceiver,
                    'text',
                    fallbackText.slice(0, 80),
                    extractRevokeFromSendMessageResponse(effectiveReceiver, textResult),
                );
            }
            break;
        }
        case 'video': {
            const videoUrl = reply.originalUrl?.trim() || (isHttpUrl(reply.mediaId) ? reply.mediaId.trim() : '');
            const thumbUrl = reply.linkPicUrl?.trim() || '';
            const {thumbData, duration} = resolveVideoOptions(reply);
            logger.debug('发送视频消息（CDN 上传）', {
                receiver: effectiveReceiver,
                transferMode: videoUrl ? 'url' : 'binary-base64',
                videoUrl,
                videoBase64Length: videoUrl ? 0 : (reply.mediaId?.length ?? 0),
                videoEstimatedBytes: videoUrl ? 0 : Math.floor((reply.mediaId?.length ?? 0) * 0.75),
                videoSignature: videoUrl ? 'url' : detectMediaSignature(reply.mediaId),
                thumbUrl,
                thumbBase64Length: thumbData.length,
                thumbEstimatedBytes: Math.floor(thumbData.length * 0.75),
                thumbSignature: thumbUrl ? 'url' : detectMediaSignature(thumbData),
                usesDefaultThumb: !thumbUrl && thumbData === DEFAULT_VIDEO_THUMB_BASE64,
                duration,
                title: reply.title ?? '',
                hasOriginalUrl: Boolean(videoUrl),
                hasLinkPicUrl: Boolean(thumbUrl),
            });
            try {
                const result = await api.cdnUploadVideo({
                    receiver: effectiveReceiver,
                    video: videoUrl ? undefined : reply.mediaId,
                    video_url: videoUrl || undefined,
                    thumb: thumbUrl ? undefined : thumbData,
                    thumb_url: thumbUrl || undefined,
                    duration,
                });
                ensureWechatApiSuccess('cdnUploadVideo', result);
                sentRecord = toSentMessageRecord(
                    effectiveReceiver,
                    reply.type,
                    buildReplyPreview(reply),
                    extractRevokeFromUploadVideoResponse(effectiveReceiver, result as ApiResponse<UploadVideoResponse>),
                );
            } catch (videoErr) {
                logger.warn('视频发送失败（CDN 上传）', {
                    receiver: effectiveReceiver,
                    duration,
                    videoBase64Length: videoUrl ? 0 : (reply.mediaId?.length ?? 0),
                    videoSignature: videoUrl ? 'url' : detectMediaSignature(reply.mediaId),
                    thumbBase64Length: thumbData.length,
                    thumbSignature: thumbUrl ? 'url' : detectMediaSignature(thumbData),
                    usesDefaultThumb: !thumbUrl && thumbData === DEFAULT_VIDEO_THUMB_BASE64,
                    error: videoErr instanceof Error ? videoErr.message : String(videoErr),
                });
                if (videoUrl) {
                    const linkPicUrl = thumbUrl;
                    logger.warn('视频发送失败，降级为链接消息', {
                        receiver: effectiveReceiver,
                        error: videoErr instanceof Error ? videoErr.message : String(videoErr),
                        fallbackUrl: videoUrl,
                        hasLinkPicUrl: Boolean(linkPicUrl),
                    });
                    const linkResult = await api.sendLink({
                        receiver: effectiveReceiver,
                        url: videoUrl,
                        title: reply.title?.trim() || '视频推荐',
                        desc: reply.description?.trim() || '点击查看视频',
                        thumb_url: linkPicUrl,
                    });
                    ensureWechatApiSuccess('sendLink(fallback)', linkResult);
                    sentRecord = toSentMessageRecord(
                        effectiveReceiver,
                        'link',
                        buildReplyPreview(reply),
                        extractRevokeFromSendAppMessageResponse(effectiveReceiver, linkResult),
                    );
                } else {
                    throw videoErr;
                }
            }
            break;
        }
        case 'news': {
            const first = reply.articles[0];
            if (first?.url) {
                const result = await api.sendLink({
                    receiver: effectiveReceiver,
                    url: first.url,
                    title: first.title,
                    desc: first.description ?? '',
                    thumb_url: first.picUrl ?? '',
                });
                ensureWechatApiSuccess('sendLink', result);
                sentRecord = toSentMessageRecord(
                    effectiveReceiver,
                    reply.type,
                    buildReplyPreview(reply),
                    extractRevokeFromSendAppMessageResponse(effectiveReceiver, result),
                );
            }
            break;
        }
        case 'card': {
            const result = await api.sendCard({
                receiver: effectiveReceiver,
                card_username: reply.cardContent.card_username,
                card_nickname: reply.cardContent.card_nickname,
                card_alias: reply.cardContent.card_alias,
            });
            ensureWechatApiSuccess('sendCard', result);
            sentRecord = toSentMessageRecord(
                effectiveReceiver,
                reply.type,
                buildReplyPreview(reply),
                extractRevokeFromSendMessageResponse(effectiveReceiver, result),
            );
            break;
        }
        case 'app': {
            const payload = {
                receiver: effectiveReceiver,
                type: reply.appType,
                xml: reply.appXml,
            };
            logger.info('发送应用消息（sendApp）', {
                receiver: effectiveReceiver,
                appType: reply.appType,
                sendPath: 'sendApp',
                payload,
            });
            console.log('wechat app send payload', payload);
            const result = await api.sendApp(payload);
            ensureWechatApiSuccess('sendApp', result);
            sentRecord = toSentMessageRecord(
                effectiveReceiver,
                reply.type,
                buildReplyPreview(reply),
                extractRevokeFromSendAppMessageResponse(effectiveReceiver, result),
            );
            break;
        }
        case 'emoji': {
            const emojiUrl = reply.emojiUrl.trim();
            logger.info('发送表情消息（sendEmoji）', {
                receiver: effectiveReceiver,
                md5: reply.md5,
                emojiUrl,
            });
            const result = await api.sendEmoji({
                receiver: effectiveReceiver,
                md5: reply.md5,
                emoji_url: emojiUrl,
            });
            ensureWechatApiSuccess('sendEmoji', result);
            sentRecord = toSentMessageRecord(
                effectiveReceiver,
                reply.type,
                buildReplyPreview(reply),
                extractRevokeFromUploadEmojiResponse(effectiveReceiver, result),
            );
            break;
        }
        default:
            break;
    }

    return sentRecord;
}

