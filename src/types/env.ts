/** Cloudflare Workers 环境绑定。第一刀只保留核、Golem 和 MCP 需要的项。 */
export interface Env {
    XBOT_KV: KVNamespace;
    XBOT_DB: D1Database;

    WECHAT_TOKEN?: string;
    WECHAT_API_BASE_URL?: string;
    BOT_OWNER_WECHAT_ID?: string;
    BOT_OWNER_WECHAT_NAME?: string;
    BOT_WECHAT_ID?: string;
    BOT_WECHAT_NAME?: string;

    MCP_TOOLS_URL?: string;
    MCP_TOOLS_TOKEN?: string;
    XIUXIAN_PLATFORM?: string;

    AGENT_BRIDGE_BASE_URL?: string;
    AGENT_BRIDGE_TOKEN?: string;
    XBOT_CHANNEL_ENABLED?: string;
    XBOT_CHANNEL_GATEWAY_URL?: string;
    XBOT_CHANNEL_GATEWAY_TOKEN?: string;
    XBOT_CHANNEL_CLIENT_ID?: string;
    XBOT_CHANNEL_TIMEOUT_MS?: string;
    XBOT_CHANNEL_AUTO_FORWARD?: string;

    /** 浏览器调试适配器。未开时 /adapter/web 返回 404。上线前关掉。 */
    WEB_ADAPTER_ENABLED?: string;
    /** 可选。设置后 POST /adapter/web/message 需要 Bearer。 */
    WEB_ADAPTER_TOKEN?: string;
}
