# `_docs` 目录索引

当前 `_docs` 已按主题分层整理，便于维护与查找。

## 推荐阅读路径

- **刚接手项目 / 想看总体说明**
  - 先看：[`../README.md`](../README.md)
  - 再回到：[`README.md`](README.md)
- **想准备或检查通用插件 KV 配置**
  - 看：[`plugin-config/common-plugins.json`](plugin-config/common-plugins.json)
  - 看：[`plugin-config/common-plugins-dynamic.json`](plugin-config/common-plugins-dynamic.json)
  - 看：[`plugin-config/common-plugins-workflow.json`](plugin-config/common-plugins-workflow.json)
- **想通过“插件管理 ...”聊天命令管理规则**
  - 先看：[`plugin-config/rule-plugin-admin-design.md`](plugin-config/rule-plugin-admin-design.md)
  - 运行中机器人可直接发送：`插件管理 帮助`
- **想了解定时任务中心**
  - 看：[`scheduler/cloudflare-scheduler-design.md`](scheduler/cloudflare-scheduler-design.md)
  - 再看：[`scheduler/scheduler-api-draft.md`](scheduler/scheduler-api-draft.md)
  - 落库时看：[`scheduler/scheduler-mvp.sql`](scheduler/scheduler-mvp.sql)
- **想了解修仙玩法**
  - 先看：[`../src/plugins/game/xiuxian/README.md`](../src/plugins/game/xiuxian/README.md)
  - 再看：[`xiuxian/xiuxian-roadmap.md`](xiuxian/xiuxian-roadmap.md)
  - 落库时看：[`xiuxian/xiuxian-mvp.sql`](xiuxian/xiuxian-mvp.sql)

## 目录结构

```text
_docs/
  README.md
  dev/            # 开发协作文档
  misc/           # 临时/杂项资料
  plugin-config/  # 通用插件配置样例
  scheduler/      # 定时任务中心设计、API 草案、SQL
  wechat/         # 微信网关相关文档
  xiuxian/        # 修仙玩法设计、SQL、配置样例
```

## 各目录说明

### `scheduler/`

- `cloudflare-scheduler-design.md`：调度中心设计稿
- `scheduler-api-draft.md`：管理接口草案
- `scheduler-mvp.sql`：调度中心建表 SQL

### `xiuxian/`

- `xiuxian-mvp.sql`：修仙玩法 D1 表结构
- `xiuxian-roadmap.md`：修仙玩法路线图
- `xiuxian-structure-plan.md`：修仙结构设计稿
- `xiuxian-set-config.sample.json`：修仙装备套装示例配置

### `plugin-config/`

- [`common-plugins.json`](plugin-config/common-plugins.json)：`common` 基础规则样例，可直接用于本地/远程 KV 写入
- [`common-plugins-dynamic.json`](plugin-config/common-plugins-dynamic.json)：`dynamic` 动态参数规则样例
- [`common-plugins-workflow.json`](plugin-config/common-plugins-workflow.json)：`workflow` 多步骤编排规则样例
- [`rule-plugin-admin-design.md`](plugin-config/rule-plugin-admin-design.md)：插件管理（主人命令）设计稿与命令说明

这一组文档可分成两类：

1. **配置样例**
   - 当你要准备或检查 KV 中的规则内容时，优先看：
     - `common-plugins.json`
     - `common-plugins-dynamic.json`
     - `common-plugins-workflow.json`
2. **管理设计 / 命令说明**
   - 当你要通过“`插件管理 ...`”聊天命令管理规则时，优先看：
     - [`rule-plugin-admin-design.md`](plugin-config/rule-plugin-admin-design.md)

如果只是想快速确认当前支持哪些聊天管理命令，也可以直接在运行中的机器人里发送：`插件管理 帮助`。

若你是从项目主文档跳转过来的，也可以回看：[`../README.md`](../README.md)

### `wechat/`

- `swagger.json`：微信网关接口文档源
- `fake-forward-plugin-design.md`：伪造转发插件设计稿（MVP）

### `dev/`

- `copilot-instructions.md`：开发协作相关说明

### `misc/`

- `test.yaml`：暂存的测试/杂项文件

## 迁移说明

如果你需要引用 `_docs` 下的文件，请优先使用分层后的新路径，例如：

- `_docs/scheduler/scheduler-mvp.sql`
- `_docs/xiuxian/xiuxian-mvp.sql`
- `_docs/plugin-config/common-plugins.json`

不要再使用旧的根目录路径。

