# xchatbot

Cloudflare Worker 上的薄核：收协议、做门禁、拼给大脑的正文。玩法 MCP 在 `cf-mcp-tools`，通道记录和表情库 MCP 在本 Worker `/mcp`。

## 分工

| 层 | 职责 | 不负责 |
|---|---|---|
| 适配器 | 解析 / 发出（Golem、Web） | 门禁、人格、大脑 |
| channel | 群门禁、`#` 口令（查记录/日志、人格、撤回、开机） | 拼正文、调模型 |
| command | `#` 快捷调用 MCP 工具；未识别的 `#` 口令 | 自然语言办事 |
| core | 身份前缀、近窗上下文、人格垫、查记录 | 某个大脑的协议 |
| agent | 把已拼好的正文交给当前大脑 | 口令、门禁、人格绑定 |
| MCP | `cf-mcp-tools` 画图等；本 Worker `/mcp` 查记录、查运行日志、表情库 | 出站协议 |

## 一条消息

```text
适配器 parse
  → channel（门禁 / #口令）
  → command（# 快捷调用 MCP / 未识别 #口令）
  → core 拼正文
  → agent（OpenClaw / SnailAI / QwenPaw / Hermes，由 AGENT_BRAIN 切换）
  → 适配器 send
```

停用某个插件：往 KV `plugins:runtime:disabled` 写 JSON 数组，例如 `["openclaw"]`。切大脑用 `AGENT_BRAIN`，不必停插件。

大脑安装在 [`.docs/agent/setup/`](.docs/agent/setup/openclaw.md)，共用的人设和技能在 [`.docs/agent/shared/`](.docs/agent/shared/README.md)。人格 SQL 在 [`.docs/sql/persona.sql`](.docs/sql/persona.sql)。

## 本地

```bash
npm install
npm run typecheck
npm run dev
```

Golem webhook 路径仍是 `/webhook/wechat`，绑定和 secrets 未改。`main` 仍是线上旧树，在新链路跑通前不要从本分支 deploy。
