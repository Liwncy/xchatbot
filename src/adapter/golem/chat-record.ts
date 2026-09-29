import type {ChatRecordItem} from '../../core/reply.js';

export const CHAT_RECORD_APP_TYPE = 19;
const DEFAULT_TITLE = '群聊的聊天记录';
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function emitChatRecordLine(
    items: ChatRecordItem[],
    title?: string,
    summary?: string,
    desc?: string,
): string {
    return `app:${CHAT_RECORD_APP_TYPE} ${buildChatRecordXml(items, title, summary, desc)}`;
}

export function buildChatRecordXml(
    items: ChatRecordItem[],
    title?: string,
    summary?: string,
    desc?: string,
): string {
    const kept = items.filter((item) => item.nickname.trim() && (
        item.type === 'image' ? /^https?:\/\//iu.test(item.url.trim()) : item.content.trim()
    ));
    if (kept.length === 0) {
        throw new Error('chat record needs at least one item');
    }
    const summaryText = firstNonBlank(summary, defaultSummary(kept));
    const descText = firstNonBlank(desc, summaryText);
    const titleText = firstNonBlank(title, DEFAULT_TITLE);
    const last = kept[kept.length - 1];
    const favCreateTimeSeconds = Math.floor((last?.timestampMs ?? Date.now()) / 1000);
    const dataItems = kept.map((item, index) => buildDataItem(item, index)).join('\n');
    const recordInfo = `<recordinfo>
<fromscene>0</fromscene>
<favcreatetime>${favCreateTimeSeconds}</favcreatetime>
<isChatRoom>0</isChatRoom>
<title>${escapeXml(titleText)}</title>
<desc>${escapeXml(descText)}</desc>
<datalist count="${kept.length}">
${dataItems}
</datalist>
</recordinfo>`;
    const xml = `<appmsg appid="" sdkver="0">
<title>${escapeXml(titleText)}</title>
<des>${escapeXml(summaryText)}</des>
<action/>
<type>${CHAT_RECORD_APP_TYPE}</type>
<showtype>0</showtype>
<soundtype>0</soundtype>
<mediatagname/>
<messageext/>
<messageaction/>
<content/>
<contentattr>0</contentattr>
<url/>
<lowurl/>
<dataurl/>
<lowdataurl/>
<songalbumurl/>
<songlyric/>
<template_id/>
<appattach>
<totallen>0</totallen>
<attachid/>
<emoticonmd5></emoticonmd5>
<fileext/>
<aeskey></aeskey>
</appattach>
<extinfo/>
<sourceusername/>
<sourcedisplayname/>
<thumburl/>
<md5/>
<statextstr/>
<recorditem><![CDATA[${recordInfo}]]></recorditem>
</appmsg>`;
    return minifyXml(xml);
}

function buildDataItem(item: ChatRecordItem, index: number): string {
    return item.type === 'image'
        ? buildImageDataItem(item, index)
        : buildTextDataItem(item, index);
}

function itemIdentity(item: ChatRecordItem): string {
    return item.type === 'image' ? item.url : item.content;
}

function itemBase(item: ChatRecordItem, index: number): {
    timestampMs: number;
    nickname: string;
    avatarUrl: string;
    sourceTime: string;
    sourceMsgId: string;
    localId: string;
    dataId: string;
    hashUsername: string;
} {
    const timestampMs = item.timestampMs > 0 ? item.timestampMs : Date.now();
    const nickname = escapeXml(item.nickname.trim());
    const avatarUrl = escapeXml(item.avatarUrl?.trim() ?? '');
    const sourceTime = formatShanghaiTime(timestampMs);
    const sourceMsgId = String(timestampMs);
    const localId = String(index + 1);
    const dataId = escapeXml(pseudoHex(`${nickname}|${itemIdentity(item)}|${sourceTime}|${sourceMsgId}|${localId}`, 32));
    const hashUsername = escapeXml(pseudoHex(`${nickname}|${avatarUrl}|${sourceMsgId}`, 64));
    return {timestampMs, nickname, avatarUrl, sourceTime, sourceMsgId, localId, dataId, hashUsername};
}

function buildTextDataItem(item: Extract<ChatRecordItem, {type?: 'text'}>, index: number): string {
    const {timestampMs, nickname, avatarUrl, sourceTime, sourceMsgId, localId, dataId, hashUsername} =
        itemBase(item, index);
    const content = escapeXml(item.content);
    return `<dataitem datatype="1" dataid="${dataId}" htmlid="${dataId}">
<sourcename>${nickname}</sourcename>
<sourceheadurl>${avatarUrl}</sourceheadurl>
<sourcetime>${sourceTime}</sourcetime>
<datadesc>${content}</datadesc>
<srcMsgLocalid>${localId}</srcMsgLocalid>
<srcMsgCreateTime>${Math.floor(timestampMs / 1000)}</srcMsgCreateTime>
<fromnewmsgid>${sourceMsgId}</fromnewmsgid>
<dataitemsource>
<hashusername>${hashUsername}</hashusername>
</dataitemsource>
</dataitem>`;
}

function buildImageDataItem(item: Extract<ChatRecordItem, {type: 'image'}>, index: number): string {
    const {timestampMs, nickname, avatarUrl, sourceTime, sourceMsgId, localId, dataId, hashUsername} =
        itemBase(item, index);
    const url = escapeXml(item.url.trim());
    const description = escapeXml(item.alt?.trim() || '图片');
    const format = imageFormat(item.url);
    return `<dataitem datatype="2" dataid="${dataId}" htmlid="${dataId}">
<datafmt>${format}</datafmt>
<sourcename>${nickname}</sourcename>
<sourceheadurl>${avatarUrl}</sourceheadurl>
<sourcetime>${sourceTime}</sourcetime>
<datadesc>${description}</datadesc>
<cdndataurl>${url}</cdndataurl>
<cdndatakey></cdndatakey>
<cdnthumburl>${url}</cdnthumburl>
<cdnthumbkey></cdnthumbkey>
<cdnencryver>0</cdnencryver>
<srcMsgLocalid>${localId}</srcMsgLocalid>
<srcMsgCreateTime>${Math.floor(timestampMs / 1000)}</srcMsgCreateTime>
<fromnewmsgid>${sourceMsgId}</fromnewmsgid>
<dataitemsource>
<hashusername>${hashUsername}</hashusername>
</dataitemsource>
</dataitem>`;
}

function imageFormat(url: string): string {
    try {
        const extension = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/iu)?.[1]?.toLowerCase();
        if (extension === 'png' || extension === 'gif' || extension === 'webp') return extension;
    } catch {
        // 公网 URL 已在上层校验，格式识别失败时按 jpg 处理。
    }
    return 'jpg';
}

function defaultSummary(items: ChatRecordItem[]): string {
    return items
        .slice(0, 4)
        .map((item) => `${item.nickname.trim()}: ${item.type === 'image' ? '[图片]' : item.content.trim()}`)
        .join('\n');
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        .replace(/\r/g, '')
        .replace(/\n/g, '&#10;');
}

function minifyXml(xml: string): string {
    return xml.replace(/>\s+</gu, '><').trim();
}

function formatShanghaiTime(timestampMs: number): string {
    const shifted = new Date(timestampMs + SHANGHAI_OFFSET_MS);
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    const hours = String(shifted.getUTCHours()).padStart(2, '0');
    const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function firstNonBlank(value: string | undefined, fallback: string): string {
    const text = value?.trim() ?? '';
    return text || fallback;
}

function pseudoHex(input: string, length: number): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < input.length; i += 1) {
        const code = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ code, 0x01000193);
        h2 = Math.imul(h2 ^ (code + i + 1), 0x85ebca6b);
    }
    let output = '';
    while (output.length < length) {
        h1 = Math.imul(h1 ^ (h2 >>> 16), 0xc2b2ae35);
        h2 = Math.imul(h2 ^ (h1 >>> 13), 0x27d4eb2f);
        output += `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
    }
    return output.slice(0, length);
}
