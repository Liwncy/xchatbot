import type {AppReply} from '../types/message.js';
import {buildWechatChatRecordImageFields} from './chat-record-image.js';
import type {WechatChatRecordUploadedImage} from './chat-record-image.js';

const DEFAULT_RECORD_TITLE = '群聊的聊天记录';
const DEFAULT_APP_TYPE = 19;

export interface WechatChatRecordItem {
    /** 项类型。默认 text。 */
    kind?: 'text' | 'image';
    /** 展示昵称。 */
    nickname: string;
    /** 文本内容。image 类型可省略。 */
    content?: string;
    /** 头像 URL，可选。 */
    avatarUrl?: string;
    /** 消息时间戳（毫秒）。省略时取当前时间。 */
    timestampMs?: number;
    /** 源消息 ID。省略时使用时间戳。 */
    messageId?: string | number;
    /** 本地消息 ID。 */
    localId?: string | number;
    /** dataid/htmlid。省略时自动生成。 */
    dataId?: string;
    /** dataitemsource.hashusername。省略时自动生成。 */
    hashUsername?: string;
    /** image 类型专用：cdnUploadImage 的完整返回数据。 */
    uploadedImage?: WechatChatRecordUploadedImage;
    /** image 类型专用：图片 CDN URL（cdndataurl）。优先使用 uploadedImage。 */
    imageFileId?: string;
    /** image 类型专用：图片 AES Key（cdndatakey）。优先使用 uploadedImage。 */
    imageAesKey?: string;
    /** @deprecated 不再使用 */
    imageDataDesc?: string;
}

export interface BuildWechatChatRecordOptions {
    /** 外层卡片标题。 */
    title?: string;
    /** 外层卡片摘要。 */
    summary?: string;
    /** 详情页描述。 */
    desc?: string;
    /** 详情记录项。 */
    items: WechatChatRecordItem[];
    /** 外层 fromusername。 */
    fromUsername?: string;
    /** 是否群聊记录。默认 false。 */
    isChatRoom?: boolean;
    /** scene，默认 0。 */
    scene?: number;
    /** extcommoninfo.media_expire_at，默认当前时间 + 14 天。 */
    mediaExpireAt?: number;
    /** appinfo.appname，默认空。 */
    appName?: string;
}

export interface BuildSingleWechatChatRecordOptions {
    /** 聊天记录发送者昵称。 */
    nickname: string;
    /** 文本内容。 */
    content: string;
    /** 头像 URL。 */
    avatarUrl?: string;
    /** 外层摘要中希望显示的 @昵称。 */
    mentionNickname?: string;
    /** 消息时间戳（毫秒）。 */
    timestampMs?: number;
    /** 自定义标题。 */
    title?: string;
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function normalizeTimestampMs(value?: number): number {
    if (!Number.isFinite(value) || Number(value) <= 0) {
        return Date.now();
    }
    const numeric = Number(value);
    return numeric > 1_000_000_000_000 ? Math.floor(numeric) : Math.floor(numeric * 1000);
}

function formatWechatRecordTime(timestampMs: number): string {
    const date = new Date(timestampMs);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
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

function buildDefaultRecordSummary(items: WechatChatRecordItem[]): string {
    return items
        .slice(0, 4)
        .map((item) => {
            const kind = item.kind ?? 'text';
            const content = item.content?.trim() ?? '';
            return `${item.nickname.trim()}: ${content || (kind === 'image' ? '[图片]' : '[消息]')}`;
        })
        .join('\n');
}

function buildImageFields(item: WechatChatRecordItem) {
    // 优先使用 uploadedImage（包含完整字段）
    if (item.uploadedImage) {
        return buildWechatChatRecordImageFields({
            fileId: item.uploadedImage.fileId,
            aesKey: item.uploadedImage.aesKey,
            thumbFileId: item.uploadedImage.thumbFileId,
            thumbAesKey: item.uploadedImage.thumbAesKey,
            md5: item.uploadedImage.md5,
            thumbMd5: item.uploadedImage.thumbMd5,
            dataSize: item.uploadedImage.dataSize,
        });
    }
    // 兼容旧字段
    const fileId = item.imageFileId?.trim() ?? '';
    const aesKey = item.imageAesKey?.trim() ?? '';
    if (!fileId || !aesKey) {
        throw new Error('image item requires uploadedImage or imageFileId + imageAesKey');
    }
    return buildWechatChatRecordImageFields({fileId, aesKey});
}

function buildRecordDataItem(item: WechatChatRecordItem, index: number): string {
    const timestampMs = normalizeTimestampMs(item.timestampMs);
    const sourceMsgId = String(item.messageId ?? timestampMs);
    const localId = String(item.localId ?? (index + 1));
    const kind = item.kind ?? 'text';
    const nickname = escapeXml(item.nickname.trim());
    const plainContent = item.content ?? '';
    const content = escapeXml(plainContent);
    const avatarUrl = escapeXml(item.avatarUrl?.trim() ?? '');
    const sourceTime = formatWechatRecordTime(timestampMs);
    const dataSeed = `${nickname}|${content}|${sourceTime}|${sourceMsgId}|${localId}`;
    const dataId = escapeXml(item.dataId?.trim() || pseudoHex(dataSeed, 32));
    const hashUsername = escapeXml(item.hashUsername?.trim() || pseudoHex(`${nickname}|${avatarUrl}|${sourceMsgId}`, 64));

    if (kind === 'image') {
        const f = buildImageFields(item);
        return "<dataitem datatype=\"2\" dataid=\"" + dataId + "\" htmlid=\"" + dataId + "\">\n"
            + "<datafmt>jpg</datafmt>\n"
            + "<sourcename>" + nickname + "</sourcename>\n"
            + "<sourceheadurl>" + avatarUrl + "</sourceheadurl>\n"
            + "<sourcetime>" + sourceTime + "</sourcetime>\n"
            + "<thumbsize>0</thumbsize>\n"
            + "<cdndataurl>" + escapeXml(f.cdndataurl) + "</cdndataurl>\n"
            + "<cdndatakey>" + escapeXml(f.cdndatakey) + "</cdndatakey>\n"
            + "<filetype>1</filetype>\n"
            + "<thumbfiletype>1</thumbfiletype>\n"
            + "<cdnthumburl>" + escapeXml(f.cdnthumburl) + "</cdnthumburl>\n"
            + "<cdnthumbkey>" + escapeXml(f.cdnthumbkey) + "</cdnthumbkey>\n"
            + "<fullmd5>" + escapeXml(f.fullmd5) + "</fullmd5>\n"
            + "<thumbfullmd5>" + escapeXml(f.thumbfullmd5) + "</thumbfullmd5>\n"
            + "<datasize>" + f.datasize + "</datasize>\n"
            + "<srcMsgLocalid>" + localId + "</srcMsgLocalid>\n"
            + "<srcMsgCreateTime>" + Math.floor(timestampMs / 1000) + "</srcMsgCreateTime>\n"
            + "<fromnewmsgid>" + sourceMsgId + "</fromnewmsgid>\n"
            + "<dataitemsource>\n"
            + "<hashusername>" + hashUsername + "</hashusername>\n"
            + "</dataitemsource>\n"
            + "</dataitem>";
    }

    return "<dataitem datatype=\"1\" dataid=\"" + dataId + "\" htmlid=\"" + dataId + "\">\n"
        + "<sourcename>" + nickname + "</sourcename>\n"
        + "<sourceheadurl>" + avatarUrl + "</sourceheadurl>\n"
        + "<sourcetime>" + sourceTime + "</sourcetime>\n"
        + "<datadesc>" + content + "</datadesc>\n"
        + "<srcMsgLocalid>" + localId + "</srcMsgLocalid>\n"
        + "<srcMsgCreateTime>" + Math.floor(timestampMs / 1000) + "</srcMsgCreateTime>\n"
        + "<fromnewmsgid>" + sourceMsgId + "</fromnewmsgid>\n"
        + "<dataitemsource>\n"
        + "<hashusername>" + hashUsername + "</hashusername>\n"
        + "</dataitemsource>\n"
        + "</dataitem>";
}

export function buildWechatChatRecordAppXml(options: BuildWechatChatRecordOptions): string {
    const items = options.items.filter((item) => {
        const nickname = item.nickname.trim();
        if (!nickname) return false;
        const kind = item.kind ?? 'text';
        if (kind === 'image') {
            return Boolean(
                item.uploadedImage ||
                item.imageDataDesc?.trim() ||
                (item.imageFileId?.trim() && item.imageAesKey?.trim())
            );
        }
        return Boolean(item.content?.trim());
    });
    if (items.length === 0) {
        throw new Error('buildWechatChatRecordAppXml requires at least one non-empty item');
    }

    const summaryText = options.summary?.trim() || buildDefaultRecordSummary(items);
    const descText = options.desc?.trim() || summaryText;
    const title = escapeXml(options.title?.trim() || DEFAULT_RECORD_TITLE);
    const summary = escapeXml(summaryText);
    const desc = escapeXml(descText);
    const favCreateTimeSeconds = Math.floor(normalizeTimestampMs(items[items.length - 1]?.timestampMs) / 1000);
    const isChatRoom = options.isChatRoom ? 1 : 0;
    const dataItemsXml = items.map((item, index) => buildRecordDataItem(item, index)).join('\n');
    const recordInfoXml = "<recordinfo>\n"
        + "<fromscene>0</fromscene>\n"
        + "<favcreatetime>" + favCreateTimeSeconds + "</favcreatetime>\n"
        + "<isChatRoom>" + isChatRoom + "</isChatRoom>\n"
        + "<title>" + title + "</title>\n"
        + "<desc>" + desc + "</desc>\n"
        + "<datalist count=\"" + items.length + "\">\n"
        + dataItemsXml + "\n"
        + "</datalist>\n"
        + "</recordinfo>";

    return "<appmsg appid=\"\" sdkver=\"0\">\n"
        + "<title>" + title + "</title>\n"
        + "<des>" + summary + "</des>\n"
        + "<action/>\n"
        + "<type>" + DEFAULT_APP_TYPE + "</type>\n"
        + "<showtype>0</showtype>\n"
        + "<soundtype>0</soundtype>\n"
        + "<mediatagname/>\n"
        + "<messageext/>\n"
        + "<messageaction/>\n"
        + "<content/>\n"
        + "<contentattr>0</contentattr>\n"
        + "<url/>\n"
        + "<lowurl/>\n"
        + "<dataurl/>\n"
        + "<lowdataurl/>\n"
        + "<songalbumurl/>\n"
        + "<songlyric/>\n"
        + "<template_id/>\n"
        + "<appattach>\n"
        + "<totallen>0</totallen>\n"
        + "<attachid/>\n"
        + "<emoticonmd5></emoticonmd5>\n"
        + "<fileext/>\n"
        + "<aeskey></aeskey>\n"
        + "</appattach>\n"
        + "<extinfo/>\n"
        + "<sourceusername/>\n"
        + "<sourcedisplayname/>\n"
        + "<thumburl/>\n"
        + "<md5/>\n"
        + "<statextstr/>\n"
        + "<recorditem><![CDATA[" + recordInfoXml + "]]></recorditem>\n"
        + "</appmsg>";
}

export function buildWechatChatRecordAppReply(
    options: BuildWechatChatRecordOptions,
    extras?: Pick<AppReply, 'to' | 'mentions'>,
): AppReply {
    return {
        type: 'app',
        appType: DEFAULT_APP_TYPE,
        appXml: buildWechatChatRecordAppXml(options),
        ...extras,
    };
}

export function buildSingleWechatChatRecordAppReply(
    options: BuildSingleWechatChatRecordOptions,
    extras?: Pick<AppReply, 'to' | 'mentions'>,
): AppReply {
    const title = options.title?.trim() || DEFAULT_RECORD_TITLE;
    const nickname = options.nickname.trim();
    const content = options.content;
    const mentionText = options.mentionNickname?.trim();

    return buildWechatChatRecordAppReply({
        title,
        summary: mentionText ? `@${mentionText} ${content}` : `${nickname}: ${content}`,
        desc: `${nickname}: ${content}`,
        items: [
            {
                nickname,
                content,
                avatarUrl: options.avatarUrl,
                timestampMs: options.timestampMs,
            },
        ],
    }, extras);
}


