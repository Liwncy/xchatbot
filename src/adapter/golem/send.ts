import type {Env} from '../../types/env.js';
import type {IncomingMessage} from '../../core/message.js';
import {linkReply, textReply, type ReplyMessage} from '../../core/reply.js';
import {recordOutboundChatMessage} from '../../core/chat-log/index.js';
import {resolveChatId} from '../../core/context.js';
import {logger} from '../../utils/logger.js';
import type {ApiResponse} from './types.js';
import type {SendReceipt} from '../types.js';
import {GolemApi} from './api.js';
import {buildChatRecordXml, CHAT_RECORD_APP_TYPE} from './chat-record.js';
import {buildMusicAppXml} from './music-xml.js';
import {encodeAudioUrlToSilk} from '../../utils/silk/index.js';

const FAIL_COPY: Record<Exclude<ReplyMessage['type'], 'text'>, string> = {
    image: '图没发出去',
    emoji: '表情没发出去',
    link: '卡片没发出去',
    video: '视频没发出去',
    voice: '语音没发出去',
    music: '歌没发出去',
    app: '这条没发出去',
    card: '名片没发出去',
    position: '位置没发出去',
    forward: '转发没发出去',
    'chat-record': '这张卡没发出去',
};

const DEFAULT_THUMB_JPEG = Uint8Array.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x03, 0xFF, 0xC4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
    0x7F, 0xFF, 0xD9,
]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

export function extractGolemRevoke(data: unknown): SendReceipt['revoke'] {
    const root = asRecord(data);
    if (!root) return undefined;
    const list = Array.isArray(root.list) ? root.list[0] : undefined;
    const first = asRecord(list) ?? root;
    const newId = first.new_id ?? first.newId ?? first.id;
    if (newId == null || String(newId).trim() === '') return undefined;
    const clientId = first.client_id ?? first.clientId;
    const createTime = first.create_time ?? first.createTime;
    return {
        newId: String(newId),
        clientId: clientId == null ? undefined : String(clientId),
        createTime: typeof createTime === 'number'
            ? createTime
            : Number(createTime) || undefined,
    };
}

function looksLikeHttp(value?: string): value is string {
    const lower = value?.trim().toLowerCase() ?? '';
    return lower.startsWith('http://') || lower.startsWith('https://');
}

/** 微信点名要在 @群名 后跟 U+2005，普通空格只是字，点不醒对方。 */
function withMentionSpacer(content: string, mentions?: string[]): string {
    if (!mentions?.length) return content;
    return content.replace(/^([@＠][^\s@＠\u2005]+)[ \t]+/u, '$1\u2005');
}

async function sendNative(api: GolemApi, receiver: string, reply: ReplyMessage, env: Env): Promise<ApiResponse> {
    switch (reply.type) {
        case 'text':
            return api.sendText({
                receiver,
                content: withMentionSpacer(reply.content, reply.mentions),
                remind: reply.mentions?.length ? reply.mentions.join(',') : undefined,
            });
        case 'image':
            return api.sendImage({receiver, imageUrl: reply.url});
        case 'emoji':
            return api.sendEmoji({receiver, md5: reply.md5, emojiUrl: reply.url});
        case 'link':
            return api.sendLink({
                receiver,
                title: reply.title,
                desc: reply.desc,
                url: reply.url,
                thumbUrl: reply.thumbUrl,
            });
        case 'video':
            return api.sendVideo({
                receiver,
                videoUrl: reply.url,
                thumbUrl: reply.thumbUrl,
                thumb: reply.thumbUrl ? undefined : new Blob([DEFAULT_THUMB_JPEG], {type: 'image/jpeg'}),
                duration: reply.duration && reply.duration > 0 ? reply.duration : 10,
            });
        case 'voice': {
            try {
                const parts = await encodeAudioUrlToSilk(reply.url, env);
                if (!parts.length) return {code: -1, message: 'silk encode failed'};
                let last: ApiResponse = {code: -1, message: 'silk encode failed'};
                for (const [index, silk] of parts.entries()) {
                    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 250));
                    last = await api.sendVoice({
                        receiver,
                        voice: silk.blob,
                        duration: silk.durationMs,
                        format: silk.format,
                    });
                }
                return last.code === 0 ? last : {...last, code: 0};
            } catch (error) {
                logger.warn('Golem 语音转 silk 失败，降级成链接', {
                    url: reply.url,
                    error: error instanceof Error ? error.message : String(error),
                });
                return {code: -1, message: 'silk encode failed'};
            }
        }
        case 'music': {
            if (looksLikeHttp(reply.dataUrl)) {
                const music = buildMusicAppXml({
                    title: reply.title,
                    singer: reply.singer,
                    url: reply.url,
                    dataUrl: reply.dataUrl,
                    thumbUrl: reply.thumbUrl,
                });
                return api.sendApp({receiver, appType: music.appType, xml: music.xml});
            }
            const url = looksLikeHttp(reply.url) ? reply.url : reply.dataUrl;
            if (!looksLikeHttp(url)) {
                return {code: -1, message: 'music missing url'};
            }
            return api.sendLink({
                receiver,
                title: reply.title || '音乐',
                desc: reply.singer,
                url: url ?? '',
                thumbUrl: reply.thumbUrl,
            });
        }
        case 'app':
            return api.sendApp({receiver, appType: reply.appType, xml: reply.xml});
        case 'chat-record':
            return api.sendApp({
                receiver,
                appType: CHAT_RECORD_APP_TYPE,
                xml: buildChatRecordXml(reply.items, reply.title, reply.summary, reply.desc),
            });
        case 'card':
            return api.sendCard({
                receiver,
                username: reply.username,
                nickname: reply.nickname,
                alias: reply.alias,
            });
        case 'position':
            return api.sendPosition({
                receiver,
                lat: reply.lat,
                lon: reply.lon,
                label: reply.label,
                poiName: reply.poiName,
                scale: reply.scale,
            });
        case 'forward':
            return api.sendForward({
                receiver,
                xml: reply.xml,
                forwardType: reply.forwardType,
            });
    }
}

function degrade(reply: ReplyMessage): ReplyMessage | null {
    switch (reply.type) {
        case 'image':
            return looksLikeHttp(reply.url) ? linkReply('图片', reply.url, '点开看看') : null;
        case 'video':
            return looksLikeHttp(reply.url) ? linkReply('视频', reply.url, '点开看看', reply.thumbUrl) : null;
        case 'voice':
            return looksLikeHttp(reply.url) ? linkReply('语音', reply.url, '点开听听') : null;
        case 'emoji':
            return null;
        case 'music': {
            const url = (reply.url && looksLikeHttp(reply.url)) ? reply.url : reply.dataUrl;
            if (url && looksLikeHttp(url)) {
                return linkReply(reply.title || '音乐', url, reply.singer, reply.thumbUrl);
            }
            return null;
        }
        default:
            return null;
    }
}

async function sendOne(api: GolemApi, receiver: string, reply: ReplyMessage, env: Env): Promise<ApiResponse> {
    const first = await sendNative(api, receiver, reply, env);
    if (first.code === 0) return first;
    // 语音文件已经递进 Golem 后再补链接，会变成「气泡 + 卡片」两条。
    if (reply.type === 'voice' && first.message !== 'silk encode failed') return first;
    const next = degrade(reply);
    if (!next) return first;
    logger.warn('Golem 降级发送', {from: reply.type, to: next.type});
    return sendNative(api, receiver, next, env);
}

function toReceipt(result: ApiResponse): SendReceipt {
    const revoke = extractGolemRevoke(result.data);
    return {
        ok: result.code === 0,
        outboundId: revoke?.newId,
        revoke,
        data: result.data,
    };
}

async function recordOne(
    env: Env,
    message: IncomingMessage,
    reply: ReplyMessage,
    receipt: SendReceipt,
    replyIndex: number,
    receiver: string,
): Promise<void> {
    await recordOutboundChatMessage(env, message, reply, {
        causedByMessageId: message.messageId,
        replyIndex,
        replyStatus: receipt.ok ? 'sent' : 'failed',
        payload: {
            ...(receipt.data != null ? {golem: receipt.data} : {}),
            ...(receipt.revoke?.newId
                ? {
                    wechat_revoke: {
                        receiver,
                        new_id: receipt.revoke.newId,
                        client_id: receipt.revoke.clientId,
                        create_time: receipt.revoke.createTime,
                    },
                }
                : {}),
        },
    });
}

export async function sendGolemReplies(
    apiBaseUrl: string,
    message: IncomingMessage,
    replies: ReplyMessage[],
    env: Env,
): Promise<SendReceipt[]> {
    const api = new GolemApi(apiBaseUrl);
    const receiver = resolveChatId(message);
    const receipts: SendReceipt[] = [];
    let replyIndex = 0;

    for (const reply of replies) {
        const target = reply.to ?? receiver;
        let receipt: SendReceipt;
        try {
            const result = await sendOne(api, target, reply, env);
            receipt = toReceipt(result);
            if (!receipt.ok) {
                logger.error('Golem 发送失败', {
                    type: reply.type,
                    receiver: target,
                    code: result.code,
                    message: result.message,
                });
            }
        } catch (error) {
            logger.error('Golem 发送异常', {
                type: reply.type,
                receiver: target,
                error: error instanceof Error ? error.message : String(error),
            });
            receipt = {ok: false};
        }

        await recordOne(env, message, reply, receipt, replyIndex, target);
        receipts.push(receipt);
        replyIndex += 1;

        if (receipt.ok || reply.type === 'text' || reply.type === 'emoji') continue;

        const fallback = textReply(FAIL_COPY[reply.type]);
        try {
            const result = await api.sendText({receiver: target, content: fallback.content});
            const fallbackReceipt = toReceipt(result);
            await recordOne(env, message, fallback, fallbackReceipt, replyIndex, target);
            receipts.push(fallbackReceipt);
            replyIndex += 1;
        } catch (error) {
            logger.error('Golem 失败提示也没发出去', {
                receiver: target,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return receipts;
}
