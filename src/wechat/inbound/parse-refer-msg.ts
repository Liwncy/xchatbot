import type {IncomingMessage} from '../../types/message.js';
import {parseWechatEmojiFromContent} from './parse-emoji.js';

export interface ParsedWechatReferMessage {
    title: string;
    referType: number;
    referContent: string;
    referFrom?: string;
    referSenderName?: string;
    imageMeta?: NonNullable<IncomingMessage['quote']>['imageMeta'];
    videoMeta?: NonNullable<IncomingMessage['quote']>['videoMeta'];
    voiceMeta?: NonNullable<IncomingMessage['quote']>['voiceMeta'];
    emojiMeta?: NonNullable<IncomingMessage['quote']>['emojiMeta'];
    mediaHint?: NonNullable<IncomingMessage['quote']>['mediaHint'];
    referMessageId?: NonNullable<IncomingMessage['quote']>['referMessageId'];
}

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function stripGroupPrefix(content: string): string {
    const separatorIndex = content.indexOf(':\n');
    if (separatorIndex <= 0) return content;
    return content.slice(separatorIndex + 2);
}

function pickXmlTagValue(xml: string, tag: string): string | undefined {
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
    const match = xml.match(regex);
    return match?.[1]?.trim() || undefined;
}

function pickXmlAttr(xml: string, attr: string): string | undefined {
    const regex = new RegExp(`${attr}="([^"]+)"`, 'i');
    const match = xml.match(regex);
    return match?.[1]?.trim() || undefined;
}

function pickXmlAttrInt(xml: string, attr: string): number | undefined {
    const raw = pickXmlAttr(xml, attr);
    if (!raw) return undefined;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeUnixSeconds(value: number): number {
    if (!Number.isFinite(value)) return Math.floor(Date.now() / 1000);
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
}

function parseReferNumericTag(refermsg: string, tags: string[]): number | undefined {
    for (const tag of tags) {
        const raw = pickXmlTagValue(refermsg, tag);
        if (!raw) continue;
        const parsed = Number.parseInt(raw, 10);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

function parseReferNumericTextTag(refermsg: string, tags: string[]): string | undefined {
    for (const tag of tags) {
        const raw = pickXmlTagValue(refermsg, tag);
        if (raw && /^\d+$/.test(raw)) return raw;
    }
    return undefined;
}

function extractClientIdTextFromMsgsource(msgsource: string): string | undefined {
    const normalized = decodeHtmlEntities(msgsource).trim();
    if (!normalized) return undefined;

    const attrMatch = normalized.match(/clientmsgid="(\d+)"/i)
        ?? normalized.match(/client_msgid="(\d+)"/i);
    if (attrMatch?.[1]) {
        return attrMatch[1];
    }

    const tagMatch = normalized.match(/<clientmsgid>(\d+)<\/clientmsgid>/i)
        ?? normalized.match(/<client_msgid>(\d+)<\/client_msgid>/i);
    if (tagMatch?.[1]) {
        return tagMatch[1];
    }

    return undefined;
}

function extractReferMessageId(refermsg: string): ParsedWechatReferMessage['referMessageId'] | undefined {
    const newIdText = parseReferNumericTextTag(refermsg, ['svrid', 'newmsgid', 'new_id']);
    const newId = parseReferNumericTag(refermsg, ['svrid', 'newmsgid', 'new_id']);
    const createTimeRaw = parseReferNumericTag(refermsg, ['createtime', 'create_time']);
    const clientIdTextFromTag = parseReferNumericTextTag(refermsg, ['msgid', 'frommsgid', 'client_id', 'clientid']);
    const clientIdFromTag = parseReferNumericTag(refermsg, ['msgid', 'frommsgid', 'client_id', 'clientid']);
    const msgsource = pickXmlTagValue(refermsg, 'msgsource') ?? '';
    const clientIdTextFromSource = extractClientIdTextFromMsgsource(msgsource);
    const clientIdFromSource = clientIdTextFromSource ? Number.parseInt(clientIdTextFromSource, 10) : undefined;

    if (!newIdText || newId == null || createTimeRaw == null) {
        return undefined;
    }

    return {
        newId,
        newIdText,
        clientId: clientIdFromTag ?? clientIdFromSource,
        clientIdText: clientIdTextFromTag ?? clientIdTextFromSource,
        createTime: normalizeUnixSeconds(createTimeRaw),
    };
}

function extractReferSender(refermsg: string): Pick<ParsedWechatReferMessage, 'referFrom' | 'referSenderName'> {
    const fromusr = pickXmlTagValue(refermsg, 'fromusr');
    const chatusr = pickXmlTagValue(refermsg, 'chatusr');
    const referSenderName = pickXmlTagValue(refermsg, 'displayname');

    const referFrom =
        (chatusr && !chatusr.endsWith('@chatroom') ? chatusr : undefined) ||
        (fromusr && !fromusr.endsWith('@chatroom') ? fromusr : undefined);

    return {
        ...(referFrom ? {referFrom} : {}),
        ...(referSenderName ? {referSenderName} : {}),
    };
}

function extractImageMetaFromXml(xml: string): ParsedWechatReferMessage['imageMeta'] | undefined {
    const imgXml = stripGroupPrefix(xml).trim();
    if (!imgXml.includes('<img')) return undefined;

    const fileAesKey = pickXmlAttr(imgXml, 'aeskey');
    const fileId =
        pickXmlAttr(imgXml, 'cdnbigimgurl') ||
        pickXmlAttr(imgXml, 'cdnmidimgurl') ||
        pickXmlAttr(imgXml, 'cdnthumburl');

    if (!fileAesKey || !fileId) return undefined;
    return {fileId, fileAesKey};
}

/** 从 videomsg XML 解析 CDN 下载所需的 fileId/aesKey（含封面）。 */
export function parseWechatVideoMetaFromXml(
    xml: string,
): ParsedWechatReferMessage['videoMeta'] | undefined {
    const videoXml = stripGroupPrefix(xml).trim();
    if (!videoXml.includes('<videomsg') && !videoXml.includes('<video')) return undefined;

    const fileAesKey =
        pickXmlAttr(videoXml, 'aeskey') ||
        pickXmlAttr(videoXml, 'cdnvideokey') ||
        pickXmlAttr(videoXml, 'cdndatakey');
    const fileId =
        pickXmlAttr(videoXml, 'cdnvideourl') ||
        pickXmlAttr(videoXml, 'cdndataurl') ||
        pickXmlAttr(videoXml, 'cdnurl');
    const thumbFileId = pickXmlAttr(videoXml, 'cdnthumburl');
    const thumbAesKey =
        pickXmlAttr(videoXml, 'cdnthumbkey') ||
        pickXmlAttr(videoXml, 'cdnthumbaeskey');
    const duration = Number.parseInt(
        pickXmlAttr(videoXml, 'playlength') ||
        pickXmlAttr(videoXml, 'duration') ||
        '',
        10,
    );

    if (!fileAesKey || !fileId) return undefined;
    return {
        fileId,
        fileAesKey,
        ...(thumbFileId ? {thumbFileId} : {}),
        ...(thumbAesKey ? {thumbAesKey} : {}),
        ...(Number.isFinite(duration) && duration > 0 ? {duration} : {}),
    };
}

function extractVideoMetaFromXml(xml: string): ParsedWechatReferMessage['videoMeta'] | undefined {
    return parseWechatVideoMetaFromXml(xml);
}

function extractVoiceMetaFromXml(
    refermsg: string,
    referContent: string,
    referMessageId?: ParsedWechatReferMessage['referMessageId'],
): ParsedWechatReferMessage['voiceMeta'] | undefined {
    const voiceXml = stripGroupPrefix(referContent).trim();
    const source = `${refermsg}\n${voiceXml}`;
    if (!source.includes('<voicemsg') && !source.includes('<voice')) return undefined;

    const id =
        parseReferNumericTag(refermsg, ['msgid', 'frommsgid', 'client_id', 'clientid']) ??
        referMessageId?.clientId ??
        referMessageId?.newId;
    const newId = referMessageId?.newId ?? parseReferNumericTag(refermsg, ['svrid', 'newmsgid', 'new_id']);
    const bufferId =
        pickXmlAttrInt(voiceXml, 'bufid') ??
        pickXmlAttrInt(voiceXml, 'bufferid') ??
        pickXmlAttrInt(voiceXml, 'buffer_id') ??
        parseReferNumericTag(source, ['bufid', 'bufferid', 'buffer_id', 'voiceid']);
    const length =
        pickXmlAttrInt(voiceXml, 'length') ??
        pickXmlAttrInt(voiceXml, 'voicelength') ??
        parseReferNumericTag(source, ['voicelength', 'length', 'size']);
    const duration =
        pickXmlAttrInt(voiceXml, 'voicelength') ??
        pickXmlAttrInt(voiceXml, 'playlength') ??
        pickXmlAttrInt(voiceXml, 'duration') ??
        parseReferNumericTag(source, ['playlength', 'duration']);
    const format = pickXmlAttrInt(voiceXml, 'voiceformat');
    const voiceUrl = pickXmlAttr(voiceXml, 'voiceurl');
    const voiceAesKey = pickXmlAttr(voiceXml, 'aeskey');

    if (id == null || newId == null || bufferId == null || length == null || length <= 0) return undefined;
    return {
        id,
        newId,
        bufferId,
        length,
        ...(duration != null && duration > 0 ? {duration} : {}),
        ...(format != null ? {format} : {}),
        ...(voiceUrl ? {voiceUrl: decodeHtmlEntities(voiceUrl)} : {}),
        ...(voiceAesKey ? {voiceAesKey} : {}),
    };
}

function buildReferMediaHint(args: {
    title: string;
    referType: number;
    referContent: string;
    imageMeta?: ParsedWechatReferMessage['imageMeta'];
    videoMeta?: ParsedWechatReferMessage['videoMeta'];
    voiceMeta?: ParsedWechatReferMessage['voiceMeta'];
    emojiMeta?: ParsedWechatReferMessage['emojiMeta'];
}): ParsedWechatReferMessage['mediaHint'] | undefined {
    const mediaHint: NonNullable<ParsedWechatReferMessage['mediaHint']> = {};
    const content = args.referContent.trim();

    if (args.referType === 3 && args.imageMeta) {
        mediaHint.mediaId = args.imageMeta.fileId;
        mediaHint.originalUrl = args.imageMeta.fileId;
    }

    if (args.referType === 43 && args.videoMeta) {
        mediaHint.mediaId = args.videoMeta.fileId;
        mediaHint.originalUrl = args.videoMeta.fileId;
        mediaHint.thumbUrl = args.videoMeta.thumbFileId;
        mediaHint.duration = args.videoMeta.duration;
    }

    if (args.referType === 34 && args.voiceMeta) {
        mediaHint.originalUrl = args.voiceMeta.voiceUrl;
        mediaHint.duration = args.voiceMeta.duration;
        mediaHint.format = args.voiceMeta.format;
    }

    if (args.referType === 47 && args.emojiMeta) {
        mediaHint.emojiUrl = args.emojiMeta.cdnurl;
        mediaHint.md5 = args.emojiMeta.md5;
    }

    if (args.referType === 49) {
        const title = decodeHtmlEntities(pickXmlTagValue(content, 'title') || args.title).trim();
        const url = decodeHtmlEntities(pickXmlTagValue(content, 'url') || '').trim();
        const description = decodeHtmlEntities(pickXmlTagValue(content, 'des') || '').trim();
        const thumbUrl = decodeHtmlEntities(pickXmlTagValue(content, 'thumburl') || '').trim();
        if (title) mediaHint.title = title;
        if (url) mediaHint.url = url;
        if (description) mediaHint.description = description;
        if (thumbUrl) mediaHint.thumbUrl = thumbUrl;
    }

    return Object.values(mediaHint).some((value) => value != null && value !== '')
        ? mediaHint
        : undefined;
}

/**
 * 解析微信 type 49 引用消息（appmsg type 57）。
 * 若引用内容为图片（refermsg type 3），提取 CDN 下载参数。
 */
export function parseWechatReferMessage(rawContent: string): ParsedWechatReferMessage | null {
    const xml = stripGroupPrefix(rawContent).trim();
    const appmsgMatch = xml.match(/<appmsg[\s\S]*?<\/appmsg>/i);
    if (!appmsgMatch) return null;

    const appmsg = appmsgMatch[0];
    const appMsgType = Number.parseInt(pickXmlTagValue(appmsg, 'type') ?? '', 10);
    if (appMsgType !== 57) return null;

    const title = pickXmlTagValue(appmsg, 'title') ?? '';
    const refermsgMatch = appmsg.match(/<refermsg[\s\S]*?<\/refermsg>/i);
    if (!refermsgMatch) return null;

    const refermsg = refermsgMatch[0];
    const referType = Number.parseInt(pickXmlTagValue(refermsg, 'type') ?? '', 10);
    const referContent = decodeHtmlEntities(pickXmlTagValue(refermsg, 'content') ?? '');

    const referMessageId = extractReferMessageId(refermsg);
    const parsed: ParsedWechatReferMessage = {
        title,
        referType,
        referContent,
        ...extractReferSender(refermsg),
        referMessageId,
    };
    if (referType === 3) {
        parsed.imageMeta = extractImageMetaFromXml(referContent);
    }
    if (referType === 43) {
        parsed.videoMeta = extractVideoMetaFromXml(referContent);
    }
    if (referType === 34) {
        parsed.voiceMeta = extractVoiceMetaFromXml(refermsg, referContent, referMessageId);
    }
    if (referType === 47) {
        const emojiMeta = parseWechatEmojiFromContent(referContent);
        if (emojiMeta) {
            parsed.emojiMeta = emojiMeta;
        }
    }
    parsed.mediaHint = buildReferMediaHint({
        title,
        referType,
        referContent,
        imageMeta: parsed.imageMeta,
        videoMeta: parsed.videoMeta,
        voiceMeta: parsed.voiceMeta,
        emojiMeta: parsed.emojiMeta,
    });
    return parsed;
}
