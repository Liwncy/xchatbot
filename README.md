# xchatbot

> 部署在 Cloudflare Workers 上的多平台消息处理机器人

## 功能特性

- **多平台支持**：微信个人账号（WeChat Personal）、飞书（Feishu）、钉钉（DingTalk）
- **微信个人账号**：通过桥接网关接收私聊、群聊、公众号推送消息
- **消息类型分发**：文本、图片、语音、视频、位置、链接等
- **可扩展架构**：通过注册自定义 Handler 扩展处理逻辑
- **安全验证**：各平台 Webhook 签名验证
- **零依赖运行时**：基于 Cloudflare Workers 原生 API（Web Crypto、Fetch）

## 架构说明

```
请求入口（Cloudflare Workers）
       │
       ▼
平台适配层（Platform Adapter）
  ├─ /webhook/wechat   → 微信个人账号适配器（通过桥接网关）
  ├─ /webhook/feishu   → 飞书适配器
  └─ /webhook/dingtalk → 钉钉适配器
       │
       ▼（归一化 IncomingMessage）
消息路由器（Message Router）
       │
       ├─ text     → TextHandler
       ├─ image    → ImageHandler
       ├─ voice    → VoiceHandler
       ├─ video    → VideoHandler
       ├─ location → LocationHandler
       ├─ link     → LinkHandler
       └─ event    → EventHandler
                │
                ▼（ReplyMessage）
平台适配层（构建平台格式并回复）
```

### 微信个人账号集成

微信适配器接收来自桥接网关（如 Wechaty）的 JSON 消息，支持以下消息来源：

- **私聊消息**（`source: "private"`）：个人一对一聊天
- **群聊消息**（`source: "group"`）：群组聊天，包含群信息（群ID、群名称）
- **公众号推送**（`source: "official"`）：关注的公众号推送内容

桥接网关将微信消息转发为 JSON 格式到 Webhook 地址，处理后的回复通过回调 URL 发送回桥接网关。

## 快速开始

### 安装依赖

```bash
npm install
```

### 本地开发

在项目根目录新建 `.dev.vars` 文件，写入环境变量（参考 `wrangler.toml`）：

```ini
WECHAT_TOKEN=your_wechat_webhook_token
WECHAT_CALLBACK_URL=http://your-bridge-gateway/callback
```

启动本地开发服务器：

```bash
npm run dev
```

### 部署到 Cloudflare Workers

```bash
npm run deploy
```

通过 `wrangler secret` 设置生产环境变量：

```bash
wrangler secret put WECHAT_TOKEN
wrangler secret put WECHAT_CALLBACK_URL
wrangler secret put FEISHU_ENCRYPT_KEY
```

## Webhook 地址

| 平台         | 路径                     |
| ------------ | ------------------------ |
| 微信个人账号 | `https://<worker>.workers.dev/webhook/wechat`   |
| 飞书         | `https://<worker>.workers.dev/webhook/feishu`   |
| 钉钉         | `https://<worker>.workers.dev/webhook/dingtalk` |
| 健康检查     | `https://<worker>.workers.dev/health`           |

## 微信桥接网关消息格式

桥接网关发送到 `/webhook/wechat` 的 JSON 消息格式：

```json
{
  "source": "private",
  "messageId": "msg_001",
  "timestamp": 1700000000,
  "from": {
    "id": "wxid_sender",
    "name": "发送者昵称"
  },
  "room": {
    "id": "room_id@chatroom",
    "topic": "群名称"
  },
  "self": "wxid_bot",
  "type": "text",
  "content": "消息内容"
}
```

### 签名验证

桥接网关需在请求头中包含 HMAC-SHA256 签名：

- `X-Signature`: HMAC-SHA256(timestamp + body, token) 的十六进制字符串
- `X-Timestamp`: 当前时间戳

## 自定义处理逻辑

修改 `src/handlers/` 目录下对应的 Handler，或使用 `registerHandler` 注册自定义处理器：

```typescript
import { registerHandler } from './src/router/index.js';

registerHandler('text', async (message, env) => {
  // 自定义文本消息处理逻辑
  // message.source 可用于区分私聊、群聊、公众号推送
  if (message.source === 'group') {
    return { type: 'text', content: `[群消息] 你说了：${message.content}` };
  }
  return { type: 'text', content: `你说了：${message.content}` };
});
```

## 项目结构

```
src/
  index.ts                    # Cloudflare Worker 入口
  types/
    message.ts                # 归一化消息类型定义
  router/
    index.ts                  # 消息路由器
  handlers/
    text-handler.ts           # 文本消息处理
    image-handler.ts          # 图片消息处理
    voice-handler.ts          # 语音消息处理
    video-handler.ts          # 视频消息处理
    location-handler.ts       # 位置消息处理
    link-handler.ts           # 链接消息处理
    event-handler.ts          # 事件处理
    default-handler.ts        # 默认兜底处理
  platforms/
    wechat/                   # 微信个人账号适配器
    feishu/                   # 飞书适配器
    dingtalk/                 # 钉钉适配器
  utils/
    xml.ts                    # XML 解析工具
    crypto.ts                 # 加密签名工具
test/                         # 单元测试
```

## 运行测试

```bash
npm test
```
