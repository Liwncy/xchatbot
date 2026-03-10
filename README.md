# xchatbot

> 部署在 Cloudflare Workers 上的多平台消息处理机器人框架，零运行时依赖。

## ✨ 功能特性

- **多平台支持** — 微信个人账号、飞书、钉钉，统一消息模型
- **多消息类型** — 文本、图片、语音、视频、位置、链接、事件
- **多条回复** — Handler 可一次返回多条消息（`ReplyMessage[]`），平台适配层自动逐条发送
- **插件系统** — 通过 `PluginManager` 注册/注销插件，优先于内置关键词匹配
- **回复路由** — 可指定回复对象（`to`）和群聊 @提醒（`mentions`）
- **签名验证** — 各平台 Webhook HMAC-SHA256 签名验证
- **零依赖** — 仅依赖 Cloudflare Workers 原生 API（Web Crypto、Fetch），无第三方运行时依赖
- **完整类型** — 全 TypeScript 编写，导出类型供二次开发使用

## 📐 架构概览

```
请求入口 (Cloudflare Workers fetch handler)
       │
       ▼
 平台适配层 (Platform Adapter)
  ├── /webhook/wechat   → 微信适配器（桥接网关 + 类型化 API 客户端）
  ├── /webhook/feishu   → 飞书适配器（REST API）
  └── /webhook/dingtalk → 钉钉适配器（Session Webhook）
       │
       ▼  归一化为 IncomingMessage
 消息路由器 (routeMessage)
       │
       ├── text     → TextHandler（优先检查插件）
       ├── image    → ImageHandler
       ├── voice    → VoiceHandler
       ├── video    → VideoHandler
       ├── location → LocationHandler
       ├── link     → LinkHandler
       └── event    → EventHandler
                │
                ▼  返回 HandlerResponse（单条 / 多条 / null）
 平台适配层 (toReplyArray → 逐条发送)
```

**关键类型流**

```
IncomingMessage ──▶ MessageHandler ──▶ HandlerResponse
                                       ├── ReplyMessage      (单条回复)
                                       ├── ReplyMessage[]    (多条回复)
                                       └── null              (不回复)
```

## 🚀 快速开始

### 前置要求

- Node.js ≥ 18
- npm
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)（`npm install -g wrangler`）

### 安装

```bash
npm install
```

### 本地开发

1. 在项目根目录创建 `.dev.vars` 文件，写入所需环境变量：

```ini
# 微信（至少配一种回复通道）
WECHAT_TOKEN=your_hmac_token
WECHAT_API_BASE_URL=http://127.0.0.1:7080
# WECHAT_CALLBACK_URL=http://your-bridge/callback  # 旧版回调方式

# 飞书
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
FEISHU_ENCRYPT_KEY=your_encrypt_key

# 钉钉
DINGTALK_APP_KEY=your_app_key
DINGTALK_APP_SECRET=your_app_secret
```

2. 启动开发服务器：

```bash
npm run dev
```

### 部署

```bash
npm run deploy
```

通过 `wrangler secret` 设置生产环境的密钥：

```bash
wrangler secret put WECHAT_TOKEN
wrangler secret put WECHAT_API_BASE_URL
wrangler secret put FEISHU_APP_ID
wrangler secret put FEISHU_APP_SECRET
wrangler secret put FEISHU_ENCRYPT_KEY
wrangler secret put DINGTALK_APP_KEY
wrangler secret put DINGTALK_APP_SECRET
```

## 🔌 Webhook 端点

| 平台   | 路径                            | 方法 | 签名验证                                 |
| ------ | ------------------------------- | ---- | ---------------------------------------- |
| 微信   | `/webhook/wechat`               | POST | HMAC-SHA256（`X-Signature` + `X-Timestamp` 头） |
| 飞书   | `/webhook/feishu`               | POST | HMAC-SHA256（`X-Lark-Signature` 头）     |
| 钉钉   | `/webhook/dingtalk`             | POST | HMAC-SHA256（`timestamp` + `sign` 查询参数） |
| 健康检查 | `/health` 或 `/`              | GET  | 无                                       |

## 📝 自定义处理逻辑

### 注册自定义 Handler

使用 `registerHandler` 替换任意消息类型的处理器：

```typescript
import { registerHandler } from './router/index.js';

registerHandler('text', async (message, env) => {
  if (message.source === 'group') {
    return { type: 'text', content: `[群消息] 收到：${message.content}` };
  }
  return { type: 'text', content: `收到：${message.content}` };
});
```

### 一次回复多条消息

Handler 可以返回数组，平台适配层会逐条发送：

```typescript
registerHandler('text', async (message, env) => {
  return [
    { type: 'text', content: '这是第一条回复' },
    { type: 'text', content: '这是第二条回复' },
    { type: 'image', mediaId: 'base64_image_data...' },
  ];
});
```

### 指定回复对象与 @提醒

通过 `to` 字段覆盖默认收件人，`mentions` 字段在群聊中 @指定用户：

```typescript
registerHandler('text', async (message, env) => {
  return {
    type: 'text',
    content: '请注意这条消息',
    to: 'room_456@chatroom',           // 覆盖默认收件人
    mentions: ['wxid_user1', 'wxid_user2'], // 群聊中 @这些用户
  };
});
```

## 🧩 插件系统

插件基于 `PluginManager`，以注册顺序匹配，第一个命中的插件处理消息，**优先于**内置关键词路由。

### 内置插件

| 插件名       | 触发条件           | 功能                     |
| ------------ | ------------------ | ------------------------ |
| `cat-image`  | 文本包含 `看看猫咪` | 从 TheCatAPI 获取随机猫咪图片 |

### 编写自定义插件

1. 创建插件文件 `src/plugins/my-plugin.ts`：

```typescript
import type { TextMessage } from './types.js';

export const myPlugin: TextMessage = {
  type: 'text',
  name: 'my-plugin',
  description: '自定义插件示例',

  // 判断是否由此插件处理
  match: (content, message) => content.startsWith('/echo '),

  // 处理消息并返回回复（支持返回数组）
  handle: async (message, env) => {
    const text = (message.content ?? '').replace(/^\/echo\s+/, '');
    return { type: 'text', content: text };
  },
};
```

2. 在 `src/plugins/index.ts` 中注册：

```typescript
import { myPlugin } from './my-plugin.js';

pluginManager.register(myPlugin);
```

插件类型定义：

- **`TextMessage`** — 文本消息插件，`match(content, message)` 接收裁剪后的文本
- **`ImageMessage`** — 图片消息插件，`match(message)` 接收完整消息

`handle` 函数返回值类型为 `HandlerResponse`，即 `ReplyMessage | ReplyMessage[] | null`。

## 🗂 项目结构

```
src/
├── index.ts                      # Cloudflare Worker 入口
├── types/
│   └── message.ts                # 归一化消息 & 回复类型定义
├── router/
│   └── index.ts                  # 消息路由器（routeMessage / toReplyArray / registerHandler）
├── handlers/                     # 消息类型处理器
│   ├── text-handler.ts           # 文本消息（含插件优先匹配）
│   ├── image-handler.ts          # 图片消息
│   ├── voice-handler.ts          # 语音消息
│   ├── video-handler.ts          # 视频消息
│   ├── location-handler.ts       # 位置消息
│   ├── link-handler.ts           # 链接消息
│   ├── event-handler.ts          # 事件消息（关注 / 扫码 / 菜单点击等）
│   └── default-handler.ts        # 未知类型兜底
├── plugins/                      # 插件系统
│   ├── types.ts                  # 插件类型定义（TextMessage / ImageMessage）
│   ├── manager.ts                # PluginManager 注册 & 匹配
│   ├── index.ts                  # 插件入口（注册内置插件）
│   └── cat-image.ts              # 内置猫咪图片插件
├── platforms/                    # 平台适配器
│   ├── wechat/
│   │   ├── index.ts              # 消息解析 / 签名验证 / 回复发送
│   │   ├── types.ts              # 微信推送消息类型
│   │   ├── api.ts                # 类型化 API 客户端（WechatApi 类）
│   │   └── api-types.ts          # API 请求 & 响应类型
│   ├── feishu/
│   │   ├── index.ts              # 消息解析 / URL 验证 / 回复发送
│   │   └── types.ts              # 飞书事件类型
│   └── dingtalk/
│       ├── index.ts              # 消息解析 / 签名验证 / 回复发送
│       └── types.ts              # 钉钉消息类型
└── utils/
    ├── crypto.ts                 # SHA-1 / HMAC-SHA256（Web Crypto API）
    └── xml.ts                    # XML 解析 & 构建
test/                             # 单元测试（Vitest）
├── router.test.ts
├── handlers/handlers.test.ts
├── platforms/
│   ├── wechat.test.ts
│   ├── wechat-api.test.ts
│   ├── feishu.test.ts
│   └── dingtalk.test.ts
├── plugins/
│   ├── manager.test.ts
│   └── cat-image.test.ts
└── utils/xml.test.ts
```

## ⚙️ 环境变量

| 变量名                    | 平台   | 说明                                           |
| ------------------------- | ------ | ---------------------------------------------- |
| `WECHAT_TOKEN`            | 微信   | Webhook HMAC-SHA256 签名密钥                   |
| `WECHAT_API_BASE_URL`     | 微信   | 桥接网关 API 地址（推荐，如 `http://localhost:8080`） |
| `WECHAT_CALLBACK_URL`     | 微信   | 旧版回调地址（与 API 二选一）                  |
| `FEISHU_APP_ID`           | 飞书   | 应用 App ID                                    |
| `FEISHU_APP_SECRET`       | 飞书   | 应用 App Secret                                |
| `FEISHU_VERIFICATION_TOKEN` | 飞书 | 请求验证 Token（可选）                         |
| `FEISHU_ENCRYPT_KEY`      | 飞书   | 签名验证加密密钥                               |
| `DINGTALK_APP_KEY`        | 钉钉   | 应用 App Key                                   |
| `DINGTALK_APP_SECRET`     | 钉钉   | 应用 App Secret                                |

本地开发时写入 `.dev.vars` 文件，生产环境通过 `wrangler secret put <KEY>` 设置。

## 🧪 测试

```bash
# 运行全部测试
npm test

# 监听模式
npm run test:watch
```

## 📜 License

MIT
