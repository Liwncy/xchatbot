# OpenClaw 小聪明儿 workspace 模板

把本目录内容复制到 OpenClaw workspace，即可启用「人设 + MCP 办事 + 协议回复」。

## 安装

```powershell
$src = "D:\Workspace\mygithub\xchatbot\_docs\templates\openclaw\workspace"
$dst = "$env:USERPROFILE\.openclaw\workspace"

Copy-Item "$src\SOUL.md" "$dst\SOUL.md" -Force
Copy-Item "$src\skills" "$dst\skills" -Recurse -Force
```

然后重启 gateway：

```bash
openclaw gateway restart
```

## 目录说明

| 路径 | 作用 |
|------|------|
| `SOUL.md` | 人设底子；含身份前缀 / owner 认人 |
| `skills/mcp-tools/SKILL.md` | 何时调 CF MCP、怎么填参数 |
| `skills/outbound-reply/SKILL.md` | 图 / 语音 / 链接卡等怎么写成协议行 |

**办事**：先读 `mcp-tools`，再调已挂到 OpenClaw 的 CF MCP。不要调用已删除的 `xbot_learn_write` / `xbot_chat_history`。  
**发出去**：非纯文本按 `outbound-reply` 写 `image:` / `audio:` / `link:` 等单独一行。  
话风只看 `SOUL.md`，没有可切换的说话模式 skill。

群聊门禁在 xchatbot，对齐 one-agbot：默认歇着，主人发「开始」后才聊。默认点名（@ / 提名字 / 引用我）；主人可改「随机模式」「智能模式」「全量模式」「规则模式」，以及「概率 20」「跟聊 60」。能进 Agent 的消息按语境直接回，不要再判断有没有点名。

## 身份规则

正文前缀由 xchatbot 盖上。认李芈仙看 wxid 或本条 `owner`，聊天里不暴露 wxid。改 id 时同步 `wrangler.toml` 和 `SOUL.md`。
