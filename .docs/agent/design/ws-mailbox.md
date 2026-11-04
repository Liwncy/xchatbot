# 方案：agent 入站改走 WebSocket 邮箱（Durable Object）

状态：服务端（步骤 1、2 + `/admin/status`）和 openclaw 通道 ws 客户端（步骤 3）已实现，本地端到端通过（web 适配器 → pipeline → 邮箱 → 通道 → ack）；未部署，未在真实 OpenClaw gateway 里跑过。

已定决策：

- 不加 `ws` 依赖。服务端用 Workers 原生 `WebSocketPair` + Upgrade；通道客户端用 Node 全局 `WebSocket`。
- TTL 30 分钟，**每条消息固定到期，不做滑动续期**（TTL 是消息的，不是会话状态；续期会让卡住的消息永远不死）。
- 离线入队默认关。
- 加 `GET /admin/status`。

## 1. 为什么做

| 痛点 | 现状 | 做完之后 |
|---|---|---|
| agent 离线丢消息 | `forwardXbotInbound` 失败只 warn，`return null` | 消息留在队列，上线补发，超时丢弃 |
| agent 必须有公网地址 | Worker `fetch {baseUrl}/api/channels/xbot/inbound`，靠隧道 | agent 主动连出来，不需要公网地址 |
| 入站 HTTP 挂整轮 agent | 通道 `handleInbound` 等 agent 跑完才返回，Worker 一直等 | 入队即 ACK，Worker 立刻返回 |
| 无重试、无去重 | 一次 `fetch` | 服务端 ACK 重试，`messageId` 去重 |

参考：`openclaw-bncr-channel` 的 outbox + ACK + 重试。只借「队列 + ACK + 重试」，不借 SQLite 场景管理、快照自愈、`/bncr` 命令。

## 2. 范围

做：

- 只改**入站**（xchatbot → agent）。
- 先只做 openclaw 通道。
- 保留 HTTP 直推，作为兜底。

不做：

- 出站不动。agent 仍然 `POST {xchatbot}/openclaw/outbound`。
- hermes / qwenpaw / snailai 先不动，仍走 HTTP。
- 不做出站 ACK、不做死信补发（见第 10 节）。

## 3. 总览

```text
适配器 → pipeline → openclaw agent 插件
                      │
                      ▼  forwardXbotInbound
              ┌───────────────┐
              │ 决策（见 §6） │
              └──┬─────────┬──┘
        ws 在线  │         │ 不在线且有 baseUrl
                 ▼         ▼
      AgentMailbox DO     HTTP 直推（现状）
      (SQLite 队列)
                 │ WebSocket（Hibernation）
                 ▼
        openclaw 通道（ws 客户端）
                 │ 先 ACK，再跑 agent
                 ▼
        POST {xchatbot}/openclaw/outbound（不变）
```

## 4. Durable Object：`AgentMailbox`

- 绑定名 `AGENT_MAILBOX`，SQLite 后端。
- 实例名 = `brain_key`（`idFromName`）。同一个 brain 的消息天然串行。
- **必须用 Hibernation API**（`ctx.acceptWebSocket`、`webSocketMessage`、`webSocketClose`）。不用 `ws.accept()`。
  - 原因：常驻连接按 `86,400s × 0.125GB = 10,800 GB-s/天` 计，占免费时长 83%。
- 心跳用 `ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))`，不唤醒 DO，不计请求。
- DO 内**不用** `setTimeout` / `setInterval`，否则无法休眠。重试统一走 `alarm()`。
- 同一 brain 只保留一条连接。新连接进来，关掉旧的（close code `4000`）。

### 4.1 表

```sql
CREATE TABLE IF NOT EXISTS mailbox (
  id          TEXT PRIMARY KEY,   -- messageId，同时用于去重
  payload     TEXT NOT NULL,      -- 原样的 inbound JSON（与 HTTP 直推 body 相同）
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,   -- created_at + TTL
  attempts    INTEGER NOT NULL DEFAULT 0,
  next_at     INTEGER NOT NULL    -- 下次可发送时间
);
CREATE INDEX IF NOT EXISTS idx_mailbox_next ON mailbox(next_at);
```

- ACK 后直接 `DELETE`，不留历史。表里只有「未确认」的消息。
- 不存对话内容以外的东西，不存 token。

### 4.2 对外方法（RPC，Worker 调用）

| 方法 | 说明 |
|---|---|
| `enqueue(messageId, payloadJson, {ttlMs, queueIfOffline})` | 在线：入队并立刻推送。离线：默认不入队，返回 `{accepted:false, reason:'offline'}`，由 Worker 回退 HTTP。队里已有同 id 返回 `{accepted:true, duplicate:true}`。队满（200 条）返回 `reason:'full'` |
| `status()` | `{connected, sockets, connectedAt, helloAt, client, version, pending, oldestAt}` |
| `fetch(request)` | 处理 WebSocket 升级 |

「在线」和入队放在同一次 RPC 里判断，不用两次调用。去重只覆盖「还没 ack」的消息；已 ack 删掉的不记，所以通道侧也要有自己的 `messageId` 去重。

### 4.3 帧格式（JSON，文本帧）

服务端 → 客户端：

```json
{ "t": "msg", "id": "<messageId>", "payload": { /* 同 HTTP inbound body */ } }
```

客户端 → 服务端：

```json
{ "t": "hello", "client": "openclaw-xbot", "version": "0.1.0" }
{ "t": "ack", "id": "<messageId>" }
```

心跳：文本 `ping` / `pong`，由 auto-response 处理。

### 4.4 发送与重试

- 客户端 `hello` 之后，DO 把 `next_at <= now` 的未过期消息按 `created_at` 顺序全部发出，并 `attempts += 1`、`next_at = now + backoff(attempts)`。
- `backoff`：`attempts` 1/2/3 → 5s / 15s / 45s。
- `alarm()`：取最近的 `next_at` 设置。触发时重发未 ACK 的消息。
- 第 3 次发出并等满 45s 仍无 ACK，或 `expires_at <= now`：直接 `DELETE` 并记 warn 日志（见第 10 节）。
- 没有在线连接时，`alarm()` 只清理过期行，不重发。
- TTL 默认 **30 分钟**，每条固定，不续期。可配置，见第 8 节。
- 注意：在线时一条消息最多活约 65 秒（5 + 15 + 45）就会因重试耗尽被丢，TTL 只在**离线入队开启**时才起作用。

## 5. ACK 语义

**ACK 表示「通道已收下并去重」，不表示「agent 已回复」。**

- 通道收到 `msg` 后，立刻做 `messageId` 去重，然后回 `ack`，再异步跑 agent。
- 这样 Worker 侧不用等整轮 agent。
- 取舍：通道在 ACK 之后、agent 跑完之前崩溃，这条消息不会重来。这和现在 HTTP 超时丢消息的行为一致，不比现状差。

## 6. `forwardXbotInbound` 的决策

只改 openclaw 插件路径，其他 agent 不受影响。

```text
1. brain.transport 不是 'ws'          → HTTP（现状）
2. 调 DO.enqueueIfLive(...)
   ├─ accepted                         → 返回 handledReply()
   ├─ offline 且 brain.baseUrl 有值     → HTTP（兜底）
   ├─ offline 且无 baseUrl              → 返回 null（和现在「没配齐」一致）
   └─ 抛错（含免费额度用尽）            → baseUrl 有值则 HTTP，否则 null
```

关键规则：**同一条消息只走一条路**。入队成功就不再走 HTTP，避免重复投递。

「离线时也入队，等上线补发」是第二阶段的选项，默认关闭（见第 8 节 `ws-queue`）。原因：群聊里「几分钟前的问题」补发后通常答非所问。

## 7. WebSocket 接入与鉴权

- 路径：`GET /agent/ws?brain=<brain_key>`，`Upgrade: websocket`。
- 在 `src/app.ts` 加一条路由，放在调试转发**之前**（WebSocket 要在生产邮箱上落地）。
- 鉴权在 **Worker 里、转发给 DO 之前**做：Bearer token 与 `/openclaw/outbound` 同一把（`authorizeOpenClawRequest`），通道本来就配了 `xchatbotToken`，不用多配一个。未通过直接 401，不唤醒 DO。
- `brain` 要存在、已启用、`kind = openclaw`，否则 404。
- Token 不放 URL，放 `Authorization` 头。
- Node 全局 `WebSocket` 的第二个参数可以带 `{headers}`：已在 Node 24 上验证。**Node 22 未验证**，通道开发时先在目标 Node 版本上跑一遍；万一不行，退路是 `Sec-WebSocket-Protocol` 带 token，不加依赖。

## 8. 配置

`agent_brain` 加一列，沿用 `agent_kind` 的 `ALTER TABLE` 兜底写法：

| 列 | 默认 | 含义 |
|---|---|---|
| `transport` | `'http'` | `'http'`：现状。`'ws'`：优先 WebSocket，离线回退 HTTP |

环境变量（可选）：

| 变量 | 默认 | 含义 |
|---|---|---|
| `AGENT_WS_TTL_MS` | `1800000` | 队列消息过期时间（上限 24 小时） |
| `AGENT_WS_QUEUE_OFFLINE` | `false` | 离线时是否入队等补发 |

打开某个大脑的 ws（`agent_brain` 是几行的配置表，按主键更新）：

```sql
UPDATE agent_brain SET transport = 'ws' WHERE brain_key = 'openclaw';
```

改回 `'http'` 即回到现状。

`wrangler.toml`：

```toml
[[durable_objects.bindings]]
name = "AGENT_MAILBOX"
class_name = "AgentMailbox"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["AgentMailbox"]
```

## 9. 改动清单

xchatbot：

| 文件 | 改动 |
|---|---|
| `wrangler.toml` | DO 绑定 + 迁移 |
| `src/types/env.ts` | `AGENT_MAILBOX: DurableObjectNamespace<AgentMailbox>` |
| `src/index.ts` | `export {AgentMailbox}` |
| `src/core/agent-mailbox.ts`（新） | DO 类 |
| `src/app.ts` | `/agent/ws`、`/admin/status` 路由（都在调试转发之前） |
| `src/plugins/agent/ws-gateway.ts`（新） | `/agent/ws` 鉴权并转给邮箱 |
| `src/debug/status.ts`（新）、`src/debug/admin.ts` | `/admin/status`；`authorizeAdmin` 导出复用 |
| `src/core/brain-store.ts` | `transport` 列、`BrainConnection.transport`、`listBrains` |
| `src/plugins/agent/xbot-inbound.ts` | 按第 6 节决策（`mailboxBrainKey`） |
| `src/plugins/agent/openclaw/index.ts` | `transport = ws` 时允许没有直推地址 |

### `/admin/status`

`GET /admin/status[?brain=<brain_key>]`，鉴权同 `/admin/debug`（设了 `ADMIN_TOKEN` 才要 Bearer）。返回每个大脑的 `transport`、是否有 HTTP 兜底，以及邮箱状态。只查 `transport = ws` 或 `?brain=` 点名的大脑，其余不碰 DO，不返回任何 token。

xbot-channel/openclaw：

| 文件 | 改动 |
|---|---|
| `src/ws-client.ts`（新） | 连接、`hello`、收 `msg`、去重、`ack`、重连 |
| `src/register.ts` | `start()` 里起 ws 客户端，`stop()` 里关 |
| `src/config.ts` | 可选 `wsEnabled`，默认跟随 `xchatbotApiBaseUrl` |
| `src/inbound.ts` | 不改。ws 收到的 payload 直接走 `parseXbotInboundParams` |

客户端行为：

- 地址：`wss://{xchatbotApiBaseUrl 去掉协议}/agent/ws?brain=<key>`。
- 重连：指数退避 1s → 30s，带抖动。
- 去重：近 N 分钟的 `messageId` 做 TTL `Map`，命中直接 `ack`，不再跑 agent。
- 收到 `msg` → 去重 → `ack` → 异步调现有的 `handleInbound` 逻辑。
- 保留 HTTP `/api/channels/xbot/inbound` 路由不变，作为兜底通路。

## 10. 已知限制（第一版不解决）

1. 重试耗尽后丢弃，不回退 HTTP。可以作为第二阶段：`alarm()` 里对 dead 消息尝试一次 HTTP。
2. 只有 openclaw。其他三个 agent 各需要一个 ws 客户端，hermes / qwenpaw 是 Python，要单独写。
3. 免费档额度用尽后 DO 操作会报错，靠第 6 节的回退兜住，但回退前提是配了 `baseUrl`。纯隧道外网不可达的部署会直接丢。
4. 出站没有 ACK。`/openclaw/outbound` 失败时通道只重试 HTTP（另行改，不在本方案内）。

## 11. 额度估算（免费档）

假设每天 5,000 条消息进 agent：

| 项 | 用量 | 占 100,000 请求/天 |
|---|---|---|
| Worker → DO 入队 | 5,000 | 5% |
| 客户端 ACK（20:1 计费） | 约 250 | 0.3% |
| 重试 alarm（假设 5%） | 约 250 | 0.3% |

时长：每条约 50ms、128MB，约 30 GB-s，占 13,000 GB-s 的 0.2%。前提是 Hibernation。

## 12. 实施顺序

| 步 | 内容 | 估时 |
|---|---|---|
| 1 | ✅ DO 骨架：绑定、迁移、`AgentMailbox`、`/agent/ws`、ACK、alarm 重试 | 半天 |
| 2 | ✅ `transport` 列 + `forwardXbotInbound` 决策 + HTTP 回退 + `/admin/status` | 2 小时 |
| 3 | ✅ openclaw 通道 ws 客户端 + 去重 + 重连（`xbot-channel/openclaw/src/ws-client.ts`） | 半天 |
| 4 | 联调：真实 gateway 里的断线重连、被顶掉、DO 报错回退、额度用尽（本地已测连接/推送/ack/清空/停止） | 2 小时 |
| 5 | 把一个 brain 的 `transport` 切到 `ws`，观察 | 1 天观察 |

每一步都可以单独上线，`transport` 默认 `http`，不切就没有行为变化。

## 13. 测试要点

- ws 在线：消息经 DO 到通道，收到 `ack`，`mailbox` 表为空。
- ws 断开：回退 HTTP，且不重复投递。
- 通道不回 `ack`：5s/15s/45s 重发 3 次后丢弃。
- 同一 `messageId` 入队两次：只发一次。
- 新连接顶掉旧连接：旧连接收到 close `4000`，不重复收消息。
- DO 抛错：回退 HTTP。
- 鉴权失败：401，DO 没有被唤醒。
- 空闲 10 分钟：DO 已休眠（看 GB-s 用量）。

## 14. 待确认

1. Node 22 全局 `WebSocket` 带 `Authorization` 头：Node 24 已验证，Node 22 待验证。
2. ~~默认 TTL~~：已定 30 分钟，固定不续期。
3. ~~离线入队~~：已定默认不开。
4. ~~`/admin/status`~~：已加。
