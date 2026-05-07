# 规则插件命令管理设计稿

相关入口：[`README.md`](../../README.md) · [`_docs/README.md`](../README.md)

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

运行时 `插件管理 帮助` 目前会按“查询 / 只读预览 / 写入 / workflow 增量编辑 / 字段说明”分区展示，方便直接抄命令。

```text
插件管理 帮助
插件管理 列表
插件管理 列表 common
插件管理 搜索 common 天气
插件管理 详情 common ai-news-today
插件管理 刷新
插件管理 预览回滚 common
插件管理 回滚 common
插件管理 预览删除 common ai-news-today
插件管理 删除 common ai-news-today
插件管理 确认删除 common ai-news-today
插件管理 预览复制 common ai-news-today ai-news-today-copy
插件管理 复制 common ai-news-today ai-news-today-copy
插件管理 预览重命名 common ai-news-today ai-news-daily
插件管理 重命名 common ai-news-today ai-news-daily
插件管理 详情 workflow weather-workflow
步骤序号：2
插件管理 详情 workflow weather-workflow
步骤名称：render
```

说明：

- `列表`：列出某分类下当前 live rules
- `搜索`：按名称 / 关键词 / 正则摘要搜索规则
- `详情`：查看指定规则详情
- `详情 workflow + 步骤序号/步骤名称`：查看 workflow 某一步的详情
- `刷新`：清空规则缓存，不改 KV
- `预览回滚`：查看将恢复到备份的摘要，不直接执行
- `回滚`：回滚到最近一次备份
- `预览删除`：显式查看删除摘要，不直接执行
- `删除`：仅显示删除确认提示，不直接执行
- `确认删除`：真正执行删除
- `预览复制`：校验源/目标规则后返回复制摘要，不写入 KV
- `复制`：复制一份已有规则并使用新名称保存
- `预览重命名`：校验原名称/新名称后返回改名摘要，不写入 KV
- `重命名`：仅修改规则名称，其他内容保持不变

当前实现中，`回滚` 会在执行时：

1. 先把当前 live 规则写入 backup
2. 再恢复上一份 backup 到 live
3. 返回回滚前后规则数与名称级摘要

因此，当前的回滚已具备“单步来回切换”的基础能力。

另外，当前实现中的查询回显已做展示优化：

- `列表` / `搜索` 会限制单次展示条数，并提示继续缩小范围
- `详情` 会优先按“基础信息 / 匹配信息 / 请求信息 / 回复扩展信息 / 工作流信息”分组展示
- 对 `headers` / `body` / `appXml` / `steps` 等较长字段使用摘要回显，避免长消息刷屏
- 当帮助、详情、JSON 查看或预览结果过长时，会优先折叠为聊天记录式 app 卡片回复，减少大面积文字刷屏

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

另外当前代码已支持以下高级字段：

- `请求头` -> `headers`（JSON 对象）
- `请求体` -> `body`（JSON）
- `链接标题` -> `linkTitle`
- `链接描述` -> `linkDescription`
- `链接图片` -> `linkPicUrl`
- `语音格式` -> `voiceFormat`
- `语音时长` -> `voiceDurationMs`
- `语音降级文案` -> `voiceFallbackText`
- `卡片用户名` -> `cardUsername`
- `卡片昵称` -> `cardNickname`
- `卡片别名` -> `cardAlias`
- `app类型` -> `appType`
- `appXml` -> `appXml`

对于 `headers` / `body` / `appXml` 这类长文本，支持多行块语法：

```text
请求头：<<<
{"Accept":"application/json"}
>>>
```

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

### 6.3.1 `dynamic` 新增示例

```text
插件管理 添加 dynamic
名称：weather-regex
正则：^天气\s+(.+)$
匹配模式：regex
参数模式：regex
参数名：query
地址：https://example.com/weather?q={{query}}
模式：json
提取：$.data.text
回复：text
```

`dynamic` 额外可识别字段：

- `正则` -> `pattern`
- `匹配模式` -> `matchMode`
- `参数模式` -> `argsMode`
- `参数分隔符` -> `argsDelimiter`
- `参数名` -> `argsNames`
- `必填参数` -> `argsRequired`

### 6.3.2 `workflow` 新增示例

```text
插件管理 添加 workflow
名称：weather-workflow
正则：^天气\s+(.+)$
匹配模式：regex
参数模式：regex
参数名：query
回复：text
步骤：<<<
[
  {
	"name": "search",
	"url": "https://example.com/weather?q={{query}}",
	"mode": "json",
	"jsonPath": "$.data.text",
	"saveAs": "result"
  }
]
>>>
输出来源：result
```

`workflow` 额外可识别字段：

- `步骤` -> `steps`
- `输出来源` -> `outputFrom`

当前实现约束：

- `步骤` 仍支持 JSON 数组整体写入或整体替换
- `修改 workflow` 额外支持单步增量编辑：`步骤操作 / 步骤序号 / 步骤名称 / 目标步骤序号 / 目标步骤名称 / 步骤内容`
- `预览添加 workflow` 使用与 `添加 workflow` 完全相同的字段格式，但只返回新增预览，不写入 KV
- `预览修改 workflow` 使用与 `修改 workflow` 完全相同的字段格式，但只返回差异预览，不写入 KV
- 每个 step 至少需要 `url` 与 `mode`
- `outputFrom` 必须指向某个 step 的 `saveAs`
- `workflow` 也支持 `检查 / 添加 / 修改 / 删除 / 复制 / 重命名 / 回滚`

`workflow` 单步增量编辑示例：

```text
插件管理 修改 workflow weather-workflow
步骤操作：追加
步骤内容：<<<
{
  "name": "render",
  "url": "https://example.com/render?value={{result}}",
  "mode": "text",
  "saveAs": "final"
}
>>>
输出来源：final
```

```text
插件管理 修改 workflow weather-workflow
步骤操作：修改
步骤名称：render
步骤内容：<<<
{
  "saveAs": "finalText"
}
>>>
输出来源：finalText
```

```text
插件管理 修改 workflow weather-workflow
步骤操作：删除
步骤名称：normalize
```

```text
插件管理 修改 workflow weather-workflow
步骤操作：移动
步骤名称：render
目标步骤序号：1
```

```text
插件管理 修改 workflow weather-workflow
步骤操作：重命名
步骤名称：render
目标步骤名称：render-text
```

```text
插件管理 修改 workflow weather-workflow
步骤操作：复制
步骤名称：render-text
目标步骤序号：2
步骤内容：<<<
{
  "name": "render-copy",
  "saveAs": "renderCopy"
}
>>>
```

```text
插件管理 修改 workflow weather-workflow
步骤操作：禁用
步骤名称：render-copy
```

```text
插件管理 修改 workflow weather-workflow
步骤操作：启用
步骤名称：render-copy
```

```text
插件管理 预览添加 workflow
名称：weather-workflow-preview
关键词：天气预览
回复：text
步骤：<<<
[
  {
    "name": "search",
    "url": "https://example.com/weather?q={{keyword}}",
    "mode": "text",
    "saveAs": "result"
  }
]
>>>
```

```text
插件管理 预览修改 workflow weather-workflow
步骤操作：复制
步骤名称：render-step
目标步骤序号：2
```

说明：

- `步骤操作` 目前支持：`追加 / 插入 / 修改 / 删除 / 移动 / 重命名 / 复制 / 启用 / 禁用`
- `步骤序号` 为 1 开始的序号
- `步骤名称` 可用于 `修改 / 删除 / 移动 / 重命名 / 复制` 时按 step.name 精确定位步骤
- `目标步骤序号` 用于 `移动`，表示移动完成后的最终位置
- `目标步骤名称` 用于 `重命名`
- `步骤内容` 为单个 step 的 JSON 对象；在 `复制` 时表示复制后再覆盖的字段补丁
- step 默认视为启用；仅当 `enabled=false` 时视为禁用
- `修改` 会基于当前 step 做局部合并，再进行整条 workflow 校验
- `预览添加` 会先执行与新增相同的校验，再返回聊天友好的规则摘要与步骤预览
- `预览修改` 会先执行同样的校验，再返回聊天友好的步骤差异摘要
- `预览复制` 会先执行与 `复制` 相同的名称校验，再返回复制后的规则摘要；workflow 会额外展示步骤预览
- `预览修改` 对常见字段会附带 `before -> after`，如：`名称 / 启用 / saveAs / 地址 / 模式 / 提取 / 请求`
- 所有预览命令统一使用 `规则预览{动作}（未写入）` 标题，并在结尾明确提示 `本次仅预览，未写入 KV。`
- 当 `步骤名称` 命中多个步骤时，会要求改用 `步骤序号`

`workflow` 单步详情示例：

```text
插件管理 详情 workflow weather-workflow
步骤名称：render
```

```text
插件管理 详情 workflow weather-workflow
步骤序号：2
```

```text
插件管理 详情 workflow weather-workflow
查看：步骤JSON
```

```text
插件管理 详情 workflow weather-workflow
查看：规则JSON
```

说明：

- `详情 workflow <名称>` 仍然展示整条规则
- 若附带 `步骤序号` 或 `步骤名称`，则只展示该步骤详情
- 若附带 `查看：步骤JSON`，则返回完整 `steps` 原始 JSON
- 若附带 `查看：规则JSON`，则返回完整 workflow 规则原始 JSON
- `步骤名称` 若不唯一，也会提示改用 `步骤序号`
- `查看：步骤JSON / 规则JSON` 不能与 `步骤序号` / `步骤名称` 同时使用

### 6.4 删除命令

```text
插件管理 预览删除 common ai-news-today
```

```text
插件管理 删除 common ai-news-today
```

删除规则：

- 按 `name` 删除
- 不支持按 `keyword` 删除
- 若不存在，返回明确提示
- `预览删除` 与 `删除` 当前都会先返回“即将删除”的摘要预览，不写 live KV / backup KV，也不会清缓存
- 只有 `确认删除 <分类> <名称>` 才会真正写入 KV 并刷新缓存

### 6.5 复制预览命令

```text
插件管理 预览复制 workflow weather-workflow weather-workflow-copy
```

复制预览规则：

- 会校验目标名称是否合法
- 会校验目标名称是否已存在
- 若原规则不存在，返回明确提示
- 仅返回复制后的规则摘要；若为 `workflow`，会附带步骤数、输出来源与步骤预览
- 不写 live KV / backup KV，也不会清缓存

### 6.6 重命名预览命令

```text
插件管理 预览重命名 workflow weather-workflow weather-workflow-archive
```

重命名预览规则：

- 会校验新名称是否合法
- 会校验新名称是否已存在
- 若原规则不存在，返回明确提示
- 仅返回重命名后的规则摘要；若为 `workflow`，会保留步骤数与输出来源摘要
- 不写 live KV / backup KV，也不会清缓存

### 6.7 回滚预览命令

```text
插件管理 预览回滚 workflow
```

回滚预览规则：

- 会读取当前 live 与最近一次 backup
- 若当前没有备份，返回明确提示
- 返回回滚前后规则数、恢复新增、回滚移除等摘要
- 若 live 与 backup 一致，也会明确提示“本次回滚未产生名称级变化”
- 不写 live KV / backup KV，也不会清缓存

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
- 若声明 `outputFrom`，必须能命中某个 step 的 `saveAs`
- `steps` 支持 JSON 数组整体校验与整体替换
- 单步增量编辑时：
  - `追加` 不需要 `步骤序号`
  - `插入` 必须提供 `步骤序号`
  - `修改 / 删除` 必须提供 `步骤序号` 或 `步骤名称` 其中之一
  - `移动` 必须提供 `步骤序号` 或 `步骤名称` 其中之一，同时必须提供 `目标步骤序号`
  - `重命名` 必须提供 `步骤序号` 或 `步骤名称` 其中之一，同时必须提供 `目标步骤名称`
  - `复制` 必须提供 `步骤序号` 或 `步骤名称` 其中之一，同时必须提供 `目标步骤序号`
  - `启用 / 禁用` 必须提供 `步骤序号` 或 `步骤名称` 其中之一
  - `追加 / 插入 / 修改` 必须提供 `步骤内容`
  - `复制` 的 `步骤内容` 可选；提供时表示复制后附加覆盖字段
  - `删除 / 移动 / 重命名 / 启用 / 禁用` 不允许携带 `步骤内容`
  - `修改 / 删除 / 移动 / 重命名 / 复制 / 启用 / 禁用` 不允许同时提供 `步骤序号` 与 `步骤名称`
  - 不允许同时使用 `步骤` 与 `步骤操作 / 步骤序号 / 步骤名称 / 目标步骤序号 / 目标步骤名称 / 步骤内容`
  - 若使用 `步骤名称`，必须唯一命中某个 step.name
  - 不允许删除最后一个步骤
  - 若 `outputFrom` 指向的步骤被禁用，则整条规则校验失败

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
- `workflow`：完整 CRUD + 检查 + 复制 + 重命名

> 当前代码实现中，`dynamic` 的列表 / 详情 / 检查 / 添加 / 修改 / 删除 / 复制 / 重命名 / 回滚 已支持。
> 当前代码实现中，`workflow` 的列表 / 详情 / 检查 / 添加 / 修改 / 删除 / 复制 / 重命名 / 回滚 已支持；步骤既可整体 JSON 替换，也支持单步增量编辑。

### Phase 3

进一步增强：

- `workflow` 步骤按名称选择、批量调整、可视化 diff
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
3. 当前 `common / dynamic / workflow` 三类规则都已支持命令式管理；`workflow` 的步骤编辑方式为整体 JSON 替换。
4. 为支持稳定管理，所有可管理规则都应有唯一 `name`。

## 16. 验证建议

当前仓库已补充一条面向 `workflow` 管理能力的烟雾验证路径：

```text
npm run plugin-admin:smoke
```

该验证会覆盖至少以下场景：

- `workflow` 命令解析
- `workflow` 的检查 / 添加 / 修改（含单步 append / insert / update / delete）
- `workflow` 的复制 / 重命名 / 两步删除 / 回滚
- 非法 `steps`
- 非法 `outputFrom`

