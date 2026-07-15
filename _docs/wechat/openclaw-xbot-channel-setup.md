# OpenClaw xbot 频道联调说明

把 xchatbot 微信入站接到 OpenClaw Agent，出站仍走现有微信网关 API（`WECHAT_API_BASE_URL`）。

## 架构

```text
微信 → 微信网关 → xchatbot Worker (/webhook/wechat)
                → OpenClaw Gateway (/api/channels/xbot/inbound)
                → Agent
                → 微信网关 (/api/message/text)
                → 微信
```

与 `agent-bridge`（「聪明办事」手动触发）并存：

| 能力 | agent-bridge | xbot 频道 |
|------|--------------|-----------|
| 触发 | 主人发「聪明办事」 | 私聊 / 群聊 @（按策略） |
| 协议 | OpenAI `/v1/chat/completions` | Gateway `xbot.inbound` |
| 出站 | xchatbot 本地发微信 | OpenClaw 调 `WECHAT_API_BASE_URL` |

## 1. OpenClaw 侧

### 安装频道插件

```bash
openclaw plugins install D:\Workspace\mygithub\openclaw-xbot-channel
openclaw plugins enable xbot
openclaw gateway restart
```

### 写入频道配置

参考 [`../templates/openclaw/xbot-channel-config.sample.json`](../templates/openclaw/xbot-channel-config.sample.json)，合并进 OpenClaw 配置：

| 字段 | 本环境示例 |
|------|------------|
| `wechatApiBaseUrl` | `https://wxbot.lwcorspro.dpdns.org`（与 Worker `WECHAT_API_BASE_URL` 一致） |
| `botWechatId` | `wxid_ahl9az25aljx22` |
| `groupAllowFrom` | 联系人群 `roomId@chatroom` 列表 |

`groupPolicy=allowlist` 时，OpenClaw 只处理白名单群；xchatbot 侧仍有 D1 联系人群白名单，两层都过才会转发。

### 检查频道状态

```bash
openclaw channels status --channel xbot
```

## 2. xchatbot Worker 侧

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `XBOT_CHANNEL_ENABLED` | 是 | `true` 开启转发 |
| `AGENT_BRIDGE_BASE_URL` | 是* | 如 `https://openclaw.lwcorspro.dpdns.org/v1` |
| `AGENT_BRIDGE_TOKEN` | 是* | Gateway Bearer Token（`wrangler secret`） |
| `XBOT_CHANNEL_GATEWAY_URL` | 否 | 默认从 `AGENT_BRIDGE_BASE_URL` 去掉 `/v1` |
| `XBOT_CHANNEL_GATEWAY_TOKEN` | 否 | 默认同 `AGENT_BRIDGE_TOKEN` |
| `WECHAT_API_BASE_URL` | 是 | 供 connect 时传给 OpenClaw 出站 |
| `BOT_WECHAT_ID` | 建议 | 群聊点名检测（@ 或正文含昵称） |

\* 已配置 agent-bridge 时可复用。

### 本地开发（`.dev.vars`）

```ini
XBOT_CHANNEL_ENABLED=true
AGENT_BRIDGE_BASE_URL=https://openclaw.lwcorspro.dpdns.org/v1
AGENT_BRIDGE_TOKEN=<gateway-token>
```

### 生产部署

```bash
# wrangler.toml 中设 XBOT_CHANNEL_ENABLED = "true"
wrangler secret put AGENT_BRIDGE_TOKEN
# 若 BASE_URL 不放 wrangler.toml，也可：
# wrangler secret put AGENT_BRIDGE_BASE_URL

npm run deploy
```

## 3. 连通性自检

在能访问 Gateway 的机器上：

```bash
# 1) 登记连接
curl -sS https://openclaw.lwcorspro.dpdns.org/api/channels/xbot/connect \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"smoke-test","connId":"smoke-test","wechatApiBaseUrl":"https://wxbot.lwcorspro.dpdns.org"}'

# 2) 模拟私聊入站
curl -sS https://openclaw.lwcorspro.dpdns.org/api/channels/xbot/inbound \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "messageId":"smoke-1",
    "source":"private",
    "from":"wxid_5jfnhtqy74xr22",
    "senderName":"主人",
    "conversationId":"wxid_5jfnhtqy74xr22",
    "type":"text",
    "content":"ping"
  }'
```

期望：`ok: true`，私聊通常 `dispatched: true`。

群聊需 `roomId`，且 `botMentioned: true`（正文 **@小聪明儿** 或 **提到「小聪明儿」**，与 ai-dialog 一致），群 ID 在 `groupAllowFrom` 中。

## 4. 运行时行为

1. webhook 收到消息后，若 `XBOT_CHANNEL_ENABLED=true` 且配置完整 → 先 `xbot.connect`
2. 每条白名单消息 → `xbot.inbound`
3. `dispatched=true` → **跳过**本地插件（避免双回复）
4. 策略忽略（如群未 @）或 Gateway 失败 → **回退**本地插件（点歌等仍可用）

日志关键词：`OpenClaw xbot.inbound 结果`、`OpenClaw xbot 频道已开启但配置不完整`。

## 5. 常见问题

**Worker 连不上 Gateway**

- Cloudflare Worker 出网需能访问 OpenClaw 公网地址；本机 Gateway 要隧道或反代。

**OpenClaw 不回微信**

- 检查 `channels.xbot.wechatApiBaseUrl` 是否等于 `WECHAT_API_BASE_URL`
- Gateway 从 Worker 内网能否访问微信网关

**群消息没反应**

- OpenClaw：`requireMention` + `groupAllowFrom`
- xchatbot：D1 联系人群白名单
- 正文需 @ 机器人、提到机器人昵称，或入站带 `botMentioned: true`

**与 agent-bridge 冲突**

- 频道接管后本地「聪明办事」仍可用；全量入站由 OpenClaw 处理时，不必再手动触发。

## 人设与说话模式

OpenClaw 用人设文件 + Skill 模式包，与本地 `ai-dialog` 的 `prompts` 对齐：

| 模板 | 说明 |
|------|------|
| [`../templates/openclaw/workspace/SOUL.md`](../templates/openclaw/workspace/SOUL.md) | 小聪明儿固定底子 |
| [`../templates/openclaw/workspace/skills/modes/`](../templates/openclaw/workspace/skills/modes/) | 可切换模式：`lcmm` `ysqq` `ghds` `gxwy` `normal` |

安装见 [`../templates/openclaw/workspace/README.md`](../templates/openclaw/workspace/README.md)。李芈仙在群里可 `切绿茶` / `/ysqq` / `恢复正常` 等临时换说话方式；`xcmer` 与 `lcmm` 同属绿茶，统一用 `/lcmm`。

## 相关仓库

- 频道插件：[`openclaw-xbot-channel`](https://github.com/lwc--/openclaw-xbot-channel)
- 参考实现：`reference/openclaw-bncr-channel`
