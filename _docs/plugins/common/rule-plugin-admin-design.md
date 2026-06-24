# 规则插件命令管理设计稿

相关入口：[`README.md`](../../../README.md) · [`_docs/README.md`](../../README.md)

## 1. 当前状态

当前仓库中的规则型插件由以下两个引擎负责：

- `src/plugins/rule-engine/simple.ts`：简单规则（分类：`common`）
- `src/plugins/rule-engine/dynamic.ts`：带参数提取的动态规则（分类：`dynamic`）

`workflow` 规则链路已经移除，不再提供运行时、管理命令或配置入口。

## 2. 目标

提供一个仅机器人主人可用的系统插件，用于直接通过聊天命令管理规则插件，支持：

- 列表
- 搜索
- 详情
- 校验
- 新增
- 修改
- 删除
- 复制
- 重命名
- 回滚
- 刷新缓存

## 3. 作用边界

### 3.1 支持范围

仅支持以下两类规则：

- `common`
- `dynamic`

### 3.2 非目标

以下能力不在当前设计范围内：

- 动态新增 / 删除 TS 代码插件
- 远程加载任意 JS / TS 代码
- 非主人用户管理插件
- 恢复 `workflow` 规则能力

## 4. 存储与来源

当前规则来源顺序：

```text
inline env > KV / D1
```

其中：

- `common / dynamic` 规则主存储已迁到 D1
- KV 仍保留兼容写入与回滚副本
- 若设置了 `COMMON_PLUGINS_CONFIG` 或 `COMMON_PLUGINS_MAPPING`，聊天命令修改的存储内容不会成为实际生效规则

当前相关 KV key：

- `plugins:common:mapping`
- `plugins:parameterized:mapping`
- `plugins:common:mapping:backup`
- `plugins:parameterized:mapping:backup`
- `rule-engine:d1:migrated`（迁移完成标记，由运维脚本写入）

KV → D1 一次性迁移不走 Worker，在本机执行：

```bash
npm run data -- run rules:migrate:remote
# 或先预览
npm run data -- run rules:migrate:dry-run
```

## 5. 权限模型

仅允许机器人主人操作。

建议判断方式：

```text
message.from === env.BOT_OWNER_WECHAT_ID
```

## 6. 命令设计

统一前缀：

```text
插件管理
```

### 6.1 查询类

```text
插件管理 帮助
插件管理 列表
插件管理 列表 common
插件管理 列表 dynamic
插件管理 搜索 common 天气
插件管理 搜索 dynamic 天气
插件管理 详情 common ai-news-today
插件管理 详情 dynamic weather-query
插件管理 刷新
```

### 6.2 预览与写入类

```text
插件管理 检查 common
插件管理 添加 common
插件管理 修改 common ai-news-today

插件管理 检查 dynamic
插件管理 添加 dynamic
插件管理 修改 dynamic weather-query

插件管理 预览删除 common ai-news-today
插件管理 删除 common ai-news-today
插件管理 确认删除 common ai-news-today

插件管理 预览复制 dynamic weather-query weather-query-copy
插件管理 复制 dynamic weather-query weather-query-copy

插件管理 预览重命名 dynamic weather-query weather-query-archive
插件管理 重命名 dynamic weather-query weather-query-archive

插件管理 预览回滚 common
插件管理 回滚 common
```

## 7. 字段设计

### 7.1 `common`

基础字段：

- `名称`
- `描述`
- `关键词`
- `地址`
- `请求`
- `模式`
- `提取`
- `回复`

扩展字段：

- `请求头`
- `请求体`
- `请求配置`
- `回复配置`
- `链接标题`
- `链接描述`
- `链接图片`
- `语音格式`
- `语音时长`
- `语音降级文案`
- `卡片用户名`
- `卡片昵称`
- `卡片别名`
- `app类型`
- `appXml`

### 7.2 `dynamic`

除 `common` 字段外，额外支持：

- `正则`
- `匹配模式`
- `参数模式`
- `参数分隔符`
- `参数名`
- `必填参数`

## 8. 示例

### 8.1 新增 `common`

```text
插件管理 添加 common
名称：ai-news-test
描述：测试新闻规则
关键词：AI测试|AI日报测试
地址：https://example.com/api
模式：json
提取：$.data.text
回复：text
```

### 8.2 新增 `dynamic`

```text
插件管理 添加 dynamic
名称：weather-query
描述：按城市查天气
正则：^天气\s+(.+)$
匹配模式：regex
参数模式：regex
参数名：city
地址：https://example.com/weather?city={{city}}
模式：json
提取：$.data.text
回复：text
```

### 8.3 修改 `dynamic`

```text
插件管理 修改 dynamic weather-query
描述：按城市查实时天气
地址：https://example.com/weather/realtime?city={{city}}
提取：$.result.text
```

## 9. 校验要求

写入前应复用当前规则解析与归一化逻辑，保证：

- 名称唯一
- URL 合法
- `mode` / `rType` / `matchMode` / `argsMode` 在支持范围内
- regex 可正常编译
- `requestConfig` / `replyPayload` 为合法 JSON 对象

## 10. 运行时说明

- `plugin-admin` 只负责管理规则，不直接执行规则
- 执行仍由 `rule-engine` 在下一条消息里完成
- 写入后会清理缓存，确保新规则尽快生效

## 11. 历史说明

- 本文档已按当前代码状态收敛为 `common / dynamic` 两类规则
- 历史上的 `workflow` 设计、命令样例与校验逻辑已不再适用
