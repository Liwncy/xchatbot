# 共用的人设和技能

四颗大脑吃同一份正文。话风、每轮怎么干活、发出去的协议行，都在这里，不绑 OpenClaw。

| 路径 | 作用 |
|---|---|
| `IDENTITY.md` | 名片。名字、气质、自己的 id |
| `USER.md` | 主人是谁、怎么称呼、他的 id |
| `SOUL.md` | 话风。短句、被怼、模型彩蛋 |
| `AGENTS.md` | 每轮怎么干活。读消息、办事、手机、红线 |
| `mcp.sample.json` | 两台 MCP 怎么接上。不是提示词 |
| `skills/outbound-reply/SKILL.md` | 图、语音、链接卡怎么写成一行协议 |

`MEMORY.md`、`memory/`、`DREAMS.md` 是运行时写的，不放在这里。群里的印象走 xchatbot 的记忆卡。

OpenClaw 按文件名自己读。拷这四份和技能即可：

```powershell
$src = "D:\Workspace\mygithub\xchatbot\.docs\agent\shared"
$dst = "$env:USERPROFILE\.openclaw\workspace"

foreach ($name in 'IDENTITY.md','USER.md','SOUL.md','AGENTS.md') {
    Copy-Item "$src\$name" "$dst\$name" -Force
}
Copy-Item "$src\skills" "$dst\skills" -Recurse -Force
```

然后 `openclaw gateway restart`。

DSH 只把 profile 里的 `SOUL.md` 读进系统提示，Hermes 只读 `~/.hermes/SOUL.md`。`xbot-channel\harness\sync-assets.ps1` 会把上面四份拼进这两个文件，OpenClaw 仍是四份原样拷贝，再同步技能。改完跑一遍即可。DSH 不用重启；OpenClaw 要 `openclaw gateway restart`；Hermes 下一轮会读到新的 `SOUL.md`。

工具怎么填看 MCP 自己的说明。何时调看 `AGENTS.md`。话风只看 `SOUL.md`。发出去的不是纯文字时，按 `outbound-reply` 写 `image:` / `audio:` / `link:`。

群聊门禁、人格口令、身份前缀都在 xchatbot，不在某颗大脑里。改主人 id 时同步 `wrangler.toml`、`USER.md` 和 `IDENTITY.md`。
