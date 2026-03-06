import type { TextMessage } from './types.js';

/** Expected shape of TheCatAPI response items. */
interface CatApiItem {
  url: string;
}

/** Convert an ArrayBuffer to a Base64-encoded string. */
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
 * 🐱 Cat-image plugin.
 *
 * When the incoming text contains "看看猫咪", fetches a random cat photo
 * from TheCatAPI and replies with an image message.
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
        return { type: 'text', content: '抱歉，暂时无法获取猫咪图片，请稍后再试。' };
      }

      const data = (await apiRes.json()) as CatApiItem[];
      const imageUrl = data?.[0]?.url;

      if (!imageUrl) {
        return { type: 'text', content: '抱歉，暂时无法获取猫咪图片，请稍后再试。' };
      }

      // Download the actual image bytes and encode as Base64
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        return { type: 'text', content: '猫咪图片下载失败，请稍后再试。' };
      }

      const buffer = await imageRes.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);

      return { type: 'image', mediaId: base64 };
    } catch {
      return { type: 'text', content: '获取猫咪图片失败，请稍后再试。' };
    }
  },
};
