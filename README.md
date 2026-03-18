# xchatbot

> 部署在 Cloudflare Workers 上的微信消息机器人（WeChat-only）。

## 功能概览

- 微信 Webhook 接入（`/webhook/wechat`）
- 统一消息模型（文本/图片/语音/视频/位置/链接/事件）
- 插件优先处理（AI 对话、通用关键词插件等）
- 支持多条回复（`ReplyMessage[]`）
- 支持调试转发（全局请求透传到调试地址）

## 架构

```text
HTTP Request
   -> src/index.ts
      -> /webhook/wechat
         -> src/wechat/index.ts
            -> parseWechatMessages（批量逐条解析）
            -> bot/handlers/plugins
            -> WechatApi 发送回复
```

## 快速开始

### 1) 安装

```bash
npm install
```

### 2) 配置 `.dev.vars`

```ini
# 微信网关
WECHAT_TOKEN=your_hmac_token
WECHAT_API_BASE_URL=http://127.0.0.1:7080
# WECHAT_CALLBACK_URL=http://your-bridge/callback  # 可选，旧版模式

# AI 插件（可选）
AI_API_URL=https://your-ai-endpoint/v1/chat/completions
AI_API_KEY=your_ai_api_key
AI_MODEL=gpt-4o-mini

# 通用插件远程配置（可选）
COMMON_PLUGINS_CONFIG_URL=https://your-config-endpoint
COMMON_PLUGINS_CLIENT_ID=your_client_id

# 全局调试透传（可选）
DEBUG_FORWARD_ENABLED=false
DEBUG_FORWARD_URL=http://127.0.0.1:8787
```

### 3) 本地运行

```bash
npm run dev
```

### 4) 部署

```bash
npm run deploy
```

生产环境建议用 `wrangler secret put` 配置敏感信息（如 `WECHAT_TOKEN`、`AI_API_KEY`）。

## 路由

| 路径 | 方法 | 说明 |
|---|---|---|
| `/webhook/wechat` | POST | 微信消息入口 |
| `/health` | GET | 健康检查 |
| `/` | GET | 健康检查 |

## 插件

内置插件位于 `src/plugins/`，文本消息先走插件匹配，再走内置 handler。

- `ai-dialog`：文本包含 `小聪明儿` 时调用 AI 接口
- `common-plugins-engine`：按配置关键词请求外部接口并自动组装回复
- `today-wife`：今日老婆图片插件

## 项目结构

```text
src/
  index.ts                    # Worker 入口（微信路由 + 调试转发）
  types/message.ts            # 消息/回复类型与 Env 定义
  bot/index.ts                # 消息分发与 toReplyArray
  handlers/                   # 各消息类型处理器
  wechat/                     # 微信适配层（验签、解析、发送）
  plugins/                    # 插件系统与插件实现
  utils/                      # 日志、加密、二进制、XML 等工具

test/
  platforms/wechat.test.ts
  platforms/wechat-api.test.ts
  handlers/handlers.test.ts
  plugins/*.test.ts
  router.test.ts
```

## 环境变量

| 变量名 | 说明 |
|---|---|
| `WECHAT_TOKEN` | 微信 Webhook HMAC-SHA256 签名密钥 |
| `WECHAT_API_BASE_URL` | 微信网关 API 地址（推荐） |
| `WECHAT_CALLBACK_URL` | 旧版回调地址（与 API 二选一） |
| `WECHAT_VIDEO_THUMB_BASE64` | 发送视频时的可选封面 base64 |
| `WECHAT_VIDEO_DURATION` | 发送视频时的可选时长（秒） |
| `AI_API_URL` | AI 接口地址（`ai-dialog` 使用） |
| `AI_API_KEY` | AI 接口 Bearer Token（可选） |
| `AI_MODEL` | AI 模型名称（可选） |
| `AI_SYSTEM_PROMPT` | AI 系统提示词（可选） |
| `COMMON_PLUGINS_CONFIG` | 通用插件 JSON 配置（内联） |
| `COMMON_PLUGINS_CONFIG_URL` | 通用插件远程配置地址 |
| `COMMON_PLUGINS_CLIENT_ID` | 通用插件远程配置请求头 `clientid` |
| `DEBUG_FORWARD_ENABLED` | 是否开启全局调试转发 |
| `DEBUG_FORWARD_URL` | 调试转发目标地址 |

## 测试

```bash
npm run test
npm run test:watch
```

## License

MIT
