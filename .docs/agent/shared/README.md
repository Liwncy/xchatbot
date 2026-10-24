# 共用的人设和技能

四颗大脑吃同一份正文。人设、办事、怎么把图和语音写成协议行，都在这里，不绑 OpenClaw。

| 路径 | 作用 |
|---|---|
| `SOUL.md` | 人设。认人、口令、人格都按这份读 |
| `mcp.sample.json` | 两台 MCP：`cf-mcp-tools` 画图等，`xchatbot` 查记录和表情库 |
| `skills/mcp-tools/SKILL.md` | 何时调 MCP、怎么填参数 |
| `skills/outbound-reply/SKILL.md` | 图、语音、链接卡怎么写成一行协议 |

OpenClaw 要拷进它的 workspace：

```powershell
$src = "D:\Workspace\mygithub\xchatbot\.docs\agent\shared"
$dst = "$env:USERPROFILE\.openclaw\workspace"

Copy-Item "$src\SOUL.md" "$dst\SOUL.md" -Force
Copy-Item "$src\skills" "$dst\skills" -Recurse -Force
```

然后 `openclaw gateway restart`。别的大脑把同一份装进它们自己的技能目录。

办事先读 `mcp-tools`。画图、天气走 CF MCP；查记录和表情库走 xchatbot 的 `/mcp`。发出去的不是纯文字时，按 `outbound-reply` 写 `image:` / `audio:` / `link:`。话风只看 `SOUL.md`。

群聊门禁、人格口令、身份前缀都在 xchatbot，不在某颗大脑里。改主人 id 时同步 `wrangler.toml` 和 `SOUL.md`。
