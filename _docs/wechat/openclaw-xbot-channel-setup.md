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
| `chatLogApiBaseUrl` | 可不填；默认复用 `wechatApiBaseUrl` |
| `chatLogAdminToken` | `xchatbot` Worker 的 `ADMIN_TOKEN`，给 OpenClaw 查 D1 聊天记录用 |
| `botWechatId` | `wxid_ahl9az25aljx22` |
| `groupAllowFrom` | 联系人群 `roomId@chatroom` 列表 |

`groupPolicy=allowlist` 时，OpenClaw 只处理白名单群；xchatbot 侧还有 D1 白名单：群用 `/cm add-group`，私聊用 `/cm add-user`，两层都过才会转发。公众号不进。

### 检查频道状态

```bash
openclaw channels status --channel xbot
```

## 2. xchatbot Worker 侧

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `XBOT_CHANNEL_ENABLED` | 是 | `true` 启用 xbot 频道能力 |
| `XBOT_CHANNEL_AUTO_FORWARD` | 否 | `true` 时启用 OpenClaw 入口插件：本地插件没接住，再桥接到 `xbot.inbound`；默认关闭 |
| `AGENT_BRIDGE_BASE_URL` | 是* | 如 `https://openclaw.lwcorspro.dpdns.org/v1` |
| `AGENT_BRIDGE_TOKEN` | 是* | Gateway Bearer Token（`wrangler secret`） |
| `XBOT_CHANNEL_GATEWAY_URL` | 否 | 默认从 `AGENT_BRIDGE_BASE_URL` 去掉 `/v1` |
| `XBOT_CHANNEL_GATEWAY_TOKEN` | 否 | 默认同 `AGENT_BRIDGE_TOKEN` |
| `XBOT_CHANNEL_ALLOW_OFFICIAL` | 否 | `true/1/on` 时放行公众号/系统号（默认拦截） |
| `WECHAT_API_BASE_URL` | 是 | 供 connect 时传给 OpenClaw 出站 |
| `ADMIN_TOKEN` | 建议 | 给 `/admin/chat-log/query` 这类管理接口鉴权；OpenClaw 查群记录时复用 |
| `BOT_WECHAT_ID` | 建议 | 群聊点名检测（@ 或正文含昵称） |

\* 已配置 agent-bridge 时可复用。

### 本地开发（`.dev.vars`）

```ini
XBOT_CHANNEL_ENABLED=true
XBOT_CHANNEL_AUTO_FORWARD=false
AGENT_BRIDGE_BASE_URL=https://openclaw.lwcorspro.dpdns.org/v1
AGENT_BRIDGE_TOKEN=<gateway-token>
ADMIN_TOKEN=<admin-token>
# 可选：放行公众号/系统号
# XBOT_CHANNEL_ALLOW_OFFICIAL=true
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

1. 默认：消息先走 xchatbot 本地插件链
2. 若 `XBOT_CHANNEL_AUTO_FORWARD=true` 且配置完整 → `openclaw-xbot` 入口插件会在本地插件链中兜底，把消息桥接到 `xbot.inbound`
3. OpenClaw 返回 `dispatched=true / accumulated=true` 时，视为它已接管，本地不再继续匹配后续插件
4. 自动桥接关闭、策略忽略（如群未 @）或 Gateway 失败 → 继续留在本地插件链路

日志关键词：`OpenClaw xbot.inbound 结果`、`OpenClaw xbot.connect 失败，继续尝试插件转发`、`OpenClaw xbot 插件转发失败，回退后续插件`。

## 5. OpenClaw 查群记录

装好新版 `xbot` 插件后，OpenClaw 会多一个 `xbot_chat_history` 工具，用来查 `xchatbot` D1 里的聊天记录。

常见用法：

- 在当前微信群会话里直接查最近 30 条：让 OpenClaw 调 `xbot_chat_history({ limit: 30 })`
- 查最近 24 小时：`xbot_chat_history({ hours: 24, limit: 80 })`
- 只看群成员发言：`xbot_chat_history({ actorType: "member", hours: 72 })`
- 指定群查一段时间：`xbot_chat_history({ roomId: "123456@chatroom", since: "2026-07-14T00:00:00+08:00", until: "2026-07-17T23:59:59+08:00" })`

要让它能查，需要两边都配好：

- Worker 侧有 `ADMIN_TOKEN`
- OpenClaw 侧 `channels.xbot.chatLogAdminToken` 填同一个值
- `channels.xbot.chatLogApiBaseUrl` 不填时，会默认走 `wechatApiBaseUrl`

## 6. 常见问题

**Worker 连不上 Gateway**

- Cloudflare Worker 出网需能访问 OpenClaw 公网地址；本机 Gateway 要隧道或反代。

**OpenClaw 不回微信**

- 检查 `channels.xbot.wechatApiBaseUrl` 是否等于 `WECHAT_API_BASE_URL`
- Gateway 从 Worker 内网能否访问微信网关

**私聊 / 公众号乱回**

- 私聊也要 D1 白名单：`/cm add-user wxid_xxx`（新 sync 的个人默认关闭）
- 默认公众号 / `gh_*` / 系统号不进；要放行可设 `XBOT_CHANNEL_ALLOW_OFFICIAL=true`
- 主人旁路仍有效；别人私聊未加白不会转发 OpenClaw，也不会走本地插件
- 若以前 sync 过，库里可能仍有 `enabled=1` 的好友，用 `/cm list` 看，多余的用 `/cm disable-user` 关掉

**群消息没反应**

- OpenClaw：`groupReplyMode` / `requireMention` + `groupAllowFrom`
- xchatbot：D1 联系人群白名单（`/cm add-group`）；主人旁路不等于群已加白
- 正文需 @ 机器人、提到机器人昵称，或入站带 `botMentioned: true`
- `mention` 模式下未点名会返回 `accumulated=true`（只攒历史不回复），属正常

**群里别人说话 Gateway 看不见 / 点名才有上下文**

- 已按 BNCR 做 pending 历史：未点名消息会攒在 Gateway 内存（默认 50 条），点名时注入 Agent
- `historyForce`（默认开）：窗满会静默 flush 进 session（微信不回，reason=`history-flush`），Gateway 里能看到批次上下文
- 需重装 xbot 插件并重启 Gateway；Worker 需部署（`accumulated` 时不再回退本地插件）
- 当天全量统计仍靠 D1 `chat_log`，不是这 50 条短窗

**Gateway 有两条回复，微信只收到最后一条**

- xbot 插件默认已开 **block streaming**（调 Skill 前的说明会先发微信）
- 更新插件后需 `openclaw plugins install …` 并 `openclaw gateway restart`
- 若仍只要最终一条，可在配置设 `channels.xbot.blockStreaming: false`

**与 agent-bridge 冲突**

- 现在都走插件顺序：显式命令插件可放前面，`openclaw-xbot` 作为兜底入口。
- 若你要让 OpenClaw 更主动接管，就把 `openclaw-xbot` 放到更靠前的位置，或开启 `XBOT_CHANNEL_AUTO_FORWARD=true`。

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
