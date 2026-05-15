import {hmacSha256Hex} from '../utils/crypto.js';
import type {
    IncomingMessage,
    ReplyMessage,
    MessageType,
    MessageSource,
    Env,
} from '../types/message.js';
import type {WechatPushItem, WechatPushMessage} from './types.js';
import {WechatApi} from './api.js';
import {logger} from '../utils/logger.js';
import {DEFAULT_VIDEO_DURATION, DEFAULT_VIDEO_THUMB_BASE64} from './constants.js';
import {normalizeVoiceForWechat} from '../utils/silk-converter.js';
import {ContactRepository} from '../plugins/system/contact-admin/repository.js';

export {
    buildWechatChatRecordAppReply,
    buildWechatChatRecordAppXml,
    buildSingleWechatChatRecordAppReply,
} from './chat-record.js';
export {
    WechatChatRecordImageTool,
    buildWechatChatRecordImageDataDesc,
    buildWechatChatRecordImageFields,
} from './chat-record-image.js';

const MESSAGE_EXPIRE_SECONDS = 3 * 60;
function isHttpUrl(value?: string): boolean {
    return /^https?:\/\//i.test(value?.trim() ?? '');
}

function resolveReplyMediaUrl(reply: {mediaId: string; originalUrl?: string}): string {
    const originalUrl = reply.originalUrl?.trim();
    if (originalUrl) return originalUrl;
    return reply.mediaId;
}

function getWechatItemSource(item: WechatPushItem): string {
    return item.source ?? item.msg_source ?? '';
}

function getWechatItemId(item: WechatPushItem): number | undefined {
    return item.id ?? item.msg_id;
}

function getWechatItemNewId(item: WechatPushItem): number | undefined {
    return item.new_id ?? item.new_msg_id;
}

function ensureWechatApiSuccess(op: string, result: unknown): void {
    const code = (result as { code?: unknown })?.code;
    const message = (result as { message?: unknown })?.message;
    if (typeof code === 'number' && code !== 0) {
        const detail = JSON.stringify(result).slice(0, 500);
        throw new Error(`${op} failed: code=${code}, message=${String(message ?? '')}, detail=${detail}`);
    }
}

/**
 * 验证微信网关的 Webhook 签名。
 * 使用 HMAC-SHA256(timestamp + body, token) 进行认证。
 */
export async function verifyWechatSignature(
    token: string,
    signature: string,
    timestamp: string,
    body: string,
): Promise<boolean> {
    const expected = await hmacSha256Hex(token, timestamp + body);
    return expected === signature;
}

/** 将微信数字消息类型映射为标准化类型。 */
function mapWechatType(type: number): MessageType {
    switch (type) {
        case 1:
            return 'text';
        case 3:
        case 47:
            return 'image';
        case 34:
            return 'voice';
        case 43:
            return 'video';
        case 48:
            return 'location';
        case 49:
            return 'link';
        default:
            return 'text';
    }
}

/** 根据网关字段推断消息来源。 */
function inferWechatSource(payload: WechatPushItem): MessageSource {
    const source = getWechatItemSource(payload).toLowerCase();
    const sender = payload.sender?.value ?? '';
    const receiver = payload.receiver?.value ?? '';

    if (source.includes('official')) return 'official';
    if (
        source.includes('chatroom') ||
        sender.endsWith('@chatroom') ||
        receiver.endsWith('@chatroom')
    ) {
        return 'group';
    }

    return 'private';
}

/** 将毫秒时间戳转换为标准消息模型需要的秒级时间戳。 */
function toUnixSeconds(timestamp: number): number {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return Math.floor(Date.now() / 1000);
    return timestamp > 1_000_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
}

function resolveRoomId(item: WechatPushItem): string {
    if (item.receiver?.value?.endsWith('@chatroom')) return item.receiver.value;
    if (item.sender?.value?.endsWith('@chatroom')) return item.sender.value;
    return item.receiver?.value ?? '';
}

/**
 * 群文本常见格式：`wxid_xxx:\n消息内容`。
 * 解析后用于将标准化 `from` 还原为具体群成员 ID。
 */
function parseGroupTextSender(rawContent: string): { senderId?: string; content: string } {
    const text = rawContent ?? '';
    const separatorIndex = text.indexOf(':\n');
    if (separatorIndex <= 0) {
        return {content: text};
    }

    const senderId = text.slice(0, separatorIndex).trim();
    const content = text.slice(separatorIndex + 2);
    if (!senderId) {
        return {content: text};
    }

    return {senderId, content};
}

/**
 * `push_content` 常见格式：`显示名 : 消息内容`，用于补全 senderName。
 */
function parseSenderNameFromPushContent(pushContent?: string): string | undefined {
    if (!pushContent) return undefined;

    // 私聊常见格式：`显示名 : 内容`
    const separatorIndex = pushContent.indexOf(' : ');
    if (separatorIndex > 0) {
        const name = pushContent.slice(0, separatorIndex).trim();
        if (name) return name;
    }
    // 群图片等常见格式：`显示名在群聊中发了...`
    const groupActionMatch = pushContent.match(/^(.+?)在群聊中发了/);
    if (groupActionMatch?.[1]) {
        const name = groupActionMatch[1].trim();
        if (name) return name;
    }

    return undefined;
}

function parseWechatImageMediaId(item: WechatPushItem): string | undefined {
    const buffer = item.image_buffer?.data ?? item.image_buffer?.buffer;
    if (!buffer) return undefined;

    // 新网关格式：base64 字符串
    if (typeof buffer === 'string') {
        const normalized = buffer.trim();
        return normalized || undefined;
    }

    // 兼容旧格式：number[]
    if (Array.isArray(buffer) && buffer.length > 0) {
        return buffer.join(',');
    }

    return undefined;
}

/**
 * 将单条微信推送项解析为标准化 IncomingMessage。
 */
export function parseWechatPushItem(
    item: WechatPushItem,
    raw: unknown,
): IncomingMessage {
    const msgType = mapWechatType(item.type);
    const source = inferWechatSource(item);
    const rawContent = item.content?.value ?? item.push_content ?? '';
    const groupMeta = source === 'group'
        ? parseGroupTextSender(rawContent)
        : {content: rawContent};

    const base: Omit<IncomingMessage, 'type'> = {
        platform: 'wechat' as const,
        source,
        // 群消息里 sender 字段常为 chatroom，content 前缀里才有真实发送者 wxid。
        from: source === 'group' ? (groupMeta.senderId ?? item.sender?.value ?? '') : (item.sender?.value ?? ''),
        senderName: parseSenderNameFromPushContent(item.push_content),
        to: item.receiver?.value ?? '',
        timestamp: toUnixSeconds(item.create_time),
        // 优先使用更稳定的客户端消息 ID；兼容新旧字段名。
        messageId: String(getWechatItemId(item) ?? getWechatItemNewId(item) ?? item.create_time),
        raw,
    };

    if (source === 'group') {
        base.room = {
            id: resolveRoomId(item),
        };
    }

    if (msgType === 'text') {
        return {
            ...base,
            type: 'text',
            content: groupMeta.content,
        };
    }

    if (msgType === 'image') {
        return {
            ...base,
            type: 'image',
            mediaId: parseWechatImageMediaId(item),
        };
    }

    if (msgType === 'voice') {
        return {...base, type: 'voice'};
    }

    if (msgType === 'video') {
        return {...base, type: 'video'};
    }

    if (msgType === 'location') {
        return {
            ...base,
            type: 'location',
            location: {
                latitude: 0,
                longitude: 0,
            },
        };
    }

    if (msgType === 'link') {
        return {
            ...base,
            type: 'link',
            link: {
                title: item.content?.value ?? '',
                description: '',
                url: '',
            },
        };
    }

    return {...base, type: 'text', content: item.content?.value ?? item.push_content ?? ''};
}

/**
 * 将微信推送消息解析为标准化的 IncomingMessage。
 * 如果 `new_messages` 里没有消息则抛出异常。
 */
export function parseWechatMessage(payload: WechatPushMessage): IncomingMessage {
    const item = payload.new_messages?.[0];
    if (!item) {
        throw new Error('No new_messages in WeChat push payload');
    }

    return parseWechatPushItem(item, payload);
}

/**
 * 将微信推送消息解析为标准化消息数组。
 */
export function parseWechatMessages(payload: WechatPushMessage): IncomingMessage[] {
    const items = payload.new_messages ?? [];
    if (items.length === 0) {
        throw new Error('No new_messages in WeChat push payload');
    }

    return items.map((item) => parseWechatPushItem(item, payload));
}

/**
 * 构建发送给微信网关的 JSON 回复数据。
 *
 * 当 `reply.to` 被设置时会覆盖默认接收者。
 * 当 `reply.mentions` 被设置且消息发送到群聊时，
 * 会包含 `remind` 字段（逗号分隔的 wxid），以便网关 @ 提及这些用户。
 */
export function buildWechatReply(
    reply: ReplyMessage,
    toUser: string,
    roomId?: string,
): Record<string, unknown> {
    const effectiveTo = reply.to ?? (roomId ? roomId : toUser);
    const target: Record<string, unknown> = {to: effectiveTo};

    // 发送到群聊时包含 @ 提及列表
    if (reply.mentions?.length && (roomId || reply.to?.endsWith('@chatroom'))) {
        target.remind = reply.mentions.join(',');
    }

    if (reply.type === 'text') {
        return {...target, type: 'text', content: reply.content};
    }

    if (reply.type === 'image') {
        return {...target, type: 'image', mediaUrl: resolveReplyMediaUrl(reply)};
    }

    if (reply.type === 'voice') {
        return {
            ...target,
            type: 'voice',
            mediaUrl: resolveReplyMediaUrl(reply),
            duration: reply.duration ?? 5000,
            format: reply.format ?? 4,
        };
    }

    if (reply.type === 'video') {
        return {
            ...target,
            type: 'video',
            mediaUrl: resolveReplyMediaUrl(reply),
            title: reply.title ?? '',
            description: reply.description ?? '',
        };
    }

    if (reply.type === 'news') {
        return {
            ...target,
            type: 'news',
            articles: reply.articles,
        };
    }

    if (reply.type === 'card') {
        return {
            ...target,
            type: 'card',
            cardContent: reply.cardContent,
        };
    }

    if (reply.type === 'app') {
        return {
            ...target,
            type: 'app',
            appType: reply.appType,
            appXml: reply.appXml,
        };
    }

    if (reply.type === 'markdown') {
        return {...target, type: 'text', content: reply.content};
    }

    return {};
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
                throw new Error(`voice conversion unavailable: format=${requestedFormat}`);
            }
            try {
                const voiceUrl = !normalizedVoice.converted && isHttpUrl(normalizedVoice.mediaData)
                    ? normalizedVoice.mediaData.trim()
                    : '';
                const result = await api.sendVoice({
                    receiver: effectiveReceiver,
                    voice: voiceUrl ? undefined : normalizedVoice.mediaData,
                    voice_url: voiceUrl || undefined,
                    duration: normalizedVoice.durationMs,
                    format: normalizedVoice.format,
                });
                ensureWechatApiSuccess('sendVoice', result);
            } catch (voiceErr) {
                const fallbackText = reply.fallbackText?.trim()
                    || (reply.originalUrl ? `语音发送失败，可尝试打开原链接：${reply.originalUrl}` : '语音发送失败，请稍后重试');
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
    } catch {
        // 忽略非消息推送（联系人变更、个人资料更新等）。
        logger.debug('跳过非消息推送');
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
    const {routeMessage, toReplyArray} = await import('../bot/index.js');
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
    }

    // 同时在响应体中返回回复
    const replyPayloads = replyTasks.map((task) =>
        buildWechatReply(task.reply, task.message.from, task.message.room?.id),
    );
    const responseBody = replyPayloads.length === 1 ? replyPayloads[0] : replyPayloads;
    return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
    });
}

