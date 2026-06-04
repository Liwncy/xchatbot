import type {
    IncomingMessage,
    ReplyMessage,
    Env,
} from '../types/message.js';
import type {WechatPushMessage} from './types.js';
import {WechatApi} from './api.js';
import {verifyWechatSignature} from './inbound/verify.js';
import {
    parseWechatMessage,
    parseWechatMessages,
    parseWechatPushItem,
} from './inbound/parse-payload.js';
import {buildWechatReply} from './outbound/build-send-params.js';
import {logger} from '../utils/logger.js';
import {DEFAULT_VIDEO_DURATION, DEFAULT_VIDEO_THUMB_BASE64} from './constants.js';
import {normalizeVoiceForWechat} from '../utils/silk-converter.js';
import {FileUploader} from '../utils/file-uploader.js';
import {ContactRepository} from '../plugins/system/contact-admin/repository.js';

export {
    buildWechatChatRecordAppReply,
    buildWechatChatRecordAppXml,
    buildSingleWechatChatRecordAppReply,
} from './builders/chat-record.js';
export {
    WechatChatRecordImageTool,
    buildWechatChatRecordImageDataDesc,
    buildWechatChatRecordImageFields,
} from './builders/chat-record-image.js';
export {
    buildWechatContactCardMessageContent,
    buildWechatContactCardForwardXml,
    buildWechatContactCardXml,
    buildWechatContactCardXmlReply,
    sendWechatContactCardAppMessage,
    sendWechatContactCardForwardMessage,
    sendWechatContactCardXmlMessage,
} from './builders/card.js';

const MESSAGE_EXPIRE_SECONDS = 3 * 60;
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

function resolveVoiceUploadMeta(format: number): {fileName: string; contentType: string} {
    switch (format) {
        case 0:
            return {fileName: `voice-${Date.now()}.amr`, contentType: 'audio/amr'};
        case 1:
            return {fileName: `voice-${Date.now()}.spx`, contentType: 'audio/x-speex'};
        case 2:
            return {fileName: `voice-${Date.now()}.mp3`, contentType: 'audio/mpeg'};
        case 3:
            return {fileName: `voice-${Date.now()}.wav`, contentType: 'audio/wav'};
        case 4:
            return {fileName: `voice-${Date.now()}.silk`, contentType: 'application/octet-stream'};
        default:
            return {fileName: `voice-${Date.now()}.dat`, contentType: 'application/octet-stream'};
    }
}

async function uploadVoiceForWechatDelivery(data: Blob | string, format: number): Promise<string | undefined> {
    const meta = resolveVoiceUploadMeta(format);
    const fileUrl = await FileUploader.upload(data, {
        fileName: meta.fileName,
        contentType: meta.contentType,
    });
    return fileUrl ?? undefined;
}

function ensureWechatApiSuccess(op: string, result: unknown): void {
    const code = (result as { code?: unknown })?.code;
    const message = (result as { message?: unknown })?.message;
    if (typeof code === 'number' && code !== 0) {
        const detail = JSON.stringify(result).slice(0, 500);
        throw new Error(`${op} failed: code=${code}, message=${String(message ?? '')}, detail=${detail}`);
    }
}

export {verifyWechatSignature, parseWechatMessage, parseWechatMessages, parseWechatPushItem, buildWechatReply};

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
): Promise<void> {
    const effectiveReceiver = reply.to ?? receiver;

    switch (reply.type) {
        case 'text':
        case 'markdown': {
            const result = await api.sendText({
                receiver: effectiveReceiver,
                content: reply.content,
                remind: reply.mentions?.length ? reply.mentions.join(',') : undefined,
            });
            ensureWechatApiSuccess('sendText', result);
            break;
        }
        case 'image': {
            const imageUrl = reply.originalUrl?.trim() || (isHttpUrl(reply.mediaId) ? reply.mediaId.trim() : '');
            const dataSize = imageUrl ? 0 : (reply.mediaId?.length ?? 0);
            const format = imageUrl ? 'url' : detectImageFormat(reply.mediaId);
            logger.debug('发送图片消息（CDN 上传）', {
                receiver: effectiveReceiver,
                transferMode: imageUrl ? 'url' : 'binary-base64',
                imageUrl,
                base64Length: dataSize,
                estimatedBytes: Math.floor(dataSize * 0.75),
                format,
                head: reply.mediaId?.slice(0, 20) ?? '',
            });
            try {
                const result = imageUrl
                    ? await api.cdnUploadImage({receiver: effectiveReceiver, image_url: imageUrl})
                    : await api.cdnUploadImage({receiver: effectiveReceiver, image: reply.mediaId});
                ensureWechatApiSuccess('cdnUploadImage', result);
            } catch (imgErr) {
                // 图片发送失败时，尝试降级为链接消息（如果有原始 URL）
                const originalUrl = imageUrl || reply.originalUrl;
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
                } else {
                    throw imgErr;
                }
            }
            break;
        }
        case 'voice': {
            const requestedFormat = Number.isFinite(reply.format) ? Number(reply.format) : 4;
            const duration = Number.isFinite(reply.duration) ? Math.max(0, Number(reply.duration)) : 5000;
            const originalUrl = reply.originalUrl?.trim() || (isHttpUrl(reply.mediaId) ? reply.mediaId.trim() : '');
            const inlineBase64 = isHttpUrl(reply.mediaId) ? '' : normalizeBase64(reply.mediaId);

            const fallbackText = reply.fallbackText?.trim()
                || (originalUrl ? `语音发送失败，可尝试打开原链接：${originalUrl}` : '语音发送失败，请稍后重试');

            logger.info('微信语音发送开始', {
                receiver: effectiveReceiver,
                requestedFormat,
                duration,
                hasOriginalUrl: Boolean(originalUrl),
                originalUrl,
                mediaIsUrl: isHttpUrl(reply.mediaId),
                mediaBase64Length: inlineBase64.length,
                mediaEstimatedBytes: estimateBase64Bytes(inlineBase64),
            });

            try {

                const normalizedVoice = await normalizeVoiceForWechat(
                    {
                        format: requestedFormat,
                        mediaData: reply.mediaId,
                        durationMs: duration,
                        originalUrl: reply.originalUrl,
                    },
                    {
                        convertApiUrl: options?.voiceConvertApiUrl,
                    },
                );
                if (!normalizedVoice) {
                    logger.warn('语音转换失败，无法生成可发送的 SILK 音频', {
                        receiver: effectiveReceiver,
                        requestedFormat,
                        hasOriginalUrl: Boolean(reply.originalUrl?.trim()),
                    });
                    throw new Error(`voice conversion unavailable: format=${requestedFormat}`);
                }

                const voiceUrl = !normalizedVoice.converted && isHttpUrl(normalizedVoice.mediaData)
                    ? normalizedVoice.mediaData.trim()
                    : '';
                const inlineVoiceBase64 = voiceUrl ? '' : normalizeBase64(normalizedVoice.mediaData);
                const inlineVoiceBlob = normalizedVoice.mediaBlob;
                logger.info('微信语音准备调用 sendVoice', {
                    receiver: effectiveReceiver,
                    requestedFormat,
                    sendFormat: normalizedVoice.format,
                    converted: normalizedVoice.converted,
                    duration: normalizedVoice.durationMs,
                    sendBy: voiceUrl ? 'voice_url' : (inlineVoiceBlob ? 'voice-blob' : 'voice-base64'),
                    voiceUrl,
                    hasVoiceBlob: Boolean(inlineVoiceBlob),
                    voiceBlobSize: inlineVoiceBlob?.size,
                    voiceBase64Length: voiceUrl ? 0 : inlineVoiceBase64.length,
                    voiceEstimatedBytes: voiceUrl ? 0 : estimateBase64Bytes(inlineVoiceBase64),
                });
                let result;
                if (voiceUrl) {
                    result = await api.sendVoice({
                        receiver: effectiveReceiver,
                        voice_url: voiceUrl,
                        duration: normalizedVoice.durationMs,
                        format: normalizedVoice.format,
                    });
                    ensureWechatApiSuccess('sendVoice', result);
                } else {
                    try {
                        result = await api.sendVoice({
                            receiver: effectiveReceiver,
                            voice: inlineVoiceBlob ?? inlineVoiceBase64,
                            duration: normalizedVoice.durationMs,
                            format: normalizedVoice.format,
                        });
                        ensureWechatApiSuccess('sendVoice', result);
                    } catch (directVoiceErr) {
                        if (normalizedVoice.format !== 4 || !inlineVoiceBase64) {
                            throw directVoiceErr;
                        }
                        const uploadedVoiceUrl = (await uploadVoiceForWechatDelivery(inlineVoiceBlob ?? inlineVoiceBase64, normalizedVoice.format))?.trim() || '';
                        logger.info('微信语音直发失败，已尝试上传 SILK 外链重试', {
                            receiver: effectiveReceiver,
                            requestedFormat,
                            sendFormat: normalizedVoice.format,
                            uploadedVoiceUrl,
                            uploaded: Boolean(uploadedVoiceUrl),
                            uploadedFromBlob: Boolean(inlineVoiceBlob),
                            voiceBlobSize: inlineVoiceBlob?.size,
                            voiceBase64Length: inlineVoiceBase64.length,
                            voiceEstimatedBytes: estimateBase64Bytes(inlineVoiceBase64),
                            directError: directVoiceErr instanceof Error ? directVoiceErr.message : String(directVoiceErr),
                        });
                        if (!uploadedVoiceUrl) {
                            throw directVoiceErr;
                        }
                        result = await api.sendVoice({
                            receiver: effectiveReceiver,
                            voice_url: uploadedVoiceUrl,
                            duration: normalizedVoice.durationMs,
                            format: normalizedVoice.format,
                        });
                        ensureWechatApiSuccess('sendVoice(uploaded voice_url)', result);
                    }
                }
                logger.info('微信语音 sendVoice 成功', {
                    receiver: effectiveReceiver,
                    requestedFormat,
                    sendFormat: normalizedVoice.format,
                    converted: normalizedVoice.converted,
                });
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
            break;
        }
        default:
            break;
    }
}

function resolveVideoOptions(reply?: { thumbData?: string; duration?: number }): { thumbData: string; duration: number } {
    return {
        thumbData: reply?.thumbData?.trim() || DEFAULT_VIDEO_THUMB_BASE64,
        duration: Number.isFinite(reply?.duration) ? Math.max(1, Math.floor(Number(reply?.duration))) : DEFAULT_VIDEO_DURATION,
    };
}


/**
 * 通过 base64 开头字节（magic bytes）识别图片格式。
 *
 * - JPEG: /9j/
 * - PNG:  iVBOR
 * - GIF:  R0lGO
 * - WEBP: UklGR (RIFF...WEBP)
 * - BMP:  Qk
 */
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

function isExpiredMessage(message: IncomingMessage, nowUnixSeconds: number): boolean {
    return nowUnixSeconds - message.timestamp > MESSAGE_EXPIRE_SECONDS;
}

function resolveVoiceConversionOptions(env: Env): {
    voiceConvertApiUrl?: string;
} {
    const voiceEnv = env as Env & {
        VOICE_CONVERT_API_URL?: string;
        VOICE_TOSILK_API_URL?: string;
    };
    return {
        // Prefer the new generic variable name; keep legacy fallback.
        voiceConvertApiUrl: voiceEnv.VOICE_CONVERT_API_URL || voiceEnv.VOICE_TOSILK_API_URL,
    };
}

/**
 * 微信请求主处理器。
 * 接收来自网关的 JSON 数据并处理消息。
 *
 * 通过类型化 API 客户端发送回复。
 */
export async function handleWechat(request: Request, env: Env): Promise<Response> {
    const token = env.WECHAT_TOKEN ?? '';
    const apiBaseUrl = env.WECHAT_API_BASE_URL ?? '';

    // 仅接受 POST 请求
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', {status: 405});
    }

    const body = await request.text();

    logger.debug('收到微信消息', body);

    // 如果配置了 token，验证 HMAC-SHA256 签名
    if (token) {
        const signature = request.headers.get('x-signature') ?? '';
        const timestamp = request.headers.get('x-timestamp') ?? '';

        const valid = await verifyWechatSignature(token, signature, timestamp, body);
        if (!valid) {
            logger.warn('微信签名验证失败');
            return new Response('Invalid signature', {status: 403});
        }
    }

    let payload: WechatPushMessage;
    try {
        payload = JSON.parse(body) as WechatPushMessage;
    } catch {
        logger.error('微信消息 JSON 解析失败', body);
        return new Response('Invalid JSON', {status: 400});
    }

    let messages: IncomingMessage[];
    try {
        messages = parseWechatMessages(payload);
    } catch (error) {
        // 忽略非消息推送（联系人变更、个人资料更新等）。
        logger.debug('跳过非消息推送', {
            error: error instanceof Error ? error.message : String(error),
            payloadKeys: Object.keys(payload ?? {}),
            newMessageCount: Array.isArray(payload.new_message) ? payload.new_message.length : null,
        });
        return new Response(JSON.stringify({success: true, skipped: true}), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        });
    }

    const nowUnixSeconds = Math.floor(Date.now() / 1000);
    const activeMessages = messages.filter((message) => !isExpiredMessage(message, nowUnixSeconds));
    const expiredCount = messages.length - activeMessages.length;
    if (expiredCount > 0) {
        logger.debug('跳过过期微信消息', {expiredCount, thresholdSeconds: MESSAGE_EXPIRE_SECONDS});
    }

    if (activeMessages.length === 0) {
        return new Response(JSON.stringify({success: true, skipped: true, reason: 'expired'}), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        });
    }

    // 分发到路由（逐条处理批量消息）
    const {routeMessage} = await import('../message/router.js');
    const {toReplyArray} = await import('../message/response.js');
    const replyTasks: Array<{ message: IncomingMessage; reply: ReplyMessage }> = [];
    const ownerWxid = env.BOT_OWNER_WECHAT_ID?.trim() ?? '';

    for (const message of activeMessages) {
        // 全局白名单：
        // 1) 机器人主人消息永远放行
        // 2) 私聊放行
        // 3) 群聊仅当群ID在联系人列表中才放行
        if (!ownerWxid || message.from !== ownerWxid) {
            if (message.source === 'private') {
                // pass
            } else if (message.source === 'group') {
                if (!apiBaseUrl || !message.room?.id) {
                    logger.debug('消息被白名单过滤（群聊缺少配置或群ID）', {
                        source: message.source,
                        roomId: message.room?.id,
                        hasApiBaseUrl: Boolean(apiBaseUrl),
                    });
                    continue;
                }
                const allowed = await ContactRepository.isGroupContactAllowed(env.XBOT_DB, message.room.id);
                if (!allowed) {
                    logger.debug('消息被白名单过滤（群聊不在联系人列表）', {
                        source: message.source,
                        roomId: message.room.id,
                    });
                    continue;
                }
            } else {
                logger.debug('消息被白名单过滤（非私聊且非联系人群聊）', {
                    source: message.source,
                    from: message.from,
                });
                continue;
            }
        }

        console.log('处理微信消息', {routeMessage, toReplyArray, message});
        const response = await routeMessage(message, env);
        const replies = toReplyArray(response);
        for (const reply of replies) {
            replyTasks.push({message, reply});
        }
    }

    if (replyTasks.length === 0) {
        return new Response(JSON.stringify({success: true}), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        });
    }

    // 优先使用类型化 API 客户端（需配置 base URL）
    if (apiBaseUrl) {
        const api = new WechatApi(apiBaseUrl);
        const voiceOptions = resolveVoiceConversionOptions(env);
        for (const task of replyTasks) {
            const receiver = task.message.room?.id ?? task.message.from;
            try {
                await sendWechatReply(api, task.reply, receiver, voiceOptions);
            } catch (err) {
                logger.error('微信 API 发送回复失败', {
                    replyType: task.reply.type,
                    receiver,
                    apiBaseUrl,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        return new Response(JSON.stringify({success: true}), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        });
    }

    // 未配置 API 网关时，回落为在响应体中返回回复
    const replyPayloads = replyTasks.map((task) =>
        buildWechatReply(task.reply, task.message.from, task.message.room?.id),
    );
    const responseBody = replyPayloads.length === 1 ? replyPayloads[0] : replyPayloads;
    return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
    });
}

