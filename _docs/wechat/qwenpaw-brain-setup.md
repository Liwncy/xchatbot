# QwenPaw 大脑联调

自然语言仍走 xchatbot 门禁、`#` 口令和 `buildInboundContent`。只把拼好的正文 POST 到 QwenPaw 的 xbot 频道。

默认大脑仍是 OpenClaw。当前 wrangler 若写成 `AGENT_BRAIN = "qwenpaw"` 才会切过去。

**不要开 QwenPaw 自带微信。**

## 1. 上传频道插件

仓库：`qwenpaw-xbot-channel`。在 [AgentScope Platform](https://platform.agentscope.io/deploy) 控制台 Plugin Manager 上传 Zip（`plugin.json` 在压缩包根目录）。

装好后打开频道 **Xbot**：

| 字段 | 说明 |
|------|------|
| xchatbot 地址 | Worker 公网，例如 `https://xbot.lwcfworker.dpdns.org` |
| xchatbot Token | 与 Worker `AGENT_BRIDGE_TOKEN` 相同 |
| 入站 Token | 可空，空则同 xchatbot Token |

## 2. xchatbot

| 变量 | 说明 |
|------|------|
| `AGENT_BRAIN` | `qwenpaw`（也认 `qwen-paw` / `agentscope`） |
| `QWENPAW_BASE_URL` | QwenPaw 公网根，例如 trycloudflare |
| `QWENPAW_TOKEN` | 入站 Bearer；未设则回退 `AGENT_BRIDGE_TOKEN` |
| `XBOT_CHANNEL_ENABLED` | 仍须 `true` |

trycloudflare 域名会变，变了改 `QWENPAW_BASE_URL` 再 deploy。正式用 named hostname。

## 3. 自检

```bash
npx tsc --noEmit
npx tsx scripts/snailai-check.ts
```

QwenPaw 侧：

```bash
python selfcheck.py
```
