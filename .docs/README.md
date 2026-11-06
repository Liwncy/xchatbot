# 文档

按功能模块分。大脑在 `agent/`，SQL 都在 `sql/`。

| 目录 | 干什么 |
|---|---|
| [`agent/setup/`](agent/setup/openclaw.md) | 四颗大脑各自的安装说明 |
| [`agent/shared/`](agent/shared/README.md) | 共用的人设、MCP 技能、回消息技能 |
| [`persona/`](persona/) | 人格源文件，一人一个 md，文件夹是分类。改完跑 `npm run data -- run persona:build` |
| [`sql/`](sql/persona.sql) | 建表和灌数。`persona.sql` 由 `persona/` 生成，别手改；`npm run data` 的 `d1:migrate:*:persona` 用这份 |

安装说明：[`openclaw`](agent/setup/openclaw.md)、[`snailai`](agent/setup/snailai.md)、[`qwenpaw`](agent/setup/qwenpaw.md)、[`hermes`](agent/setup/hermes.md)。

项目总览在 [`../README.md`](../README.md)。
