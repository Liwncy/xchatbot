/** Cloudflare Workers 环境绑定。第一刀只保留核、Golem 和 MCP 需要的项。 */
export interface Env {
    XBOT_KV: KVNamespace;
    XBOT_DB: D1Database;

    WECHAT_TOKEN?: string;
    WECHAT_API_BASE_URL?: string;
    /** 全局对外名。所有适配器里都叫这个，默认小聪明儿。 */
    BOT_NAME?: string;
    /** 全局主人账号。未设时微信群回退 BOT_OWNER_WECHAT_ID。 */
    BOT_OWNER_ID?: string;
    BOT_OWNER_WECHAT_ID?: string;
    BOT_OWNER_WECHAT_NAME?: string;
    BOT_WECHAT_ID?: string;
    /** @deprecated 用 BOT_NAME。没配 BOT_NAME 时仍当对外名。 */
    BOT_WECHAT_NAME?: string;

    /** 自家 cf-mcp-tools。`#` 口令默认打这里。加别的 MCP 在 catalog.ts 的 MCP_SERVERS 登记后再加对应绑定。 */
    MCP_TOOLS_URL?: string;
    MCP_TOOLS_TOKEN?: string;
    XIUXIAN_PLATFORM?: string;

    AGENT_BRIDGE_BASE_URL?: string;
    AGENT_BRIDGE_TOKEN?: string;
    XBOT_CHANNEL_ENABLED?: string;
    XBOT_CHANNEL_GATEWAY_URL?: string;
    XBOT_CHANNEL_GATEWAY_TOKEN?: string;
    XBOT_CHANNEL_TIMEOUT_MS?: string;
    XBOT_CHANNEL_AUTO_FORWARD?: string;

    /**
     * 自然语言交给哪颗大脑。`openclaw`（默认）、`snailai` 或 `qwenpaw`。
     * 门禁 / `#` 口令 / 正文拼装不跟这个走。
     */
    AGENT_BRAIN?: string;
    /** SnailAI 服务根，例如 `https://host:8900`；若已是 `.../openapi/v1` 则原样用。 */
    SNAIL_AI_BASE_URL?: string;
    /** OpenAPI 路径前缀，默认 `snail-ai`。 */
    SNAIL_AI_PREFIX?: string;
    SNAIL_AI_APP_ID?: string;
    SNAIL_AI_TOKEN?: string;
    /** 智能体 id，默认 1。 */
    SNAIL_AI_AGENT_ID?: string;
    /** 同步对话超时，默认 180000。 */
    SNAIL_AI_TIMEOUT_MS?: string;

    /**
     * QwenPaw 公网根，例如 trycloudflare 或 named hostname。
     * Worker 会 POST `{QWENPAW_BASE_URL}/api/channels/xbot/inbound`。
     */
    QWENPAW_BASE_URL?: string;
    /** 入站 Bearer；未设时回退 AGENT_BRIDGE_TOKEN。 */
    QWENPAW_TOKEN?: string;
    /** QwenPaw inbound 超时，默认同 XBOT_CHANNEL_TIMEOUT_MS / 120000。 */
    QWENPAW_TIMEOUT_MS?: string;

    /** 浏览器调试适配器。未开时 /adapter/web 返回 404。上线前关掉。 */
    WEB_ADAPTER_ENABLED?: string;
    /** 可选。设置后 POST /adapter/web/message 需要 Bearer。 */
    WEB_ADAPTER_TOKEN?: string;

    /**
     * 远程 WAV/MP3 → SILK。默认 `https://api.chrelyonly.cn/convert`。
     * 设为 `off` 则只用本地 wasm。
     */
    SILK_CONVERT_URL?: string;

    /** 会话记录。未设或 true 时写入 D1 chat_message。 */
    CHAT_LOG_ENABLE?: string;
    /** 运行日志。未设或 true 时把 warn/error 写入 D1 app_log。 */
    APP_LOG_ENABLE?: string;
}
