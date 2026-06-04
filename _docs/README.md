# `_docs` 目录索引

当前 `_docs` 已按主题分层整理，便于维护与查找。

## 推荐阅读路径

- **刚接手项目 / 想看总体说明**
  - 先看：[`../README.md`](../README.md)
  - 再回到：[`README.md`](README.md)
- **想准备或检查通用插件 KV 配置**
  - 看：[`templates/plugin-config/common-plugins.json`](templates/plugin-config/common-plugins.json)
  - 看：[`templates/plugin-config/common-plugins-dynamic.json`](templates/plugin-config/common-plugins-dynamic.json)
  - 看：[`templates/plugin-config/common-plugins-workflow.json`](templates/plugin-config/common-plugins-workflow.json)
- **想通过“插件管理 ...”聊天命令管理规则**
  - 先看：[`plugins/common/rule-plugin-admin-design.md`](plugins/common/rule-plugin-admin-design.md)
  - 运行中机器人可直接发送：`插件管理 帮助`
- **想了解定时任务中心**
  - 看：[`scheduler/cloudflare-scheduler-design.md`](scheduler/cloudflare-scheduler-design.md)
  - 再看：[`scheduler/scheduler-api-draft.md`](scheduler/scheduler-api-draft.md)
  - 落库时看：[`scheduler/scheduler-mvp.sql`](scheduler/scheduler-mvp.sql)
- **想了解后续目录重构与迁移路线**
  - 看：[`architecture/xchatbot-structure-refactor-plan.md`](architecture/xchatbot-structure-refactor-plan.md)
- **想了解 AI 对话 / AI 唱歌相关设计**
  - 看：[`templates/ai/ai-dialog-config.sample.json`](templates/ai/ai-dialog-config.sample.json)
  - 看：[`templates/ai/mimo-tts-config.sample.json`](templates/ai/mimo-tts-config.sample.json)
  - 看：[`plugins/ai/mimo-tts-plugin-design.md`](plugins/ai/mimo-tts-plugin-design.md)
- **想了解修仙玩法**
  - 先看：[`../src/plugins/game/xiuxian/README.md`](../src/plugins/game/xiuxian/README.md)
  - 再看：[`plugins/xiuxian/xiuxian-roadmap.md`](plugins/xiuxian/xiuxian-roadmap.md)
  - 落库时看：[`plugins/xiuxian/xiuxian-mvp.sql`](plugins/xiuxian/xiuxian-mvp.sql)

## 目录结构

```text
_docs/
  README.md
  architecture/    # 架构演进、目录重构、迁移方案
  plugins/        # 插件相关设计文档（按插件领域再分层）
    ai/           # AI 对话 / TTS / 唱歌相关设计
    common/       # 通用插件 / 插件管理设计文档
    xiuxian/      # 修仙玩法设计、SQL
  scheduler/      # 定时任务中心设计、API 草案、SQL
  templates/      # 可复制到 .config/ 的配置样例模板
  wechat/         # 微信网关相关文档
  scripts/        # 脚本说明、命令速查等文档
```

## 各目录说明

### `architecture/`

- [`architecture/xchatbot-structure-refactor-plan.md`](architecture/xchatbot-structure-refactor-plan.md)：当前仓库的结构重构蓝图、目标目录与分阶段迁移顺序

### `plugins/`

插件相关设计文档已统一收拢到 `plugins/` 目录下，便于和调度、模板、脚本类文档区分。

#### `plugins/ai/`

- `mimo-tts-plugin-design.md`：MiMo TTS / AI 唱歌插件设计稿（MVP）

### `scheduler/`

- `cloudflare-scheduler-design.md`：调度中心设计稿
- `scheduler-api-draft.md`：管理接口草案
- `scheduler-mvp.sql`：调度中心建表 SQL

#### `plugins/xiuxian/`

- `xiuxian-mvp.sql`：修仙玩法 D1 表结构
- `xiuxian-roadmap.md`：修仙玩法路线图
- `xiuxian-structure-plan.md`：修仙结构设计稿

#### `plugins/common/`

- [`rule-plugin-admin-design.md`](plugins/common/rule-plugin-admin-design.md)：插件管理（主人命令）设计稿与命令说明
- [`group-whitelist-plugin-policy-design.md`](plugins/common/group-whitelist-plugin-policy-design.md)：群白名单插件策略设计稿

这一组文档可分成两类：

1. **管理设计 / 命令说明**
   - 当你要通过“`插件管理 ...`”聊天命令管理规则时，优先看：
     - [`rule-plugin-admin-design.md`](plugins/common/rule-plugin-admin-design.md)

如果只是想快速确认当前支持哪些聊天管理命令，也可以直接在运行中的机器人里发送：`插件管理 帮助`。

### `templates/`

- [`templates/ai/ai-dialog-config.sample.json`](templates/ai/ai-dialog-config.sample.json)：AI 对话配置样例
- [`templates/ai/mimo-tts-config.sample.json`](templates/ai/mimo-tts-config.sample.json)：AI 唱歌 / MiMo TTS 配置样例
- [`templates/plugin-config/common-plugins.json`](templates/plugin-config/common-plugins.json)：`common` 基础规则样例
- [`templates/plugin-config/common-plugins-dynamic.json`](templates/plugin-config/common-plugins-dynamic.json)：`dynamic` 动态参数规则样例
- [`templates/plugin-config/common-plugins-workflow.json`](templates/plugin-config/common-plugins-workflow.json)：`workflow` 多步骤编排规则样例
- [`templates/xiuxian/xiuxian-set-config.sample.json`](templates/xiuxian/xiuxian-set-config.sample.json)：修仙装备套装示例配置

若你是从项目主文档跳转过来的，也可以回看：[`../README.md`](../README.md)

### `wechat/`

- `swagger.json`：微信网关接口文档源
- `fake-forward-plugin-design.md`：伪造转发插件设计稿（MVP）

## 迁移说明

如果你需要引用 `_docs` 下的插件文档，请优先使用 `plugins/` 下的新路径，例如：

- `_docs/scheduler/scheduler-mvp.sql`
- `_docs/plugins/xiuxian/xiuxian-mvp.sql`
- `_docs/plugins/ai/mimo-tts-plugin-design.md`
- `_docs/plugins/common/rule-plugin-admin-design.md`
- `_docs/templates/plugin-config/common-plugins.json`

不要再使用旧的 `_docs/ai/`、`_docs/plugin-config/`、`_docs/xiuxian/` 路径。

