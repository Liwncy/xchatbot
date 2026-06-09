/** 文生视频触发词（按长度降序匹配） */
export const AGNES_TEXT_VIDEO_KEYWORDS = ['聪明文绘影', '聪明绘影'] as const;

/** 引用消息统一触发词（按 referType 自动分流） */
export const SMART_QUOTE_VIDEO_KEYWORD = '聪明绘影';

/** @deprecated 保留兼容旧引用标题 */
export const AGNES_QUOTE_VIDEO_KEYWORDS = ['聪明图绘影', SMART_QUOTE_VIDEO_KEYWORD] as const;

/** 查询任务进度，例如：查绘影 123456 */
export const AGNES_VIDEO_QUERY_PREFIX = '查绘影';

/** xchatbot Worker 公网域名，用于拼 GET 图片代理 URL（与 wrangler routes 一致）。 */
export const XCHATBOT_PUBLIC_BASE_URL = 'https://xbot.lwcfworker.dpdns.org';

export const AGNES_VIDEO_MODEL = 'agnes-video-v2.0';

export const AGNES_API_BASE_URL = 'https://apihub.agnes-ai.com';

export const DEFAULT_VIDEO_WIDTH = 1152;
export const DEFAULT_VIDEO_HEIGHT = 768;
export const DEFAULT_NUM_FRAMES = 121;
export const DEFAULT_FRAME_RATE = 24;

export const DEFAULT_IMG2VIDEO_PROMPT = '让画面主体自然动起来，保持原图构图与主体稳定，电影感镜头';

/** 创建任务 HTTP 等待上限；Agnes 接口可能较慢才返回 video_id。 */
export const AGNES_VIDEO_CREATE_TIMEOUT_MS = 300_000;

/** KV 任务记录保留 7 天 */
export const AGNES_VIDEO_TICKET_TTL_SECONDS = 7 * 24 * 60 * 60;

export const AGNES_VIDEO_TICKET_LENGTH = 6;
