/** Cloudflare Workers 环境变量绑定 */
export interface Env {
    // ── 存储绑定 ──
    /** KV 命名空间（XBOT_KV） */
    XBOT_KV: KVNamespace;
    /** D1 数据库（xbotdata） */
    XBOT_DB: D1Database;

    // ── 调试透传（从 KV 动态读取，无需重新部署） ──
    // KV key: "debug:forward:enabled"  value: "true" | "false"
    // KV key: "debug:forward:url"      value: "https://your-local-tunnel-url"
    // 通过 POST /admin/debug 接口控制

    /** 管理接口鉴权 Token（wrangler secret put ADMIN_TOKEN）。未设置时 /admin/debug 无鉴权保护。 */
    ADMIN_TOKEN?: string;

    // 微信个人号（通过网关/桥接服务）
    WECHAT_TOKEN?: string;
    /** 微信网关 API 基础 URL（如 http://gateway:8080）。 */
    WECHAT_API_BASE_URL?: string;
    /** 机器人主人的微信 ID，可作为默认定时通知目标。 */
    BOT_OWNER_WECHAT_ID?: string;
    // 插件
    COMMON_PLUGINS_MAPPING?: string; // JSON字符串，格式为：{"关键词1":"插件1","关键词2":"插件2"}
    /** 通用插件 JSON 配置数组字符串。 */
    COMMON_PLUGINS_CONFIG?: string;
    /** 通用插件远程配置接口地址（GET）。 */
    COMMON_PLUGINS_CONFIG_URL?: string;
    /**
     * 通用插件配置加载顺序：
     * 1) COMMON_PLUGINS_CONFIG / COMMON_PLUGINS_MAPPING（内联）
     * 2) KV: plugins:common:mapping
     * 3) COMMON_PLUGINS_CONFIG_URL（远程）
     */
    /** 拉取通用插件远程配置时使用的 clientid 请求头。 */
    COMMON_PLUGINS_CLIENT_ID?: string;
    /** 通用插件规则缓存毫秒数（0 表示禁用缓存，实时读取）。 */
    COMMON_PLUGINS_CACHE_MS?: string;
    /** KV: plugins:parameterized:mapping（动态参数规则）。 */
    /** 拉取动态通用插件远程配置时使用的 clientid 请求头。 */
    COMMON_DYNAMIC_PLUGINS_CLIENT_ID?: string;
    /** KV: plugins:workflow:mapping（多步骤 workflow 规则）。 */
    /** 拉取 workflow 通用插件远程配置时使用的 clientid 请求头。 */
    COMMON_WORKFLOW_PLUGINS_CLIENT_ID?: string;
    /** 兼容旧变量名：拉取动态通用插件远程配置时使用的 clientid 请求头。 */
    COMMON_ADVANCED_PLUGINS_CLIENT_ID?: string;
    /** 通用音频转 SILK 服务地址（可选，默认使用内置 convert 地址）。 */
    VOICE_CONVERT_API_URL?: string;
    /** 兼容旧变量名：MP3 转 SILK 服务地址。 */
    VOICE_TOSILK_API_URL?: string;
    /** 兼容旧变量名：MP3 转 SILK 服务密钥（当前 convert 接口不需要）。 */
    VOICE_TOSILK_APP_SECRET?: string;
    // AI 插件
    /** AI 插件使用的聊天接口 URL。 */
    AI_API_URL?: string;
    /** AI 接口认证用的 Bearer Token（可选）。 */
    AI_API_KEY?: string;
    /** 传给 AI 接口的模型名称（可选）。 */
    AI_MODEL?: string;
    AI_SYSTEM_PROMPT?: string;

    /** Agnes 图像/视频生成 API Key（聪明绘图、聪明绘影）。 */
    AGNES_API_KEY?: string;

    /** Turnstile 页面使用的公开 site key。 */
    TURNSTILE_SITE_KEY?: string;
    /** Turnstile 服务端校验 secret key。 */
    TURNSTILE_SECRET_KEY?: string;
    /** 对外可访问的 Worker 基础地址，用于拼接验证链接。 */
    TURNSTILE_BASE_URL?: string;
    /** 外部静态验证页面地址（如 GitHub Pages），优先于 TURNSTILE_BASE_URL。 */
    TURNSTILE_PAGE_URL?: string;
    /** 允许跨域访问 /turnstile/api/verify 的来源，逗号分隔，例如 https://yourname.github.io。留空则允许所有来源。 */
    TURNSTILE_CORS_ORIGINS?: string;
}

