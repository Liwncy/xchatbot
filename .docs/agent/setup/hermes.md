# Hermes 大脑联调

自然语言仍走 xchatbot 门禁、`#` 口令和正文拼装。只把拼好的正文 POST 到 Hermes 的 xbot 频道。

当前走哪颗不看配置文件。会话和平台写在 KV，默认是 D1 `agent_brain` 里 `is_default = 1` 的那一行。第一次建表会把 Hermes 标成默认。主人用 `#脑子 hermes` 只换这个会话，`#脑子 平台 hermes` 换这个平台，`#脑子 全部 hermes` 换默认。

**不要开 Hermes 自带微信。**

## 1. 安装频道

插件在 `xbot-channel/hermes`。接到 Hermes 家目录再启用：

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.hermes\plugins\xbot" -Target "D:\Workspace\mygithub\xbot-channel\hermes"
hermes plugins enable xbot
```

`config.yaml` 的 `gateway.platforms` 加上：

```yaml
xbot:
  enabled: true
  extra:
    xchatbot_api_base_url: https://xbot.lwcfworker.dpdns.org
    token: "<与 AGENT_BRIDGE_TOKEN 相同>"
    host: 127.0.0.1
    port: 8642
```

然后 `hermes gateway run`。默认只听本机 `8642`。Worker 到不了 `127.0.0.1`，前面要有隧道，公网地址填进下面的 `HERMES_BASE_URL`。

## 2. xchatbot

| 变量 | 说明 |
|------|------|
| `HERMES_BASE_URL` | 隧道公网根。第一次建表抄进 D1；Worker POST `{地址}/api/channels/xbot/inbound` |
| `HERMES_TOKEN` | 入站 Bearer。未设则用 `XBOT_CHANNEL_GATEWAY_TOKEN`，再没有用 `AGENT_BRIDGE_TOKEN` |
| `HERMES_TIMEOUT_MS` | 可选。表里默认 120 秒；这一列空了才看它，再没有看 `XBOT_CHANNEL_TIMEOUT_MS` |
| `XBOT_CHANNEL_ENABLED` | 仍须 `true` |

## 3. 自检

```powershell
python selfcheck.py
hermes plugins doctor .
```

`selfcheck.py` 在 `xbot-channel/hermes` 里。
