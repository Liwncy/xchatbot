import {WechatApi} from '../wechat/api.js';
import type {UploadImageResponse} from '../wechat/api-types.js';
import {logger} from './logger.js';

/** 机器人自身的 wxid，用于 CDN 上传时作为 receiver（仅上传，不对外发送）。 */
const BOT_SELF_WXID = 'wxid_ahl9az25aljx22';

export interface WechatImageUploadResult {
    fileId: string;
    aesKey: string;
}

export interface WechatImageUploadOptions {
    /** 图片文件或 base64 字符串。与 imageUrl 二选一。 */
    image?: Blob | string;
    /** 图片 URL。与 image 二选一。 */
    imageUrl?: string;
}

const DEFAULT_FILE_ACCESS_PREFIX = 'https://file.upfile.live/';
const DEFAULT_GET_UPLOAD_LINK_URL = 'https://upfile.live/api/file/getUploadLink/';

interface UploadLinkPayload {
    upload_url?: string;
    file_key?: string;
}

interface UploadLinkResponse {
    data?: UploadLinkPayload;
}

export interface UploadFileOptions {
    fileName?: string;
    contentType?: string;
    vipCode?: string;
    getUploadLinkUrl?: string;
    fileAccessPrefix?: string;
}

function normalizeBase64(value: string): string {
    const trimmed = value.trim();
    const dataUrlMatch = trimmed.match(/^data:[^;]+;base64,(.+)$/i);
    return dataUrlMatch?.[1]?.trim() || trimmed;
}

function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(normalizeBase64(base64));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function toBlob(data: ArrayBuffer | Uint8Array | Blob | string, contentType: string): Blob {
    if (typeof data === 'string') {
        return new Blob([base64ToUint8Array(data)], {type: contentType});
    }
    if (data instanceof Blob) return data;
    if (data instanceof Uint8Array) return new Blob([data], {type: contentType});
    return new Blob([new Uint8Array(data)], {type: contentType});
}

export class FileUploader {
    static async upload(data: ArrayBuffer | Uint8Array | Blob | string, options?: UploadFileOptions): Promise<string | null> {
        const fileName = options?.fileName?.trim() || 'upload.jpg';
        const contentType = options?.contentType?.trim() || 'image/jpeg';
        const vipCode = options?.vipCode?.trim() || '';
        const getUploadLinkUrl = options?.getUploadLinkUrl?.trim() || DEFAULT_GET_UPLOAD_LINK_URL;
        const fileAccessPrefix = options?.fileAccessPrefix?.trim() || DEFAULT_FILE_ACCESS_PREFIX;

        try {
            const form = new URLSearchParams();
            form.set('vipCode', vipCode);
            form.set('file_name', fileName);

            const linkResponse = await fetch(getUploadLinkUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    Accept: 'application/json, text/plain, */*',
                },
                body: form.toString(),
            });
            if (!linkResponse.ok) {
                logger.warn('获取上传链接失败', {status: linkResponse.status, getUploadLinkUrl});
                return null;
            }

            const payload = (await linkResponse.json()) as UploadLinkResponse;
            const uploadUrl = payload.data?.upload_url?.trim() || '';
            const fileKey = payload.data?.file_key?.trim() || '';
            if (!uploadUrl || !fileKey) {
                logger.warn('上传链接返回缺少必要字段', {payload});
                return null;
            }

            const fileBlob = toBlob(data, contentType);
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': contentType,
                },
                body: fileBlob,
            });
            if (!uploadResponse.ok) {
                logger.warn('文件上传失败', {
                    status: uploadResponse.status,
                    body: await uploadResponse.text(),
                });
                return null;
            }

            const fileUrl = new URL(fileKey, fileAccessPrefix).toString();
            logger.info('文件上传成功', {fileUrl, fileName});
            return fileUrl;
        } catch (error) {
            logger.error('文件上传异常', {
                fileName,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    static async uploadBase64(base64: string, options?: UploadFileOptions): Promise<string | null> {
        return this.upload(base64, options);
    }
}

/**
 * 微信 CDN 图片上传工具。
 *
 * 调用 /api/cdn/upload/image 接口，将图片上传至微信 CDN，
 * receiver 固定为机器人自身 wxid（仅做上传，不对外发送），
 * 返回 fileId 和 aesKey 供后续构造消息使用。
 */
export class WechatImageUploader {
    private readonly api: WechatApi;

    constructor(apiBaseUrl: string) {
        this.api = new WechatApi(apiBaseUrl);
    }

    /**
     * 上传图片至微信 CDN。
     * @returns fileId 和 aesKey，失败时返回 null。
     */
    async uploadImage(options: WechatImageUploadOptions): Promise<WechatImageUploadResult | null> {
        try {
            const resp = await this.api.cdnUploadImage({
                receiver: BOT_SELF_WXID,
                image: options.image,
                image_url: options.imageUrl,
            });

            if (resp.code !== 0) {
                logger.warn('微信 CDN 图片上传失败', {code: resp.code, message: resp.message});
                return null;
            }

            const data = resp.data as UploadImageResponse | undefined;
            const fileId = data?.file_id?.trim() ?? '';
            const aesKey = data?.aes_key?.trim() ?? '';

            if (!fileId || !aesKey) {
                logger.warn('微信 CDN 图片上传返回缺少必要字段', {data});
                return null;
            }

            logger.info('微信 CDN 图片上传成功', {fileId});
            return {fileId, aesKey};
        } catch (error) {
            logger.error('微信 CDN 图片上传异常', {
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }
}

