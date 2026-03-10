import type { TextMessage } from './types.js';
import { logger } from '../utils/logger.js';

/** TheCatAPI 响应条目的预期结构。 */
interface CatApiItem {
  url: string;
}

/** 将 ArrayBuffer 转换为 Base64 编码字符串。 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(parts.join(''));
}

/**
 * 🐱 猫咪图片插件。
 *
 * 当文本包含"看看猫咪"时，从 TheCatAPI 获取随机猫咪图片并以图片消息回复。
 */
export const catImagePlugin: TextMessage = {
  type: 'text',
  name: 'cat-image',
  description: '发送"看看猫咪"获取随机猫咪图片',

  match: (content) => content.includes('看看猫咪'),

  handle: async (_message, _env) => {
    try {
      const apiRes = await fetch('https://api.thecatapi.com/v1/images/search');
      if (!apiRes.ok) {
        logger.error('猫咪图片 API 请求失败', { status: apiRes.status });
        return null;
      }

      const data = (await apiRes.json()) as CatApiItem[];
      const imageUrl = data?.[0]?.url;

      if (!imageUrl) {
        logger.error('猫咪图片 API 返回数据中没有图片 URL');
        return null;
      }

      // 下载图片并编码为 Base64
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        logger.error('猫咪图片下载失败', { url: imageUrl, status: imageRes.status });
        return null;
      }

      const buffer = await imageRes.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);

      return { type: 'image', mediaId: base64 };
    } catch (err) {
      logger.error('获取猫咪图片时发生异常', err);
      return null;
    }
  },
};
