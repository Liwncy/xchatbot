/** 统一触发词（前缀匹配纯文本；引用标题用子串匹配） */
export const AGNES_TEXT_TRIGGER_KEYWORDS = ['聪明闪答', 'Agnes问答', 'Agnes'] as const;

export const AGNES_TEXT_MODEL = 'agnes-2.0-flash';

export const AGNES_API_BASE_URL = 'https://apihub.agnes-ai.com';

export const AGNES_TEXT_CHAT_COMPLETIONS_PATH = '/v1/chat/completions';

export const AGNES_TEXT_REQUEST_TIMEOUT_MS = 60_000;

/** 用户只发图/表情、未写问题时使用的默认指令 */
export const AGNES_TEXT_DEFAULT_MEDIA_PROMPT = '请根据这张图片回答用户可能关心的问题，并给出清晰说明。';

export const AGNES_TEXT_WAIT_MEDIA_REPLY =
    '请在 2 分钟内发送图片或表情；也可引用文件后带上「Agnes 你的问题」一次发送。';

export const AGNES_TEXT_PENDING_TTL_MS = 2 * 60 * 1000;

export const AGNES_TEXT_EMOJI_NAME_SYSTEM_PROMPT =
    '你是表情命名助手。根据图片为微信表情包起一个简短中文名。只输出 2-4 个汉字，不要标点、不要解释、不要引号。';
