# xchatbot

Cloudflare Worker 上的薄核：收 Golem 微信协议，按 **channel → command → agent** 调度插件。玩法在 `cf-mcp-tools`。

旧代码冻在 `archive/pre-plugin-core`。当前工作分支是 `rebuild/plugin-core`。

## 一条消息

```text
/webhook/wechat
  → Golem 验签 / 解析
  → channel 插件（撤回）
  → command 插件（修仙 → MCP）
  → agent 插件（OpenClaw）
  → Golem 发出
```

## 第一刀插件

- `wechat-revoke`：引用机器人消息再发「撤回」
- `xiuxian`：口令以「修仙」开头，转 `xiuxian_action`
- `openclaw`：前两级没接住再转发 Gateway

停用某个插件：往 KV `plugins:runtime:disabled` 写 JSON 数组，例如 `["openclaw"]`。

## 本地

```bash
npm install
npm run typecheck
npm run dev
```

Golem webhook 路径仍是 `/webhook/wechat`，绑定和 secrets 未改。`main` 仍是线上旧树，在新链路跑通前不要从本分支 deploy。
