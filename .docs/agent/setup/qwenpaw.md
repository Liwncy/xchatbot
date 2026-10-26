# QwenPaw 大脑联调

自然语言仍走 xchatbot 门禁、`#` 口令和 `buildInboundContent`。只把拼好的正文 POST 到 QwenPaw 的 xbot 频道。

当前走哪颗不看配置文件。会话和平台写在 KV，默认是 D1 `agent_brain.is_default`。第一次建表默认是 OpenClaw。主人说 `#脑子 全部 qwenpaw` 才把默认换成这颗；只换这个会话用 `#脑子 qwenpaw`（也认 `qwen-paw` / `agentscope`）。

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
| `QWENPAW_BASE_URL` | QwenPaw 公网根，例如 trycloudflare。第一次建表抄进 D1 |
| `QWENPAW_TOKEN` | 入站 Bearer；未设则回退 `AGENT_BRIDGE_TOKEN` |
| `XBOT_CHANNEL_ENABLED` | 仍须 `true` |

trycloudflare 域名会变。表还没有这一行时，改 `QWENPAW_BASE_URL` 再部署就会抄进去；行已经在了，要改 D1 里的 `base_url`。正式用 named hostname。

## 3. 自检

```bash
npx tsc --noEmit
npx tsx scripts/check/snailai-check.ts
```

QwenPaw 侧：

```bash
python selfcheck.py
```
