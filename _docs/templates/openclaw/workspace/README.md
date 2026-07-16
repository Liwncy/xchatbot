# OpenClaw 小聪明儿 workspace 模板

把本目录内容复制到 OpenClaw workspace 即可启用「底子 + 可切换说话模式」。

## 安装

```powershell
$src = "D:\Workspace\mygithub\xchatbot\_docs\templates\openclaw\workspace"
$dst = "$env:USERPROFILE\.openclaw\workspace"

Copy-Item "$src\SOUL.md" "$dst\SOUL.md" -Force
Copy-Item "$src\skills\modes" "$dst\skills\modes" -Recurse -Force
```

然后重启 gateway：

```bash
openclaw gateway restart
```

## 模式一览

与 `ai-dialog-config.json` 的 `prompts` 对应关系：

| 斜杠 / 口令 | ai-dialog key | 说明 |
|-------------|---------------|------|
| `/lcmm`、切绿茶 | `lcmm`（默认） | 绿茶模式；`xcmer` 已合并到此，不单独建 Skill |
| `/ysqq`、切阴阳 | `ysqq` | 阴阳怪气 |
| `/ghds`、切拱火 | `ghds` | 拱火大师 |
| `/gxwy`、切国学 | `gxwy` | 国学文言 |
| `/normal`、恢复正常 | — | 卸掉模式，回到 SOUL 默认 |

## 用法

李芈仙在群里 @ 小聪明儿 后：

- `切绿茶` / `/lcmm`
- `阴阳怪气一点` / `/ysqq`
- `恢复正常` / `/normal`

每个微信群独立 session，在 A 群切的模式不影响 B 群。

群聊里 **@小聪明儿** 或正文 **提到「小聪明儿」**（与本地 ai-dialog 一致）都会算作点名，OpenClaw 在 `requireMention` 开启时也会接单。

## 新增永久模式

李芈仙可以说「加个毒舌模式 `/dushe`」——小聪明儿会走 **Skill Workshop** 提案，批准后写入 `skills/modes/` 并更新 `SOUL.md` 模式表。细则见 `SOUL.md`「新增永久模式」一节。临时调语气（「这遍毒舌点」）不必新建 Skill。

## 身份规则

OpenClaw 读 `SOUL.md` 里的认人说明；本地 ai-dialog fallback 仍走 `system-prompt.ts` 动态附录。两边原则一致：认李芈仙看 wxid，聊天里不暴露 wxid。改 id 时同步 `wrangler.toml` 和 `SOUL.md`。

## 斜杠命令限制（可选）

在 `openclaw.json` 里配置 `commands.ownerAllowFrom`（填李芈仙的 wxid）和 xbot 的 `enforceOwnerForCommands`，可限制 `/lcmm` 等只有他能用。自然语言切模式仍靠 `SOUL.md` 里「非李芈仙无效」。
