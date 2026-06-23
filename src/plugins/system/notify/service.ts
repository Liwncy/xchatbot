import {NO_PERMISSION_REPLY} from '../../../constants/messages.js';
import type {Env} from '../../../types/env.js';
import type {IncomingMessage} from '../../../types/message.js';
import {WechatApi} from '../../../wechat';
import {resolveImageDataFromMeta} from '../../cognitive/intent-image/recognize.js';
import {parseWechatEmojiFromContent} from '../../../wechat/inbound/parse-emoji.js';
import {logger} from '../../../utils/logger.js';
import {ChatLogRepository, resolveChatSession} from '../../../chat-log/index.js';
import {parseWechatRevokeFromPayload} from '../../../chat-log/revoke-meta.js';

export const NOTIFY_HELP_COMMAND = '通知帮助';
export const NOTIFY_COMMAND_PREFIX = '通知';
const NOTIFY_COMMAND_PATTERN = /^(?:通知|\/nt)(?:\s+|[:：]\s*|$)/iu;
const NOTIFY_HELP_PATTERN = /^(?:通知帮助|\/nt\s+(?:help|帮助))$/iu;

type NotifyPayload =
    | {type: 'text'; content: string}
    | {type: 'quote'; quote: NonNullable<IncomingMessage['quote']>};

export interface NotifyCommand {
    receivers: string[];
    payload: NotifyPayload;
}

function ensureOwner(messageFrom: string, ownerWxid?: string): string | null {
    const owner = ownerWxid?.trim() ?? '';
    if (!owner) return '这个我还不能听你的';
    if (messageFrom.trim() !== owner) return NO_PERMISSION_REPLY;
    return null;
}

function normalizeCommandContent(content: string): string {
    const trimmed = content.trim();
    if (NOTIFY_HELP_PATTERN.test(trimmed)) return NOTIFY_HELP_COMMAND;
    return trimmed.replace(NOTIFY_COMMAND_PATTERN, (matched) => {
        const needsSpace = /\s/u.test(matched) || /[:：]/u.test(matched);
        return needsSpace ? `${NOTIFY_COMMAND_PREFIX} ` : NOTIFY_COMMAND_PREFIX;
    });
}

function resolveQuotedText(message: IncomingMessage): string {
    const quote = message.quote;
    if (!quote) return '';
    return quote.referContent?.trim()
        || quote.title.trim();
}

function pickXmlTagValue(xml: string, tag: string): string {
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
    return regex.exec(xml)?.[1]?.trim() ?? '';
}

function pickXmlAttr(xml: string, attr: string): string {
    const regex = new RegExp(`${attr}="([^"]+)"`, 'i');
    return regex.exec(xml)?.[1]?.trim() ?? '';
}

function decodeXmlEntities(value: string): string {
    return value
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&amp;/gi, '&');
}

function parseQuotedLink(quote: NonNullable<IncomingMessage['quote']>): {
    title: string;
    url: string;
    desc: string;
    thumbUrl: string;
} | null {
    const content = quote.referContent?.trim() ?? '';
    if (!content.includes('<appmsg') && !content.includes('<url>')) return null;

    const title = decodeXmlEntities(pickXmlTagValue(content, 'title') || quote.title).trim();
    const url = decodeXmlEntities(pickXmlTagValue(content, 'url')).trim();
    const desc = decodeXmlEntities(pickXmlTagValue(content, 'des')).trim();
    const thumbUrl = decodeXmlEntities(pickXmlTagValue(content, 'thumburl')).trim();
    if (!url) return null;
    return {
        title: title || '链接',
        url,
        desc,
        thumbUrl,
    };
}

function inferVoiceFormatFromUrl(value: string): number {
    const normalized = value.toLowerCase();
    if (normalized.includes('.amr')) return 0;
    if (normalized.includes('.spx') || normalized.includes('.speex')) return 1;
    if (normalized.includes('.mp3')) return 2;
    if (normalized.includes('.wav')) return 3;
    return 4;
}

function looksLikeVoiceUrl(value: string): boolean {
    return /^https?:\/\//iu.test(value.trim())
        && /\.(?:silk|amr|spx|speex|mp3|wav)(?:[?#].*)?$/iu.test(value.trim());
}

function extractFirstHttpUrl(value: string): string {
    const matched = value.match(/https?:\/\/[^\s"'<>]+/iu);
    return matched?.[0]?.trim() ?? '';
}

function parseQuotedVoiceUrl(quote: NonNullable<IncomingMessage['quote']>): string {
    const content = quote.referContent?.trim() ?? '';
    const candidates = [
        decodeXmlEntities(pickXmlTagValue(content, 'url')).trim(),
        decodeXmlEntities(pickXmlTagValue(content, 'dataurl')).trim(),
        decodeXmlEntities(pickXmlTagValue(content, 'lowurl')).trim(),
        extractFirstHttpUrl(content),
        extractFirstHttpUrl(quote.title),
    ].filter(Boolean);

    return candidates.find(looksLikeVoiceUrl) ?? '';
}

function parseQuotedSilkFile(quote: NonNullable<IncomingMessage['quote']>): {
    appId?: string;
    attachId: string;
    size: number;
    username: string;
} | null {
    const content = quote.referContent?.trim() ?? '';
    if (!content.includes('<appattach') && !content.includes('<attachid')) return null;

    const fileExt = decodeXmlEntities(pickXmlTagValue(content, 'fileext')).trim().toLowerCase();
    const title = quote.title.trim().toLowerCase();
    if (fileExt !== 'silk' && !title.endsWith('.silk')) return null;

    const attachId = decodeXmlEntities(pickXmlTagValue(content, 'attachid')).trim();
    const size = Number.parseInt(pickXmlTagValue(content, 'totallen') || pickXmlTagValue(content, 'length') || '', 10);
    const appId = pickXmlAttr(content, 'appid') || pickXmlTagValue(content, 'appid') || undefined;
    const username = quote.referFrom?.trim() ?? '';
    if (!attachId || !Number.isFinite(size) || size <= 0 || !username) return null;

    return {
        ...(appId ? {appId} : {}),
        attachId,
        size,
        username,
    };
}

async function sendVoiceUrl(api: WechatApi, receiver: string, voiceUrl: string, duration = 5000): Promise<void> {
    ensureWechatApiSuccess(await api.sendVoice({
        receiver,
        voice_url: voiceUrl,
        duration,
        format: inferVoiceFormatFromUrl(voiceUrl),
    }));
}

async function sendSilkFile(api: WechatApi, receiver: string, file: NonNullable<ReturnType<typeof parseQuotedSilkFile>>): Promise<void> {
    const result = await api.downloadFile({
        app_id: file.appId,
        attach_id: file.attachId,
        size: file.size,
        chunk_size: file.size,
        offset: 0,
        username: file.username,
    });
    ensureWechatApiSuccess(result);
    const voice = bufferValueToBase64(result.data?.chunk);
    if (!voice) throw new Error('quoted silk file unavailable');
    ensureWechatApiSuccess(await api.sendVoice({
        receiver,
        voice,
        duration: 5000,
        format: 4,
    }));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

function bufferValueToBase64(value: unknown): string {
    const data = (value as {data?: unknown; buffer?: unknown})?.data
        ?? (value as {data?: unknown; buffer?: unknown})?.buffer;
    if (typeof data === 'string') return data.trim();
    if (Array.isArray(data)) {
        const bytes = new Uint8Array(data.map((item) => Number(item) & 0xff));
        return arrayBufferToBase64(bytes.buffer);
    }
    return '';
}

async function resolveVoiceDownloadIdsFromChatLog(message: IncomingMessage, env: Env): Promise<{
    id: number;
    newId: number;
} | null> {
    const referNewId = message.quote?.referMessageId?.newId;
    if (referNewId == null) return null;

    const session = resolveChatSession(message);
    const record = await ChatLogRepository.findRevokableOutboundByNewId(
        env.XBOT_DB,
        session.sessionId,
        referNewId,
    );
    if (!record) return null;
    const revoke = parseWechatRevokeFromPayload(record.payloadJson);
    if (!revoke) return null;
    return {
        id: revoke.client_id,
        newId: revoke.new_id,
    };
}

export function matchesNotifyCommand(content: string): boolean {
    const trimmed = normalizeCommandContent(content);
    return trimmed === NOTIFY_HELP_COMMAND
        || trimmed === NOTIFY_COMMAND_PREFIX
        || trimmed.startsWith(`${NOTIFY_COMMAND_PREFIX} `)
        || trimmed.startsWith(`${NOTIFY_COMMAND_PREFIX}\n`);
}

function splitReceivers(input: string): string[] {
    return Array.from(new Set(input
        .split(/[,，、;；\s]+/u)
        .map((item) => item.trim())
        .filter(Boolean)));
}

function parseInlineNotifyBody(body: string): NotifyCommand | null {
    const matched = body.match(/^(.+?)\s+([\s\S]+)$/u);
    const receiverText = matched?.[1]?.trim() ?? '';
    const content = matched?.[2]?.trim() ?? '';
    const receivers = splitReceivers(receiverText);
    if (receivers.length === 0 || !content) return null;
    return {receivers, payload: {type: 'text', content}};
}

function parseQuotedNotifyBody(body: string, message: IncomingMessage): NotifyCommand | null {
    const receivers = splitReceivers(body);
    const quote = message.quote;
    if (receivers.length === 0 || !quote) return null;
    return {receivers, payload: {type: 'quote', quote}};
}

export function parseNotifyCommand(content: string, message: IncomingMessage): NotifyCommand | null {
    const trimmed = normalizeCommandContent(content);
    if (!matchesNotifyCommand(trimmed) || trimmed === NOTIFY_HELP_COMMAND) return null;

    const body = trimmed.slice(NOTIFY_COMMAND_PREFIX.length).trim();
    if (!body) return null;

    return message.quote
        ? parseQuotedNotifyBody(body, message) ?? parseInlineNotifyBody(body)
        : parseInlineNotifyBody(body);
}

function ensureWechatApiSuccess(result: unknown): void {
    const code = (result as {code?: unknown})?.code;
    if (typeof code === 'number' && code !== 0) {
        throw new Error(`send failed: code=${code}`);
    }
}

async function sendNotifyPayload(
    api: WechatApi,
    env: Env,
    message: IncomingMessage,
    receiver: string,
    payload: NotifyPayload,
): Promise<void> {
    if (payload.type === 'text') {
        ensureWechatApiSuccess(await api.sendText({
            receiver,
            content: payload.content,
        }));
        return;
    }

    const quote = payload.quote;
    if (quote.imageMeta) {
        const image = await resolveImageDataFromMeta(quote.imageMeta, env);
        if (!image) throw new Error('quoted image unavailable');
        ensureWechatApiSuccess(await api.sendImage({
            receiver,
            image: image.kind === 'blob' ? image.value : image.value,
        }));
        return;
    }

    if (quote.videoMeta) {
        const videoRaw = await api.cdnDownloadChatVideoRaw({
            id: quote.videoMeta.fileId,
            key: quote.videoMeta.fileAesKey,
        });
        if (videoRaw.byteLength <= 0) throw new Error('quoted video unavailable');

        const thumbRaw = quote.videoMeta.thumbFileId && quote.videoMeta.thumbAesKey
            ? await api.cdnDownloadVideoCoverRaw({
                id: quote.videoMeta.thumbFileId,
                key: quote.videoMeta.thumbAesKey,
            })
            : null;

        ensureWechatApiSuccess(await api.sendVideo({
            receiver,
            video: arrayBufferToBase64(videoRaw),
            ...(thumbRaw && thumbRaw.byteLength > 0 ? {thumb: arrayBufferToBase64(thumbRaw)} : {}),
            duration: quote.videoMeta.duration ?? 1,
        }));
        return;
    }

    const quotedVoiceUrl = parseQuotedVoiceUrl(quote);
    if (quotedVoiceUrl) {
        await sendVoiceUrl(api, receiver, quotedVoiceUrl);
        return;
    }

    const quotedSilkFile = parseQuotedSilkFile(quote);
    if (quotedSilkFile) {
        await sendSilkFile(api, receiver, quotedSilkFile);
        return;
    }

    if (quote.voiceMeta) {
        if (quote.voiceMeta.voiceUrl) {
            try {
                ensureWechatApiSuccess(await api.sendVoice({
                    receiver,
                    voice_url: quote.voiceMeta.voiceUrl,
                    duration: quote.voiceMeta.duration ?? 1000,
                    format: quote.voiceMeta.format ?? 4,
                }));
                return;
            } catch (error) {
                logger.warn('通知引用语音直发 voiceurl 失败，尝试下载后转发', {
                    receiver,
                    hasVoiceUrl: true,
                    voiceFormat: quote.voiceMeta.format,
                    voiceDuration: quote.voiceMeta.duration,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        const trackedIds = await resolveVoiceDownloadIdsFromChatLog(message, env);
        const downloadId = trackedIds?.id ?? quote.voiceMeta.id;
        const downloadNewId = trackedIds?.newId ?? quote.voiceMeta.newId;
        const result = await api.downloadVoice({
            id: downloadId,
            new_id: downloadNewId,
            buffer_id: quote.voiceMeta.bufferId,
            length: quote.voiceMeta.length,
            group_id: message.room?.id ?? '',
        });
        ensureWechatApiSuccess(result);
        const voice = bufferValueToBase64(result.data?.data);
        if (!voice) throw new Error('quoted voice unavailable');
        ensureWechatApiSuccess(await api.sendVoice({
            receiver,
            voice,
            duration: result.data?.duration ?? quote.voiceMeta.duration ?? 1000,
            format: quote.voiceMeta.format ?? 4,
        }));
        return;
    }

    const emoji = quote.emojiMeta ?? parseWechatEmojiFromContent(quote.referContent ?? '');
    if (emoji?.md5 && emoji.cdnurl) {
        ensureWechatApiSuccess(await api.sendEmoji({
            receiver,
            md5: emoji.md5,
            emoji_url: emoji.cdnurl,
        }));
        return;
    }

    const link = parseQuotedLink(quote);
    if (link) {
        ensureWechatApiSuccess(await api.sendLink({
            receiver,
            url: link.url,
            title: link.title,
            desc: link.desc,
            thumb_url: link.thumbUrl,
        }));
        return;
    }

    const text = resolveQuotedText({quote} as IncomingMessage);
    if (!text) throw new Error('quoted content unavailable');
    ensureWechatApiSuccess(await api.sendText({
        receiver,
        content: text,
    }));
}

export async function sendNotifyMessage(message: IncomingMessage, env: Env, command: NotifyCommand): Promise<string> {
    const ownerErr = ensureOwner(message.from, env.BOT_OWNER_WECHAT_ID);
    if (ownerErr) return ownerErr;

    const apiBaseUrl = env.WECHAT_API_BASE_URL?.trim() ?? '';
    if (!apiBaseUrl) return '这会儿发不了，等一下';

    const api = new WechatApi(apiBaseUrl);
    let success = 0;
    let failed = 0;
    for (const receiver of command.receivers) {
        try {
            await sendNotifyPayload(api, env, message, receiver, command.payload);
            success += 1;
        } catch (error) {
            logger.warn('通知发送失败', {
                receiver,
                payloadType: command.payload.type,
                quoteType: command.payload.type === 'quote' ? command.payload.quote.referType : undefined,
                error: error instanceof Error ? error.message : String(error),
            });
            failed += 1;
        }
    }

    if (success === 0) return '没发成，再试下 🙏';
    if (failed > 0) return `发了 ${success} 个，还有 ${failed} 个没成 😅`;
    return command.receivers.length === 1 ? '发过去了 👌' : `都发过去了，${success} 个 👌`;
}

export function buildNotifyHelpText(): string {
    return [
        '帮你转一句：',
        '/nt wxid_xxx 晚点看群',
        '/nt wxid_a,wxid_b 晚点看群',
        '/nt 123456@chatroom 今晚八点集合',
        '',
        '也可以引用一条消息，再发：/nt wxid_a,wxid_b',
    ].join('\n');
}
