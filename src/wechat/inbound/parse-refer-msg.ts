import type {IncomingMessage} from '../../types/message.js';

export interface ParsedWechatReferMessage {
    title: string;
    referType: number;
    referContent: string;
    referFrom?: string;
    referSenderName?: string;
    imageMeta?: NonNullable<IncomingMessage['quote']>['imageMeta'];
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

    const parsed: ParsedWechatReferMessage = {
        title,
        referType,
        referContent,
        ...extractReferSender(refermsg),
    };
    if (referType === 3) {
        parsed.imageMeta = extractImageMetaFromXml(referContent);
    }
    return parsed;
}
