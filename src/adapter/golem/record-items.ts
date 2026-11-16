import type {ChatRecordImageItem, ChatRecordItem} from '../../core/reply.js';
import {logger} from '../../utils/logger.js';
import type {GolemApi} from './api.js';
import {defaultSummary, formatShanghaiTime, imageFormat, pseudoHex} from './chat-record.js';
import type {RecordItem, RecordMedia, SendRecordParams} from './types.js';

const DATATYPE_TEXT = 1;
const DATATYPE_IMAGE = 2;
const DEFAULT_TITLE = '群聊的聊天记录';

function firstNonBlank(...values: Array<string | undefined>): string {
    for (const value of values) {
        const text = value?.trim();
        if (text) return text;
    }
    return '';
}

/** 图片先落到 CDN，聊天记录只认已有资源；传不上去就返回 undefined，由调用方降级。 */
async function resolveImageMedia(api: GolemApi, item: ChatRecordImageItem): Promise<RecordMedia | undefined> {
    const url = item.url.trim();
    if (!/^https?:\/\//iu.test(url)) return undefined;
    try {
        const uploaded = await api.uploadRecordImage(url);
        return uploaded ? {format: imageFormat(url), ...uploaded.media} : undefined;
    } catch (error) {
        logger.warn('聊天记录图片上传失败', {
            error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
    }
}

function itemBase(item: ChatRecordItem, index: number, identity: string): RecordItem {
    const timestampMs = item.timestampMs > 0 ? item.timestampMs : Date.now();
    const nickname = item.nickname.trim();
    const avatarUrl = item.avatarUrl?.trim() ?? '';
    const sourceTime = formatShanghaiTime(timestampMs);
    const sourceMsgId = String(timestampMs);
    const localId = index + 1;
    const dataId = pseudoHex(`${nickname}|${identity}|${sourceTime}|${sourceMsgId}|${localId}`, 32);
    return {
        data_id: dataId,
        html_id: dataId,
        source_name: nickname,
        source_head_url: avatarUrl,
        source_time: sourceTime,
        local_id: localId,
        create_time: Math.floor(timestampMs / 1000),
        new_msg_id: sourceMsgId,
        source: {hash_username: pseudoHex(`${nickname}|${avatarUrl}|${sourceMsgId}`, 64)},
    };
}

function textRecordItem(item: ChatRecordItem, index: number, content: string): RecordItem {
    return {...itemBase(item, index, content), datatype: DATATYPE_TEXT, description: content};
}

/** 把我们的聊天记录条目变成 Golem 的记录条目；没昵称或没内容的条目丢掉。 */
export async function buildRecordItems(api: GolemApi, items: ChatRecordItem[]): Promise<RecordItem[]> {
    const records: RecordItem[] = [];
    for (const item of items) {
        if (!item.nickname.trim()) continue;
        if (item.type !== 'image') {
            const content = item.content.trim();
            if (content) records.push(textRecordItem(item, records.length, content));
            continue;
        }
        const media = await resolveImageMedia(api, item);
        if (!media) {
            records.push(textRecordItem(item, records.length, item.alt?.trim() || '[图片]'));
            continue;
        }
        records.push({
            ...itemBase(item, records.length, item.url),
            datatype: DATATYPE_IMAGE,
            description: item.alt?.trim() || '图片',
            media,
        });
    }
    return records;
}

export async function buildSendRecordParams(
    api: GolemApi,
    receiver: string,
    reply: {items: ChatRecordItem[]; title?: string; summary?: string; desc?: string},
): Promise<SendRecordParams | null> {
    const items = await buildRecordItems(api, reply.items);
    if (items.length === 0) return null;
    return {
        receiver,
        title: firstNonBlank(reply.title, DEFAULT_TITLE),
        description: firstNonBlank(reply.summary, reply.desc, defaultSummary(
            reply.items.filter((item) => item.nickname.trim() && (item.type === 'image' || item.content.trim())),
        )),
        from_scene: 0,
        is_chat_room: false,
        items,
    };
}
