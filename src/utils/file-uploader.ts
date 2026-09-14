import {logger} from './logger.js';

const DEFAULT_FILE_ACCESS_PREFIX = 'https://file.upfile.live/';
const DEFAULT_GET_UPLOAD_LINK_URL = 'https://upfile.live/api/file/getUploadLink/';

interface UploadLinkResponse {
    data?: {
        upload_url?: string;
        file_key?: string;
    };
}

export interface UploadFileOptions {
    fileName?: string;
    contentType?: string;
}

function toBlob(data: ArrayBuffer | Uint8Array | Blob, contentType: string): Blob {
    if (data instanceof Blob) return data;
    if (data instanceof Uint8Array) return new Blob([data], {type: contentType});
    return new Blob([new Uint8Array(data)], {type: contentType});
}

export class FileUploader {
    static async upload(
        data: ArrayBuffer | Uint8Array | Blob,
        options?: UploadFileOptions,
    ): Promise<string | null> {
        const fileName = options?.fileName?.trim() || 'upload.jpg';
        const contentType = options?.contentType?.trim() || 'image/jpeg';

        try {
            const form = new URLSearchParams();
            form.set('vipCode', '');
            form.set('file_name', fileName);

            const linkResponse = await fetch(DEFAULT_GET_UPLOAD_LINK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    Accept: 'application/json, text/plain, */*',
                },
                body: form.toString(),
            });
            if (!linkResponse.ok) {
                logger.warn('获取上传链接失败', {status: linkResponse.status});
                return null;
            }

            const payload = (await linkResponse.json()) as UploadLinkResponse;
            const uploadUrl = payload.data?.upload_url?.trim() || '';
            const fileKey = payload.data?.file_key?.trim() || '';
            if (!uploadUrl || !fileKey) {
                logger.warn('上传链接返回缺少必要字段');
                return null;
            }

            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {'Content-Type': contentType},
                body: toBlob(data, contentType),
            });
            if (!uploadResponse.ok) {
                logger.warn('文件上传失败', {status: uploadResponse.status});
                return null;
            }

            return new URL(fileKey, DEFAULT_FILE_ACCESS_PREFIX).toString();
        } catch (error) {
            logger.error('文件上传异常', {
                fileName,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }
}
