import type {HandlerResponse} from '../../../types/reply.js';
import type {AgnesGeneratedImage} from './client.js';

export function buildImageReply(image: AgnesGeneratedImage): HandlerResponse {
    if (image.url) {
        return {
            type: 'image',
            mediaId: image.url,
            originalUrl: image.url,
        };
    }

    if (image.base64) {
        return {
            type: 'image',
            mediaId: image.base64,
        };
    }

    return {
        type: 'text',
        content: '图是生成了，但格式有点怪，换种说法试试？',
    };
}
