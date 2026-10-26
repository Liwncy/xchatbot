import type {Env} from '../../types/env.js';
import type {IncomingMessage} from '../../core/message.js';
import {linkReply, textReply, type ChatRecordItem, type ReplyMessage} from '../../core/reply.js';
import {recordOutboundChatMessage} from '../../core/chat-log/index.js';
import {logger} from '../../utils/logger.js';
import type {ApiResponse} from './types.js';
import type {SendOptions, SendReceipt} from '../types.js';
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

const SAME_TARGET_SEND_INTERVAL_MS = 350;

function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function scalarText(value: unknown): string | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
    if (typeof value === 'string' && value.trim()) return value.trim();
    const wrapped = asRecord(value);
    if (wrapped && 'value' in wrapped) return scalarText(wrapped.value);
    return undefined;
}

export function extractGolemRevoke(data: unknown): SendReceipt['revoke'] {
    const root = asRecord(data);
    if (!root) return undefined;
    const items = Array.isArray(root.list) ? root.list : Array.isArray(root.result) ? root.result : undefined;
    const first = asRecord(items?.[0]) ?? root;
    const newId = scalarText(first.new_id ?? first.newId ?? first.id);
    if (!newId) return undefined;
    const createTimeRaw = first.create_time ?? first.createTime;
    const createTime = typeof createTimeRaw === 'number'
        ? createTimeRaw
        : Number(scalarText(createTimeRaw)) || undefined;
    return {
        newId,
        clientId: scalarText(first.client_id ?? first.clientId),
        createTime,
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

async function uploadRecordImages(api: GolemApi, items: ChatRecordItem[]): Promise<ChatRecordItem[]> {
    const next: ChatRecordItem[] = [];
    for (const item of items) {
        if (item.type !== 'image' || !/^https?:\/\//iu.test(item.url.trim())) {
            next.push(item);
            continue;
        }
        try {
            const uploaded = await api.uploadRecordImage(item.url.trim());
            next.push(uploaded ? {...item, url: uploaded.fileId, aesKey: uploaded.aesKey} : item);
        } catch (error) {
            logger.warn('聊天记录图片上传失败', {
                error: error instanceof Error ? error.message : String(error),
            });
            next.push(item);
        }
    }
    return next;
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
                duration: reply.duration && reply.duration > 0 ? reply.duration : undefined,
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
                xml: buildChatRecordXml(
                    await uploadRecordImages(api, reply.items),
                    reply.title,
                    reply.summary,
                    reply.desc,
                ),
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
    options?: SendOptions,
): Promise<SendReceipt[]> {
    const api = new GolemApi(apiBaseUrl);
    const receiver = message.chatId;
    const receipts: SendReceipt[] = [];
    let replyIndex = 0;
    let previousTarget: string | undefined;

    for (const reply of replies) {
        const target = reply.to ?? receiver;
        if (target === previousTarget) {
            // Golem 的 client_id 按秒生成；同一会话同秒连发会被微信当成重复消息。
            await wait(SAME_TARGET_SEND_INTERVAL_MS);
        }
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
        previousTarget = target;
        replyIndex += 1;

        if (
            receipt.ok
            || reply.type === 'text'
            || reply.type === 'emoji'
            || options?.failureNotice === false
        ) continue;

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
