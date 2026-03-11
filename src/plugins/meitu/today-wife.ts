import type { TextMessage } from '../types.js';
import { logger } from '../../utils/logger.js';
import { arrayBufferToBase64 } from '../../utils/binary.js';
import { mapToStableRange } from '../../utils/id.js';

const API_URL = 'https://api.pearktrue.cn/api/today_wife';
const MIN_ID = 10001;
const MAX_ID = 19999;

interface TodayWifeApiResponse {
  code: number;
  msg: string;
  data?: {
    image_url?: string;
    role_name?: string;
    width?: number;
    height?: number;
  };
  api_source?: string;
}

/**
 * 今日老婆插件。
 *
 * 当文本包含"今日老婆"时触发，根据发送者 ID 生成稳定数字 ID 后请求接口，
 * 下载返回的图片并以图片消息回复。
 */
export const todayWifePlugin: TextMessage = {
  type: 'text',
  name: 'today-wife',
  description: '发送"今日老婆"获取今日二次元老婆图片',

  match: (content) => content.includes('今日老婆'),

  handle: async (message) => {
    try {
      const sender = (message.from ?? '').trim() || 'anonymous';
      const userId = mapToStableRange(sender, MIN_ID, MAX_ID);
      const apiRes = await fetch(`${API_URL}?id=${userId}`);
      if (!apiRes.ok) {
        logger.error('今日老婆 API 请求失败', { status: apiRes.status, userId });
        return null;
      }

      const data = (await apiRes.json()) as TodayWifeApiResponse;
      const imageUrl = data.data?.image_url;
      if (!imageUrl) {
        logger.error('今日老婆 API 未返回 image_url', { userId, payload: data });
        return null;
      }

      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        logger.error('今日老婆图片下载失败', { status: imageRes.status, imageUrl, userId });
        return null;
      }

      const buffer = await imageRes.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      return { type: 'image', mediaId: base64 };
    } catch (err) {
      logger.error('调用今日老婆 API 时发生异常', err);
      return null;
    }
  },
};
