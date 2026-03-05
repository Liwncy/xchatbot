# xchatbot

> 部署在 Cloudflare Workers 上的多平台消息处理机器人

## 功能特性

- **多平台支持**：微信公众号（WeChat）、飞书（Feishu）、钉钉（DingTalk）
- **消息类型分发**：文本、图片、语音、视频、位置、链接、事件等
- **可扩展架构**：通过注册自定义 Handler 扩展处理逻辑
- **安全验证**：各平台 Webhook 签名验证
- **零依赖运行时**：基于 Cloudflare Workers 原生 API（Web Crypto、Fetch）

## 架构说明

```
请求入口（Cloudflare Workers）
       │
       ▼
平台适配层（Platform Adapter）
  ├─ /webhook/wechat   → 微信公众号适配器
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

## 快速开始

### 安装依赖

```bash
npm install
```

### 本地开发

在项目根目录新建 `.dev.vars` 文件，写入环境变量（参考 `wrangler.toml`）：

```ini
WECHAT_TOKEN=your_wechat_token
WECHAT_APP_ID=your_wechat_app_id
WECHAT_APP_SECRET=your_wechat_app_secret
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
wrangler secret put FEISHU_ENCRYPT_KEY
```

## Webhook 地址

| 平台     | 路径                     |
| -------- | ------------------------ |
| 微信公众号 | `https://<worker>.workers.dev/webhook/wechat`   |
| 飞书      | `https://<worker>.workers.dev/webhook/feishu`   |
| 钉钉      | `https://<worker>.workers.dev/webhook/dingtalk` |
| 健康检查  | `https://<worker>.workers.dev/health`           |

## 自定义处理逻辑

修改 `src/handlers/` 目录下对应的 Handler，或使用 `registerHandler` 注册自定义处理器：

```typescript
import { registerHandler } from './src/router/index.js';

registerHandler('text', async (message, env) => {
  // 自定义文本消息处理逻辑
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
    event-handler.ts          # 事件处理（关注/取关/扫码等）
    default-handler.ts        # 默认兜底处理
  platforms/
    wechat/                   # 微信公众号适配器
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
