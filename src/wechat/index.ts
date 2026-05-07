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

export {
    buildWechatChatRecordAppReply,
    buildWechatChatRecordAppXml,
    buildSingleWechatChatRecordAppReply,
} from './chat-record.js';

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
 * 楠岃瘉寰俊缃戝叧鐨?Webhook 绛惧悕銆?
 * 浣跨敤 HMAC-SHA256(timestamp + body, token) 杩涜璁よ瘉銆?
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

/** 灏嗗井淇℃暟瀛楁秷鎭被鍨嬫槧灏勪负鏍囧噯鍖栫被鍨嬨€?*/
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

/** 鏍规嵁缃戝叧瀛楁鎺ㄦ柇娑堟伅鏉ユ簮銆?*/
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

/** 灏嗘绉掓椂闂存埑杞崲涓烘爣鍑嗗寲娑堟伅妯″瀷鎵€闇€鐨勭绾ф椂闂存埑銆?*/
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
 * 缇ゆ枃鏈父瑙佹牸寮忥細`wxid_xxx:\n娑堟伅鍐呭`銆?
 * 瑙ｆ瀽鍚庣敤浜庡皢鏍囧噯鍖?`from` 杩樺師涓哄叿浣撶兢鎴愬憳 ID銆?
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
 * `push_content` 甯歌鏍煎紡锛歚鏄剧ず鍚?: 娑堟伅鍐呭`锛岀敤浜庤ˉ鍏?senderName銆?
 */
function parseSenderNameFromPushContent(pushContent?: string): string | undefined {
    if (!pushContent) return undefined;

    // 绉佽亰甯歌鏍煎紡锛歚鏄电О : 鍐呭`
    const separatorIndex = pushContent.indexOf(' : ');
    if (separatorIndex > 0) {
        const name = pushContent.slice(0, separatorIndex).trim();
        if (name) return name;
    }


    // 缇ゅ浘鐗囩瓑甯歌鏍煎紡锛歚鏄电О鍦ㄧ兢鑱婁腑鍙戜簡...`
    const groupActionMatch = pushContent.match(/^(.+?)鍦ㄧ兢鑱婁腑鍙戜簡/);
    if (groupActionMatch?.[1]) {
        const name = groupActionMatch[1].trim();
        if (name) return name;
    }

    return undefined;
}

function parseWechatImageMediaId(item: WechatPushItem): string | undefined {
    const buffer = item.image_buffer?.data ?? item.image_buffer?.buffer;
    if (!buffer) return undefined;

    // 鏂扮綉鍏虫牸寮忥細base64 瀛楃涓?
    if (typeof buffer === 'string') {
        const normalized = buffer.trim();
        return normalized || undefined;
    }

    // 鍏煎鏃ф牸寮忥細number[]
    if (Array.isArray(buffer) && buffer.length > 0) {
        return buffer.join(',');
    }

    return undefined;
}

/**
 * 灏嗗崟鏉″井淇℃帹閫侀」瑙ｆ瀽涓烘爣鍑嗗寲鐨?IncomingMessage銆?
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
        // 缇ゆ秷鎭噷 sender 瀛楁甯镐负 chatroom锛宑ontent 鍓嶇紑閲屾墠鏈夌湡瀹炲彂閫佽€?wxid銆?
        from: source === 'group' ? (groupMeta.senderId ?? item.sender?.value ?? '') : (item.sender?.value ?? ''),
        senderName: parseSenderNameFromPushContent(item.push_content),
        to: item.receiver?.value ?? '',
        timestamp: toUnixSeconds(item.create_time),
        // 浼樺厛浣跨敤杈冪ǔ瀹氱殑瀹㈡埛绔秷鎭?ID锛涘吋瀹规柊鏃у瓧娈靛悕銆?
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
 * 灏嗗井淇℃帹閫佹秷鎭В鏋愪负鏍囧噯鍖栫殑 IncomingMessage銆?
 * 濡傛灉 `new_messages` 涓病鏈夋秷鎭垯鎶涘嚭寮傚父銆?
 */
export function parseWechatMessage(payload: WechatPushMessage): IncomingMessage {
    const item = payload.new_messages?.[0];
    if (!item) {
        throw new Error('No new_messages in WeChat push payload');
    }

    return parseWechatPushItem(item, payload);
}

/**
 * 灏嗗井淇℃帹閫佹秷鎭В鏋愪负鏍囧噯鍖栨秷鎭暟缁勩€?
 */
export function parseWechatMessages(payload: WechatPushMessage): IncomingMessage[] {
    const items = payload.new_messages ?? [];
    if (items.length === 0) {
        throw new Error('No new_messages in WeChat push payload');
    }

    return items.map((item) => parseWechatPushItem(item, payload));
}

/**
 * 鏋勫缓鍙戦€佺粰寰俊缃戝叧鐨?JSON 鍥炲鏁版嵁銆?
 *
 * 褰?`reply.to` 琚缃椂浼氳鐩栭粯璁ゆ帴鏀惰€呫€?
 * 褰?`reply.mentions` 琚缃笖娑堟伅鍙戦€佸埌缇よ亰鏃讹紝
 * 浼氬寘鍚?`remind` 瀛楁锛堥€楀彿鍒嗛殧鐨?wxid锛夛紝浠ヤ究缃戝叧 @鎻愬強杩欎簺鐢ㄦ埛銆?
 */
export function buildWechatReply(
    reply: ReplyMessage,
    toUser: string,
    roomId?: string,
): Record<string, unknown> {
    const effectiveTo = reply.to ?? (roomId ? roomId : toUser);
    const target: Record<string, unknown> = {to: effectiveTo};

    // 鍙戦€佸埌缇よ亰鏃跺寘鍚?@鎻愬強鍒楄〃
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
 * 閫氳繃寰俊缃戝叧 API 鍙戦€佸洖澶嶃€?
 *
 * 浣跨敤绫诲瀷鍖栫殑 {@link WechatApi} 瀹㈡埛绔紝鏍规嵁鍥炲绫诲瀷璋冪敤鐩稿簲鐨勬秷鎭帴鍙ｃ€?
 *
 * 褰?`reply.to` 琚缃椂浼氳鐩栭粯璁?`receiver`銆?
 * 褰?`reply.mentions` 琚缃椂锛宍remind` 鍙傛暟浼氳杞彂锛?
 * 浠ヤ究缃戝叧鍦ㄧ兢鑱婁腑 @鎻愬強杩欎簺鐢ㄦ埛銆?
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
 * 閫氳繃 base64 寮€澶村瓧鑺傦紙magic bytes锛夎瘑鍒浘鐗囨牸寮忋€?
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
 * 寰俊涓汉鍙疯姹備富澶勭悊鍣ㄣ€?
 * 鎺ユ敹鏉ヨ嚜缃戝叧鐨?JSON 鏁版嵁骞跺鐞嗘秷鎭€?
 *
 * 閫氳繃绫诲瀷鍖?API 瀹㈡埛绔彂閫佸洖澶嶃€?
 */
export async function handleWechat(request: Request, env: Env): Promise<Response> {
    const token = env.WECHAT_TOKEN ?? '';
    const apiBaseUrl = env.WECHAT_API_BASE_URL ?? '';

    // 浠呮帴鍙?POST 璇锋眰
    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', {status: 405});
    }

    const body = await request.text();

    logger.debug('鏀跺埌寰俊娑堟伅', body);

    // 濡傛灉閰嶇疆浜?token锛岄獙璇?HMAC-SHA256 绛惧悕
    if (token) {
        const signature = request.headers.get('x-signature') ?? '';
        const timestamp = request.headers.get('x-timestamp') ?? '';

        const valid = await verifyWechatSignature(token, signature, timestamp, body);
        if (!valid) {
            logger.warn('寰俊绛惧悕楠岃瘉澶辫触');
            return new Response('Invalid signature', {status: 403});
        }
    }

    let payload: WechatPushMessage;
    try {
        payload = JSON.parse(body) as WechatPushMessage;
    } catch {
        logger.error('寰俊娑堟伅 JSON 瑙ｆ瀽澶辫触', body);
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
        logger.debug('璺宠繃杩囨湡寰俊娑堟伅', {expiredCount, thresholdSeconds: MESSAGE_EXPIRE_SECONDS});
    }

    if (activeMessages.length === 0) {
        return new Response(JSON.stringify({success: true, skipped: true, reason: 'expired'}), {
            status: 200,
            headers: {'Content-Type': 'application/json'},
        });
    }

    // 鍒嗗彂鍒拌矾鐢憋紙閫愭潯澶勭悊鎵归噺娑堟伅锛?
    const {routeMessage, toReplyArray} = await import('../bot/index.js');
    const replyTasks: Array<{ message: IncomingMessage; reply: ReplyMessage }> = [];

    for (const message of activeMessages) {
        console.log('澶勭悊寰俊娑堟伅', { routeMessage, toReplyArray, message });
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

    // 浼樺厛浣跨敤绫诲瀷鍖?API 瀹㈡埛绔紙闇€閰嶇疆 base URL锛?
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

    // 鍚屾椂鍦ㄥ搷搴斾綋涓繑鍥炲洖澶?
    const replyPayloads = replyTasks.map((task) =>
        buildWechatReply(task.reply, task.message.from, task.message.room?.id),
    );
    const responseBody = replyPayloads.length === 1 ? replyPayloads[0] : replyPayloads;
    return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
    });
}

