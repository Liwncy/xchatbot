import type {ApiResponse} from './api-types.js';
import type {WechatApi} from './api.js';

export interface WechatChatRecordUploadedImage {
    /** 原图 CDN URL（对应 cdndataurl）。 */
    fileId: string;
    /** 原图 AES Key（对应 cdndatakey）。 */
    aesKey: string;
    /** 缩略图 CDN URL（对应 cdnthumburl），可能与 fileId 相同。 */
    thumbFileId: string;
    /** 缩略图 AES Key（对应 cdnthumbkey），可能与 aesKey 相同。 */
    thumbAesKey: string;
    /** 图片大小（字节），可能为 0。 */
    dataSize: number;
    /** 图片 MD5。 */
    md5: string;
    /** 缩略图 MD5。 */
    thumbMd5: string;
}

export interface UploadWechatChatRecordImageInput {
    imageUrl?: string;
    imageBase64?: string;
}

export interface BuildWechatChatRecordImageDataDescInput {
    /** 原图 CDN URL（cdndataurl）。 */
    fileId: string;
    /** 原图 AES Key（cdndatakey）。 */
    aesKey: string;
    /** 缩略图 CDN URL（cdnthumburl），默认同 fileId。 */
    thumbFileId?: string;
    /** 缩略图 AES Key（cdnthumbkey），默认同 aesKey。 */
    thumbAesKey?: string;
    md5?: string;
    thumbMd5?: string;
    dataSize?: number;
    width?: number;
    height?: number;
}

function pickString(source: unknown, keys: string[]): string {
    if (!source || typeof source !== 'object') return '';
    const data = source as Record<string, unknown>;
    for (const key of keys) {
        const value = data[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
}

function resolveImageUploadMeta(response: ApiResponse<unknown>): WechatChatRecordUploadedImage {
    const root = response as unknown as Record<string, unknown>;
    const data = (root.data && typeof root.data === 'object') ? root.data as Record<string, unknown> : null;
    const src = data ?? root;

    // 原图字段：优先匹配真实聊天记录里的 cdndataurl/cdndatakey
    const fileId = pickString(src, ['cdndataurl', 'file_id', 'fileId', 'id', 'cdnmidimgurl']);
    const aesKey = pickString(src, ['cdndatakey', 'aes_key', 'aesKey', 'key', 'cdnthumbaeskey', 'cdnmidimgaeskey']);

    if (!fileId || !aesKey) {
        throw new Error(`cdnUploadImage missing file_id/aes_key, response=${JSON.stringify(response).slice(0, 300)}`);
    }

    // 缩略图字段：若无则 fallback 到原图字段
    const thumbFileId = pickString(src, ['cdnthumburl', 'thumb_file_id', 'thumbFileId']) || fileId;
    const thumbAesKey = pickString(src, ['cdnthumbkey', 'thumb_aes_key', 'thumbAesKey']) || aesKey;
    const dataSize = Number(pickString(src, ['datasize', 'data_size', 'size', 'length'])) || 0;
    const md5 = pickString(src, ['fullmd5', 'md5', 'full_md5']);
    const thumbMd5 = pickString(src, ['thumbfullmd5', 'thumb_md5', 'thumbMd5']) || md5;

    return {fileId, aesKey, thumbFileId, thumbAesKey, dataSize, md5, thumbMd5};
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export interface WechatChatRecordImageFields {
    cdndataurl: string;
    cdndatakey: string;
    cdnthumburl: string;
    cdnthumbkey: string;
    fullmd5: string;
    thumbfullmd5: string;
    datasize: number;
    width: number;
    height: number;
}

export function buildWechatChatRecordImageFields(input: BuildWechatChatRecordImageDataDescInput): WechatChatRecordImageFields {
    return {
        cdndataurl: input.fileId.trim(),
        cdndatakey: input.aesKey.trim(),
        cdnthumburl: (input.thumbFileId ?? input.fileId).trim(),
        cdnthumbkey: (input.thumbAesKey ?? input.aesKey).trim(),
        fullmd5: input.md5?.trim() ?? '',
        thumbfullmd5: input.thumbMd5?.trim() ?? input.md5?.trim() ?? '',
        datasize: Number.isFinite(input.dataSize) ? Math.max(0, Math.floor(Number(input.dataSize))) : 0,
        width: Number.isFinite(input.width) ? Math.max(0, Math.floor(Number(input.width))) : 0,
        height: Number.isFinite(input.height) ? Math.max(0, Math.floor(Number(input.height))) : 0,
    };
}

/** @deprecated 使用 buildWechatChatRecordImageFields 代替 */
export function buildWechatChatRecordImageDataDesc(input: BuildWechatChatRecordImageDataDescInput): string {
    const f = buildWechatChatRecordImageFields(input);
    return `<img cdnmidimgurl="${escapeXml(f.cdndataurl)}" aeskey="${escapeXml(f.cdndatakey)}" cdnthumbaeskey="${escapeXml(f.cdnthumbkey)}" cdnthumburl="${escapeXml(f.cdnthumburl)}" cdnmidimgaeskey="${escapeXml(f.cdndatakey)}" md5="${escapeXml(f.fullmd5)}" length="${f.datasize}" hevc_mid_size="0" hdlength="0" tpurl="" tpmd5="" width="${f.width}" height="${f.height}"/>`;
}

/** 机器人自身 wxid，仅用于 CDN 上传，不会实际投递消息给任何人。 */
const WECHAT_SELF_WXID = 'wxid_ahl9az25aljx22';

export class WechatChatRecordImageTool {
    static async uploadImage(api: WechatApi, input: UploadWechatChatRecordImageInput): Promise<WechatChatRecordUploadedImage> {
        const imageUrl = input.imageUrl?.trim() ?? '';
        const imageBase64 = input.imageBase64?.trim() ?? '';
        if (!imageUrl && !imageBase64) {
            throw new Error('uploadImage requires imageUrl or imageBase64');
        }

        const result = imageUrl
            ? await api.cdnUploadImage({receiver: WECHAT_SELF_WXID, image_url: imageUrl})
            : await api.cdnUploadImage({receiver: WECHAT_SELF_WXID, image: imageBase64});

        if (typeof result.code === 'number' && result.code !== 0) {
            throw new Error(`cdnUploadImage failed: code=${result.code}, message=${result.message || ''}`);
        }

        return resolveImageUploadMeta(result);
    }

    static buildImageDataDesc(input: BuildWechatChatRecordImageDataDescInput): string {
        return buildWechatChatRecordImageDataDesc(input);
    }
}
