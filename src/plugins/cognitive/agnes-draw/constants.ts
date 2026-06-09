/** 文生图触发词（按长度降序匹配） */
export const AGNES_TEXT_DRAW_KEYWORDS = ['聪明文绘图', '聪明绘图'] as const;

/** 引用消息统一触发词（按 referType 自动分流） */
export const SMART_QUOTE_DRAW_KEYWORD = '聪明绘图';

/** @deprecated 保留兼容旧引用标题 */
export const AGNES_QUOTE_DRAW_KEYWORDS = ['聪明图绘图', '聪明改图', SMART_QUOTE_DRAW_KEYWORD] as const;

export const AGNES_MODEL = 'agnes-image-2.1-flash';

export const AGNES_API_BASE_URL = 'https://apihub.agnes-ai.com';

export const DEFAULT_IMAGE_SIZE = '1024x768';

export const DEFAULT_IMG2IMG_PROMPT = '优化画面细节，保持原图构图与主体不变';

export const AGNES_REQUEST_TIMEOUT_MS = 90_000;
