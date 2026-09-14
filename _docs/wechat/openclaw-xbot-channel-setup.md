# OpenClaw xbot 频道联调说明

OpenClaw 只连 xchatbot。微信 / Golem / Web 都由 xchatbot 适配器进出。

```text
适配器 → xchatbot webhook
       → POST /api/channels/xbot/inbound  （带 platform）
       → OpenClaw Agent
       → POST xchatbot /openclaw/outbound
       → 原适配器发出去
```

## 1. OpenClaw

```bash
openclaw plugins install D:\Workspace\mygithub\openclaw-xbot-channel
openclaw plugins enable xbot
openclaw gateway restart
```

`openclaw.json` 只配 xchatbot 地址和 token，见 [`../templates/openclaw/xbot-channel-config.sample.json`](../templates/openclaw/xbot-channel-config.sample.json)。

| 字段 | 说明 |
|------|------|
| `xchatbotApiBaseUrl` | Worker 公网根地址 |
| `xchatbotToken` | 与 Worker `AGENT_BRIDGE_TOKEN` / `XBOT_CHANNEL_GATEWAY_TOKEN` 相同 |

## 2. xchatbot

| 变量 | 说明 |
|------|------|
| `XBOT_CHANNEL_ENABLED` / `XBOT_CHANNEL_AUTO_FORWARD` | 都为 `true` 才转发 |
| `XBOT_CHANNEL_GATEWAY_URL` | 可选；默认从 `AGENT_BRIDGE_BASE_URL` 去掉 `/v1` |
| `AGENT_BRIDGE_TOKEN` | Gateway 入站鉴权，也用于 `/openclaw/outbound` |

私聊白名单、官方号在适配器拦。群聊启停和点名 / 随机 / 智能 / 规则在 `group-session`。

## 3. 自检

```bash
curl -sS https://openclaw.example.com/api/channels/xbot/inbound \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "messageId":"smoke-1",
    "platform":"golem",
    "source":"private",
    "from":"wxid_owner",
    "content":"ping"
  }'
```

出站由频道打 Worker `/openclaw/outbound`，Gateway 要能访问 Worker 公网。

## 4. 常见问题

**不回消息**

- `xchatbotApiBaseUrl` 必须是 Worker 公网，不是 Golem
- `xchatbotToken` 要和 Worker Bearer 一致
- 本机 Gateway 出网要能打到 Worker

**私聊 / 官方号乱进**

- 在适配器拦，不在频道里拦
