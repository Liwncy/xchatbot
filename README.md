# xchatbot

> 部署在 Cloudflare Workers 上的微信消息机器人（WeChat-only）。

## 功能概览

- 微信 Webhook 接入（`/webhook/wechat`）
- 统一消息模型（文本 / 图片 / 语音 / 视频 / 位置 / 链接 / 事件）
- 插件优先处理（AI 对话、通用关键词插件、修仙玩法等）
- 支持多条回复（`ReplyMessage[]`）
- 支持调试转发（全局请求透传到调试地址）
- 支持 Cloudflare `scheduled` + D1 的定时任务中心（MVP）

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

如果你要联调定时任务入口，建议使用：

```bash
npm run dev:scheduled
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

### 5) 定时任务表初始化

本地初始化调度中心表：

```bash
npm run d1:migrate:local:scheduler
```

远程初始化调度中心表：

```bash
npm run d1:migrate:remote:scheduler
```

## 路由

| 路径 | 方法 | 说明 |
|---|---|---|
| `/webhook/wechat` | POST | 微信消息入口 |
| `/admin/plugins` | GET | 查看插件配置来源状态（inline/kv/remote） |
| `/admin/plugins/reload` | POST | 清空插件规则内存缓存 |
| `/admin/scheduler/executors` | GET | 查看当前已注册定时执行器 |
| `/admin/scheduler/jobs` | GET/POST | 查看任务列表 / 创建任务 |
| `/admin/scheduler/jobs/:id` | GET | 查看任务详情 |
| `/admin/scheduler/jobs/:id/update` | POST | 更新任务定义 |
| `/admin/scheduler/jobs/:id/pause` | POST | 暂停任务 |
| `/admin/scheduler/jobs/:id/resume` | POST | 恢复任务 |
| `/admin/scheduler/jobs/:id/trigger` | POST | 手动立即执行一次 |
| `/admin/scheduler/jobs/:id/runs` | GET | 查看任务执行记录 |
| `/health` | GET | 健康检查 |
| `/` | GET | 健康检查 |

## 定时任务中心（MVP）

当前仓库已接入一版轻量调度中心，核心能力：

- Worker 原生 `scheduled` 入口
- D1 持久化任务定义与运行日志
- 执行器注册机制
- 管理接口 `/admin/scheduler/*`

目录分层约定：

- `src/scheduler/`：调度中心核心层（不直接依赖微信业务，也不内置具体业务执行器）
- `src/scheduler-ext/`：调度扩展层，用于注册具体业务执行器，例如 `heartbeat`、`send-wechat-text`

当前内置执行器：

- `heartbeat`：记录心跳，可选写入 KV
- `send-wechat-text`：主动发送微信文本

相关文档：

- 文档索引：`_docs/README.md`
- 设计稿：`_docs/scheduler/cloudflare-scheduler-design.md`
- SQL：`_docs/scheduler/scheduler-mvp.sql`
- API 草案：`_docs/scheduler/scheduler-api-draft.md`

典型本地联调顺序：

```bash
npm run d1:migrate:local:scheduler
npm run dev:scheduled
```

然后调用：

1. `GET /admin/scheduler/executors`
2. `POST /admin/scheduler/jobs`
3. `POST /admin/scheduler/jobs/:id/trigger`
4. 本地 scheduled 测试入口

## 插件

内置插件位于 `src/plugins/`，文本消息先走插件匹配，再走内置 handler。

| 插件 | 说明 | 文档 |
|---|---|---|
| `ai-dialog` | 文本包含 `小聪明儿` 时调用 AI 接口 | — |
| `common-plugins-engine` | 基础关键词 → 外部接口 | — |
| `dynamic-common-plugins-engine` | 动态参数（关键词 + 参数提取 + 模板渲染） | — |
| `workflow-common-plugins-engine` | workflow 规则（多步骤请求编排） | — |
| `today-wife` | 今日老婆图片 | — |
| `xiuxian-plugin` | 文本修仙玩法（创建/修炼/探索/背包/挑战/拍卖/爬塔/灵宠 等） | [src/plugins/game/xiuxian/README.md](src/plugins/game/xiuxian/README.md) |

> 具体插件的配置字段、规则示例与指令清单不在本文档中展开，请参考对应插件目录下的说明或 `_docs/` 下的示例配置文件。

管理接口（需 `Authorization: Bearer <ADMIN_TOKEN>`，未配置 `ADMIN_TOKEN` 时不鉴权）：

- `GET /admin/plugins`：查看当前三层配置是否已配置、KV key 是否存在、缓存条目数。
- `POST /admin/plugins/reload`：清空规则内存缓存，下一次命中插件时重新加载配置。

## 项目结构

```text
src/
  index.ts                    # Worker 入口（微信路由 + 调试转发）
  types/message.ts            # 消息/回复类型与 Env 定义
  bot/index.ts                # 消息分发与 toReplyArray
  handlers/                   # 各消息类型处理器
  wechat/                     # 微信适配层（验签、解析、发送）
  plugins/                    # 插件系统与插件实现
  scheduler/                  # 定时任务中心 core
  scheduler-ext/              # 定时任务扩展执行器（业务层）
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
| `BOT_OWNER_WECHAT_ID` | 默认定时通知接收人（`send-wechat-text` 可复用） |
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
| `XBOT_DB` | D1 数据库（修仙插件使用） |
| `ADMIN_TOKEN` | 管理接口鉴权 Token（含 scheduler / plugins / debug） |
| `DEBUG_FORWARD_ENABLED` | 是否开启全局调试转发 |
| `DEBUG_FORWARD_URL` | 调试转发目标地址 |

## 测试

```bash
npm run test
npm run test:watch
```

## License

MIT
