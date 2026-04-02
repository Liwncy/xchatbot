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

# AI 插件（可选）
AI_API_URL=https://your-ai-endpoint/v1/chat/completions
AI_API_KEY=your_ai_api_key
AI_MODEL=gpt-4o-mini

# 通用插件远程配置（可选）
COMMON_PLUGINS_CONFIG_URL=https://your-config-endpoint
COMMON_PLUGINS_CLIENT_ID=your_client_id
COMMON_DYNAMIC_PLUGINS_CLIENT_ID=your_dynamic_client_id
COMMON_WORKFLOW_PLUGINS_CLIENT_ID=your_workflow_client_id

# 全局调试透传（可选）
DEBUG_FORWARD_ENABLED=false
DEBUG_FORWARD_URL=http://127.0.0.1:8787
```

### 3) 本地运行

```bash
npm run dev
```

如果你要在本地使用 KV 里的通用插件配置，先执行：

```bash
npm run kv:seed:local
```

一键写入本地 KV 后再启动：

```bash
npm run dev:seed
```

查看本地 KV 当前配置：

```bash
npm run kv:get:local:common
npm run kv:get:local:dynamic
npm run kv:get:local:workflow
```

写入线上 KV（Cloudflare）：

```bash
npm run kv:seed:remote
```

查看线上 KV 当前配置：

```bash
npm run kv:get:remote:common
npm run kv:get:remote:dynamic
npm run kv:get:remote:workflow
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
| `/admin/plugins` | GET | 查看插件配置来源状态（inline/kv/remote） |
| `/admin/plugins/reload` | POST | 清空插件规则内存缓存 |
| `/health` | GET | 健康检查 |
| `/` | GET | 健康检查 |

## 插件

内置插件位于 `src/plugins/`，文本消息先走插件匹配，再走内置 handler。

- `ai-dialog`：文本包含 `小聪明儿` 时调用 AI 接口
- `dynamic-common-plugins-engine`：动态通用规则（参数提取 + 模板渲染）
- `workflow-common-plugins-engine`：workflow 规则（多步骤请求编排）
- `common-plugins-engine`：按配置关键词请求外部接口并自动组装回复
- `today-wife`：今日老婆图片插件

## 通用配置规则使用

通用规则支持三种引擎，支持 `内联 -> KV -> 远程` 分层加载：

- 基础引擎：`common-plugins-engine`（`COMMON_PLUGINS_CLIENT_ID`）
- 动态引擎：`dynamic-common-plugins-engine`（`COMMON_DYNAMIC_PLUGINS_CLIENT_ID`）
- workflow 引擎：`workflow-common-plugins-engine`（`COMMON_WORKFLOW_PLUGINS_CLIENT_ID`）

KV key 约定：

- 基础规则：`plugins:common:mapping`
- 动态规则：`plugins:parameterized:mapping`
- workflow 规则：`plugins:workflow:mapping`

加载优先级：

1. 内联配置（`COMMON_PLUGINS_CONFIG` / `COMMON_PLUGINS_MAPPING`，仅基础规则）
2. Cloudflare KV（上述 3 个 key）
3. 远程配置（`COMMON_PLUGINS_CONFIG_URL` + 不同 `clientid`）

管理接口（需 `Authorization: Bearer <ADMIN_TOKEN>`，未配置 `ADMIN_TOKEN` 时不鉴权）：

- `GET /admin/plugins`：查看当前三层配置是否已配置、KV key 是否存在、缓存条目数。
- `POST /admin/plugins/reload`：清空规则内存缓存，下一次命中插件时重新加载配置。

### 3) Workflow 规则（workflow-common-plugins-engine）

适合需要串行调用多个接口并复用中间结果的场景。

```json
[
  {
    "name": "weather-workflow",
    "keyword": "天气详情",
    "matchMode": "prefix",
    "args": {"mode": "tail", "names": ["city"], "required": ["city"]},
    "mode": "workflow",
    "rType": "text",
    "outputFrom": "finalText",
    "steps": [
      {
        "name": "city-code",
        "url": "https://api.example.com/city-code?name={{city}}",
        "mode": "json",
        "jsonPath": "$.data.code",
        "saveAs": "cityCode"
      },
      {
        "name": "weather",
        "url": "https://api.example.com/weather?code={{cityCode}}",
        "mode": "json",
        "jsonPath": "$.data.summary",
        "saveAs": "finalText"
      }
    ]
  }
]
```


两者都会请求 `COMMON_PLUGINS_CONFIG_URL`，通过不同 `clientid` 获取不同规则集。

### 1) 基础规则（common-plugins-engine）

适合固定关键词 + 固定 API 的场景。

```json
[
  {
    "name": "today-wife",
    "keyword": "今日老婆",
    "url": "https://api.example.com/wife",
    "mode": "json",
    "jsonPath": "$.data.image_url",
    "rType": "image"
  },
  {
    "name": "random-joke",
    "keyword": ["笑话", "讲个笑话"],
    "url": "https://api.example.com/joke",
    "mode": "json",
    "jsonPath": "$.data.list[x]",
    "rType": "text"
  }
]
```

字段说明（基础规则）：

- `keyword`：字符串或数组，支持 `a|b|c` 写法
- `mode`：`text` / `json` / `base64`
- `jsonPath`：仅 `mode=json` 时使用，支持简化路径与 `[x]` 随机索引
- `rType`：`text` / `image` / `video` / `voice` / `link`

#### `jsonPath` 速查（建议收藏）

支持能力：

- 单路径：`$.data.image_url`
- 数组随机：`$.data.list[x]`
- 数组全量：`$.data.list[*]`
- 自动数组取字段（不用写下标）：`$.prices.title`
- 字符串拼接：`$.city + '-' + $.district`
- 同级多字段：`$.data.a,$.data.b`
- 数组对象格式化：`lines($.prices,'{title}:{price}')`
- 数组拼接：`join($.prices.title,'、')`

`lines` 函数说明：

- 语法：`lines(数组路径, 模板[, 分隔符])`
- 模板里可用 `{字段名}`，例如 `{title}`、`{price}`
- 可用 `{#}` 表示序号（从 1 开始）

油价示例（你这个场景可直接用）：

```json
{
  "keyword": "山东油价",
  "url": "https://api.example.com/oil-price",
  "mode": "json",
  "jsonPath": "$.city + $.tips + ':\\n' + lines($.prices,'{title}:{price}')",
  "rType": "text"
}
```

会输出：

```text
山东下次油价3月23日24时调整:
山东92#汽油:7.60
山东95#汽油:8.15
山东98#汽油:9.15
山东0#柴油:7.21
```

### 2) 动态规则（dynamic-common-plugins-engine）

适合“关键词 + 动态参数”的场景（如：`天气 北京`、`汇率 USD CNY`）。

```json
[
  {
    "name": "weather-query",
    "keyword": "天气",
    "matchMode": "prefix",
    "args": {
      "mode": "tail",
      "names": ["city"],
      "required": ["city"]
    },
    "url": "https://api.example.com/weather?city={{city}}",
    "mode": "json",
    "jsonPath": "$.result",
    "rType": "text"
  },
  {
    "name": "fx-query",
    "keyword": "汇率",
    "matchMode": "prefix",
    "args": {
      "mode": "split",
      "names": ["from", "to"],
      "required": ["from", "to"]
    },
    "url": "https://api.example.com/fx",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer {{1}}-{{2}}"
    },
    "body": {
      "from": "{{from}}",
      "to": "{{to}}"
    },
    "mode": "json",
    "jsonPath": "$.rate",
    "rType": "text"
  }
]
```

字段说明（高级规则新增）：

- `matchMode`：`contains` / `prefix` / `exact` / `regex`
- `args.mode`：`tail`（取关键词后全部）/ `split`（按分隔拆分）/ `regex`
- 模板变量：`{{city}}`、`{{1}}`、`{{all}}` 可用于 `url` / `headers` / `body`

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
| `AI_API_URL` | AI 接口地址（`ai-dialog` 使用） |
| `AI_API_KEY` | AI 接口 Bearer Token（可选） |
| `AI_MODEL` | AI 模型名称（可选） |
| `AI_SYSTEM_PROMPT` | AI 系统提示词（可选） |
| `COMMON_PLUGINS_CONFIG` | 通用插件 JSON 配置（内联，优先级最高，仅基础规则） |
| `COMMON_PLUGINS_CONFIG_URL` | 通用插件远程配置地址 |
| `COMMON_PLUGINS_CLIENT_ID` | 通用插件远程配置请求头 `clientid` |
| `COMMON_DYNAMIC_PLUGINS_CLIENT_ID` | 动态通用插件远程配置请求头 `clientid` |
| `COMMON_WORKFLOW_PLUGINS_CLIENT_ID` | workflow 通用插件远程配置请求头 `clientid` |
| `XBOT_KV` | KV 命名空间（用于存储通用插件配置） |
| `DEBUG_FORWARD_ENABLED` | 是否开启全局调试转发 |
| `DEBUG_FORWARD_URL` | 调试转发目标地址 |

## 测试

```bash
npm run test
npm run test:watch
```

## License

MIT
