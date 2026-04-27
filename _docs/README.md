# `_docs` 目录索引

当前 `_docs` 已按主题分层整理，便于维护与查找。

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

- `common-plugins.json`
- `common-plugins-dynamic.json`
- `common-plugins-workflow.json`

用于本地/远程 KV 写入的通用插件配置样例。

### `wechat/`

- `swagger.json`：微信网关接口文档源

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

