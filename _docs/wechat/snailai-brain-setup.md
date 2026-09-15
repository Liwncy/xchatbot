# SnailAI 大脑联调

自然语言仍走 xchatbot 门禁、`#` 口令和 `buildInboundContent`。只把拼好的正文交给 SnailAI，不替换 OpenClaw。

默认大脑仍是 OpenClaw。线上未配 `AGENT_BRAIN` 时行为不变。

## 切换

| 变量 | 说明 |
|------|------|
| `AGENT_BRAIN` | `openclaw`（默认）或 `snailai`（也认 `snail-ai` / `snail`） |
| `XBOT_CHANNEL_ENABLED` | 仍须 `true`。不需要 `XBOT_CHANNEL_AUTO_FORWARD`（那是 OpenClaw POST） |
| `SNAIL_AI_BASE_URL` | 服务根，例如 `https://host:8900`。已经是 `.../openapi/v1` 则原样用 |
| `SNAIL_AI_PREFIX` | 默认 `snail-ai` |
| `SNAIL_AI_APP_ID` / `SNAIL_AI_TOKEN` | 应用凭证，用 `wrangler secret` |
| `SNAIL_AI_AGENT_ID` | 默认 `1` |
| `SNAIL_AI_TIMEOUT_MS` | 同步对话超时，默认 `180000` |

Worker 要能访问 SnailAI 的公网地址。本机 `127.0.0.1:8900` 打不通。

回答走同步 `/agent/chat/sync`，webhook 等完整文本再 `parseRepliesFromText` 发出。图/语音/卡片协议行与 OpenClaw 相同。GIF 不上传附件。

群聊整群一个 openId / conversation；私聊按人。`#扮演` / `#不当了` 会丢掉当前 conversation，下一句新开。

## 自检

```bash
npx tsc --noEmit
npx tsx scripts/snailai-check.ts
```
