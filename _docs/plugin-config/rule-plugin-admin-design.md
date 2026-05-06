# 规则插件命令管理设计稿

## 1. 背景

当前仓库中的“通用插件”并不是运行时动态加载的 TS 代码插件，而是由以下三个规则引擎负责解释执行：

- `src/plugins/common/base.ts`：基础通用规则（`common`）
- `src/plugins/common/dynamic.ts`：带参数提取的动态规则（`dynamic`）
- `src/plugins/common/workflow.ts`：多步骤编排规则（`workflow`）

因此，“通过命令新增 / 删除 / 修改插件”的正确落点，不是去改 `pluginManager.register(...)`，而是：

1. 主人发送管理命令
2. 系统插件解析命令
3. 将规则写入 / 更新 / 删除到 KV
4. 清理规则缓存
5. 让现有规则引擎在下一条消息中按新规则生效

## 2. 目标

提供一个**仅机器人主人可用**的系统插件，用于直接通过聊天命令管理规则插件，支持：

- 列表
- 详情
- 新增
- 修改
- 删除
- 刷新缓存
- 回滚到上一个版本
- 预检查（只校验不落库）

## 3. 范围与非目标

### 3.1 本次范围

仅支持操作以下三类“规则插件”：

- `common`
- `dynamic`
- `workflow`

### 3.2 非目标

本设计**不支持**以下能力：

- 动态新增 / 删除 TS 代码插件
- 远程加载任意 JS / TS 代码
- 非主人用户管理插件
- 在第一阶段支持复杂交互式表单 UI

## 4. 当前架构约束

### 4.1 规则加载优先级

当前规则加载顺序为：

```text
inline env > KV > remote
```

对应代码：`src/plugins/common/remote-config.ts` 中的 `loadRulesFromSources(...)`。

这意味着：

- 如果部署环境设置了 `COMMON_PLUGINS_CONFIG`
- 或设置了 `COMMON_PLUGINS_MAPPING`

那么聊天命令对 KV 的修改不会成为实际生效配置。

### 4.2 KV key 现状

当前已存在的 live rules KV key：

- `plugins:common:mapping`
- `plugins:parameterized:mapping`
- `plugins:workflow:mapping`

定义位置：`src/constants/kv.ts`

### 4.3 规则解析能力

写入前应复用现有解析 / 归一化思路做校验，避免把错误规则写入 live config：

- `src/plugins/common/parser.ts`
- `src/plugins/common/base.ts`
- `src/plugins/common/dynamic.ts`
- `src/plugins/common/workflow.ts`

## 5. 权限模型

仅允许机器人主人操作。

建议判断方式：

```text
message.from === env.BOT_OWNER_WECHAT_ID
```

若未命中，返回：

```text
无权限：仅机器人主人可使用插件管理命令。
```

## 6. 命令设计

统一前缀建议为：

```text
插件管理
```

### 6.1 查询类命令

```text
插件管理 帮助
插件管理 列表
插件管理 列表 common
插件管理 详情 common ai-news-today
插件管理 刷新
插件管理 回滚 common
```

说明：

- `列表`：列出某分类下当前 live rules
- `详情`：查看指定规则详情
- `刷新`：清空规则缓存，不改 KV
- `回滚`：回滚到最近一次备份

### 6.2 新增命令

推荐采用**多行字段式**，比单行 `key=value` 更适合聊天场景。

#### `common` 新增示例

```text
插件管理 添加 common
名称：ai-news-test
关键词：AI测试|AI日报测试
地址：https://example.com/api
模式：json
提取：$.data.text
回复：text
```

#### 可识别字段（第一阶段）

- `名称` -> `name`
- `关键词` -> `keyword`
- `地址` -> `url`
- `请求` -> `method`
- `模式` -> `mode`
- `提取` -> `jsonPath`
- `回复` -> `rType`

### 6.3 修改命令

```text
插件管理 修改 common ai-news-today
关键词：AI资讯快报|今日AI快报
地址：https://example.com/new-api
提取：$.data.content
```

修改规则：

- 只覆盖本次提供的字段
- 未提供的字段保持原值
- 修改后仍需做整体校验

### 6.4 删除命令

```text
插件管理 删除 common ai-news-today
```

删除规则：

- 按 `name` 删除
- 不支持按 `keyword` 删除
- 若不存在，返回明确提示

## 7. 规则命名要求

为了支持稳定的“详情 / 修改 / 删除 / 回滚”等管理能力，规则必须具备稳定 `name`。

因此，样例配置中原本缺失 `name` 的基础规则需补齐。当前建议命名如下：

- `drink-invite-text`
- `random-long-image`
- `abs-image`
- `cxk-meme-image`

## 8. 存储设计

### 8.1 live rules

直接复用当前 KV key：

- `plugins:common:mapping`
- `plugins:parameterized:mapping`
- `plugins:workflow:mapping`

### 8.2 backup rules

为支持回滚，建议新增备份 key：

- `plugins:common:mapping:backup`
- `plugins:parameterized:mapping:backup`
- `plugins:workflow:mapping:backup`

第一阶段只保留最近一次备份即可。

### 8.3 可选 revision metadata

后续若要做更完整的历史审计，可增加：

- `plugins:common:mapping:meta`
- `plugins:parameterized:mapping:meta`
- `plugins:workflow:mapping:meta`

用于记录：

- 最近修改人
- 最近修改时间
- 最近一次操作类型（add / update / delete / rollback）

## 9. 处理流程

### 9.1 新增

1. 校验权限
2. 校验分类（`common` / `dynamic` / `workflow`）
3. 检查 inline env 是否接管配置
4. 读取当前 KV 规则数组
5. 解析输入块为规则对象
6. 校验 `name` 唯一性
7. 合并到数组
8. 运行规则解析器做整体校验
9. 写 backup
10. 写 live KV
11. 清理规则缓存
12. 返回成功回执

### 9.2 修改

1. 校验权限
2. 读取 live KV
3. 定位指定 `name`
4. 以 patch 方式合并字段
5. 做整体校验
6. 写 backup
7. 写 live KV
8. 清缓存
9. 返回修改结果

### 9.3 删除

1. 校验权限
2. 读取 live KV
3. 按 `name` 查找
4. 删除目标项
5. 做整体校验
6. 写 backup
7. 写 live KV
8. 清缓存
9. 返回删除结果

## 10. 校验规则

### 10.1 通用校验

所有分类都至少要校验：

- `name` 非空
- `name` 全局在同分类内唯一
- `url` 为合法 `http/https`
- `mode` 合法
- `rType` 合法

### 10.2 `common` 特有校验

最小必填字段：

- `name`
- `keyword`
- `url`
- `mode`
- `rType`

### 10.3 `dynamic` 特有校验

至少满足下列之一：

- `keyword`
- `pattern`

并校验：

- `matchMode`
- `args`
- `required`

### 10.4 `workflow` 特有校验

必须包含：

- `steps[]`
- 每个 step 的 `url`
- 每个 step 的 `mode`

第一阶段可先不支持通过聊天命令创建复杂 `workflow steps`，但文档层面保留扩展位。

## 11. inline env 冲突策略

若检测到：

- `COMMON_PLUGINS_CONFIG`
- `COMMON_PLUGINS_MAPPING`

存在值，则返回警告并默认阻止写入：

```text
当前通用插件由环境变量内联配置接管，聊天命令修改 KV 不会生效。
请先切换到 KV 管理模式，再执行插件管理命令。
```

说明：

- 第一阶段直接阻止
- 后续如有需要，可改为“允许写入但标记为未生效”

## 12. 用户体验文案建议

### 12.1 添加成功

```text
插件已添加成功
- 分类：common
- 名称：ai-news-test
- 关键词：AI测试|AI日报测试
- 模式：json
- 回复：text

已写入 KV 并刷新缓存。
```

### 12.2 修改成功

```text
插件已修改成功
- 分类：common
- 名称：ai-news-today
- 变更字段：关键词、地址、提取
```

### 12.3 删除成功

```text
插件已删除
- 分类：common
- 名称：ai-news-today
```

### 12.4 校验失败

```text
规则校验失败：
- 缺少必填字段：地址
- 模式仅支持 text/json/base64
```

## 13. 分阶段实现建议

### Phase 1

先做一版最小闭环：

- `common`：列表 / 详情 / 添加 / 修改 / 删除 / 刷新 / 回滚
- 权限校验
- inline env 冲突拦截
- KV 备份
- 缓存清理

### Phase 2

扩展到：

- `dynamic`：完整 CRUD
- `workflow`：列表 / 详情 / 删除 / 刷新

### Phase 3

进一步增强：

- `workflow` 复杂步骤编辑
- 草稿态编辑
- 多版本回滚
- 操作审计日志
- HTTP 管理接口复用同一套 service

## 14. 建议代码落点

### 新增系统插件

- `src/plugins/system/plugin-admin.ts`

### 新增服务层

- `src/plugins/system/plugin-admin-service.ts`
- `src/plugins/system/plugin-admin-types.ts`

### 注册位置

在 `src/plugins/index.ts` 中，建议注册在下列引擎之前：

- `commonPluginsEngine`
- `dynamicCommonPluginsEngine`
- `workflowCommonPluginsEngine`

避免管理命令被通用规则错误抢占。

## 15. 本次文档结论

结论如下：

1. “通过命令直接新增 / 删除 / 修改插件”在当前项目中应解释为：**管理规则插件，而不是管理 TS 代码插件**。
2. 最合适的技术路径是：**主人命令 -> KV 规则 CRUD -> 清缓存 -> 规则引擎自动生效**。
3. 第一阶段优先把 `common` 规则管理做完整，再逐步扩展到 `dynamic` / `workflow`。
4. 为支持稳定管理，所有可管理规则都应有唯一 `name`。

