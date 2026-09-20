import type {QuoteMessageId, QuoteRef} from '../../core/message.js';
import {decodeXmlDeep, parseQuoteMedia} from './parse-media.js';

function stripGroupPrefix(content: string): string {
    const separatorIndex = content.indexOf(':\n');
    if (separatorIndex <= 0) return content;
    return content.slice(separatorIndex + 2);
}

function pickXmlTagValue(xml: string, tag: string): string | undefined {
    const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
    return match?.[1]?.trim() || undefined;
}

function parseReferNumericTextTag(refermsg: string, tags: string[]): string | undefined {
    for (const tag of tags) {
        const raw = pickXmlTagValue(refermsg, tag);
        if (raw && /^\d+$/.test(raw)) return raw;
    }
    return undefined;
}

function parseReferNumericTag(refermsg: string, tags: string[]): number | undefined {
    const text = parseReferNumericTextTag(refermsg, tags);
    if (!text) return undefined;
    const parsed = Number.parseInt(text, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function extractClientIdTextFromMsgsource(msgsource: string): string | undefined {
    const normalized = decodeXmlDeep(msgsource).trim();
    if (!normalized) return undefined;
    const attrMatch = normalized.match(/clientmsgid="(\d+)"/i)
        ?? normalized.match(/client_msgid="(\d+)"/i);
    if (attrMatch?.[1]) return attrMatch[1];
    const tagMatch = normalized.match(/<clientmsgid>(\d+)<\/clientmsgid>/i)
        ?? normalized.match(/<client_msgid>(\d+)<\/client_msgid>/i);
    return tagMatch?.[1];
}

function extractReferMessageId(refermsg: string): QuoteMessageId | undefined {
    const newIdText = parseReferNumericTextTag(refermsg, ['svrid', 'newmsgid', 'new_id']);
    const newId = parseReferNumericTag(refermsg, ['svrid', 'newmsgid', 'new_id']);
    const createTimeRaw = parseReferNumericTag(refermsg, ['createtime', 'create_time']);
    const clientIdTextFromTag = parseReferNumericTextTag(refermsg, ['msgid', 'frommsgid', 'client_id', 'clientid']);
    const clientIdFromTag = parseReferNumericTag(refermsg, ['msgid', 'frommsgid', 'client_id', 'clientid']);
    const msgsource = pickXmlTagValue(refermsg, 'msgsource') ?? '';
    const clientIdTextFromSource = extractClientIdTextFromMsgsource(msgsource);
    const clientIdFromSource = clientIdTextFromSource ? Number.parseInt(clientIdTextFromSource, 10) : undefined;

    if (!newIdText || newId == null || createTimeRaw == null) return undefined;

    return {
        newId,
        newIdText,
        clientId: clientIdFromTag ?? clientIdFromSource,
        clientIdText: clientIdTextFromTag ?? clientIdTextFromSource,
        createTime: createTimeRaw > 1_000_000_000_000 ? Math.floor(createTimeRaw / 1000) : createTimeRaw,
    };
}

export function parseWechatReferMessage(rawContent: string): QuoteRef | null {
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
    const referContent = decodeXmlDeep(pickXmlTagValue(refermsg, 'content') ?? '');
    const fromusr = pickXmlTagValue(refermsg, 'fromusr');
    const chatusr = pickXmlTagValue(refermsg, 'chatusr');
    const referSenderName = pickXmlTagValue(refermsg, 'displayname');
    const referFrom =
        (chatusr && !chatusr.endsWith('@chatroom') ? chatusr : undefined)
        || (fromusr && !fromusr.endsWith('@chatroom') ? fromusr : undefined);
    const referMessageId = extractReferMessageId(refermsg);
    const media = Number.isFinite(referType)
        ? parseQuoteMedia(referType, referContent, referType === 47 ? decodeXmlDeep(refermsg) : undefined)
        : undefined;

    return {
        title,
        referType,
        referContent,
        ...(referFrom ? {referFrom} : {}),
        ...(referSenderName ? {referSenderName} : {}),
        ...(referMessageId ? {referMessageId} : {}),
        ...(media ? {media} : {}),
    };
}
