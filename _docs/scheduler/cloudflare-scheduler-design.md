# Cloudflare Scheduler 设计稿（MVP 可开工版）

> 面向当前 `xchatbot` 仓库的定时任务中心设计。
> 目标是在 **Cloudflare Workers + D1** 之上，做一套“类似 snailjob 思路”的轻量调度系统。

---

## 1. 设计目标

### 1.1 目标

本设计稿希望在当前项目中落地一套统一的调度中心，支持：

1. **Cloudflare Worker 原生 `scheduled` 接入**
2. **定时任务持久化管理**，而不是把任务写死在代码里
3. **执行器插件化注册**，数据库只维护任务定义，具体逻辑仍由代码实现
4. **执行日志可追踪**，便于排障和后续运维
5. **支持周期任务、延迟任务、一次性任务**
6. **后续可直接复用到“伪造转发超时自动发送”**

### 1.2 非目标

MVP 阶段不做：

- 秒级高精度调度
- DAG 编排 / 工作流引擎
- 分布式常驻执行器集群
- 独立前端控制台
- Durable Objects / Queues 依赖
- 与现有消息插件体系强行复用同一接口

---

## 2. 背景与约束

### 2.1 当前仓库基础

当前项目已经具备以下能力：

- `wrangler.toml`：Worker 主配置
- `src/index.ts`：当前只暴露 `fetch` 入口
- `src/types/message.ts`：已有 `Env` 绑定，包含 `XBOT_DB` 与 `XBOT_KV`
- `src/wechat/index.ts`：已有主动发送微信消息能力
- `src/plugins/*`：已有消息插件注册机制，可借鉴其注册式思路

### 2.2 Cloudflare Workers 的约束

Cloudflare `scheduled` 适合作为**统一心跳入口**，但不适合当作“每个任务一个原生 cron”的平台。

核心约束：

1. **cron 是静态配置**，通过 `wrangler.toml` 声明
2. **精度通常为分钟级**，不适合秒级任务
3. **执行时长有限**，任务要短、可重入、最好幂等
4. **更适合至少一次执行语义**，而不是绝对只一次

因此，本设计不直接复制 Java `snailjob` 的运行模型，而是借鉴其核心思想：

> 用 `scheduled` 作为统一时钟，
> 用 D1 保存任务定义与执行记录，
> 用代码内执行器插件完成实际业务执行。

---

## 3. 总体架构

### 3.1 架构原则

采用“两层调度”模型：

#### 第 1 层：平台心跳层

- 由 Cloudflare Worker 原生 `scheduled` 驱动
- 建议仅配置 **1 条分钟级 cron**
- 示例：`* * * * *`

#### 第 2 层：业务调度层

在 Worker 内部自建任务中心，负责：

- 扫描到期任务
- 抢占执行 lease
- 调用执行器
- 记录执行日志
- 计算下一次触发时间
- 处理失败重试

### 3.2 总体流程图

```text
Cloudflare Cron Trigger
		↓
scheduled(controller, env, ctx)
		↓
SchedulerCenter.dispatchDueJobs()
		↓
从 D1 扫描 next_run_at <= now 的任务
		↓
抢占 lease / 写入 run 记录
		↓
根据 executor_key 找到执行器
		↓
执行任务
		↓
更新任务状态 / run 日志 / next_run_at
```

---

## 4. 与 snailjob 的对应关系

| snailjob 思路 | 本方案对应实现 |
|---|---|
| 调度中心 | `SchedulerCenter` |
| 任务定义 | `scheduler_jobs` |
| 执行器 | `SchedulerExecutor` 注册表 |
| 执行记录 | `scheduler_job_runs` |
| 手动触发 | `/admin/scheduler/jobs/:id/trigger` |
| 暂停/恢复 | `status = paused / active` |
| 重试 | 失败后重算 `next_run_at` |
| 动态维护任务 | 管理 API + D1 |

### 4.1 不直接复制的点

本方案不追求以下特性：

- 运行期动态创建 Cloudflare 原生 cron
- 秒级调度
- 常驻 JVM/Executor 节点池式执行模型
- 超长任务托管执行

---

## 5. Cloudflare `scheduled` 接入方式

### 5.1 `wrangler.toml` 接入

建议在 `wrangler.toml` 中增加 cron trigger。

MVP 推荐：

```toml
[triggers]
crons = ["* * * * *"]
```

说明：

- 每分钟触发一次 Worker 的 `scheduled`
- 所有业务任务都由 D1 中的 `next_run_at` 决定是否到期
- 不建议给每个业务任务配置单独 cron

### 5.2 `src/index.ts` 接入

当前 `src/index.ts` 只有 `fetch`，后续改造为：

- `fetch(request, env, ctx)`：继续处理 webhook、管理接口
- `scheduled(controller, env, ctx)`：进入调度中心

### 5.3 `scheduled` 中做什么

`scheduled` 入口不直接写业务逻辑，只做：

1. 创建调度中心实例
2. 调用 `dispatchDueJobs()`
3. 用 `ctx.waitUntil(...)` 托管异步执行
4. 记录统一日志

---

## 6. 目录与文件设计

建议新增目录如下：

```text
src/
  scheduler/
	index.ts
	types.ts
	center.ts
	repository.ts
	cron.ts
	utils.ts
	executors/
	  types.ts
	  registry.ts
	  heartbeat.ts
	  send-wechat-text.ts
	  index.ts
```

可选扩展：

```text
src/
  admin/
	scheduler.ts
```

文档与 SQL：

```text
_docs/
  scheduler/
    cloudflare-scheduler-design.md
    scheduler-api-draft.md
    scheduler-mvp.sql
```

### 6.1 各文件职责

#### `src/scheduler/types.ts`

定义：

- 任务状态
- 调度策略枚举
- 任务实体类型
- 执行日志类型
- 执行上下文类型

#### `src/scheduler/center.ts`

调度中心主流程：

- 扫描到期任务
- 抢锁
- 调用执行器
- 写回状态

#### `src/scheduler/repository.ts`

封装所有 D1 读写：

- 查询到期任务
- 抢占 lease
- 创建 run 记录
- 更新成功/失败状态

#### `src/scheduler/cron.ts`

负责：

- cron 合法性校验
- 计算下一次执行时间
- 支持后续时区适配

#### `src/scheduler/executors/registry.ts`

执行器注册表，风格参考现有插件管理器。

#### `src/scheduler-ext/*.ts`

具体业务执行器实现，例如：

- `heartbeat`
- `send-wechat-text`
- 后续的 `fake-forward-flush`

---

## 7. 数据模型设计

MVP 建议先建两张表：

1. `scheduler_jobs`
2. `scheduler_job_runs`

### 7.1 `scheduler_jobs`

用途：任务定义主表。

建议字段：

| 字段 | 类型建议 | 说明 |
|---|---|---|
| `id` | INTEGER PK | 主键 |
| `namespace` | TEXT | 业务命名空间，便于后续隔离 |
| `job_key` | TEXT | 业务唯一键 |
| `name` | TEXT | 任务名称 |
| `status` | TEXT | `active` / `paused` / `disabled` |
| `executor_key` | TEXT | 对应代码内执行器 |
| `schedule_type` | TEXT | `cron` / `once` / `delay` |
| `cron_expr` | TEXT NULL | 周期任务的 cron 表达式 |
| `timezone` | TEXT NULL | 时区，MVP 可先固定 `Asia/Shanghai` |
| `payload_json` | TEXT | 执行器输入参数 |
| `misfire_policy` | TEXT | 漏跑策略，MVP 可先简化 |
| `retry_limit` | INTEGER | 最大重试次数 |
| `retry_backoff_sec` | INTEGER | 重试退避秒数 |
| `concurrency_policy` | TEXT | `forbid` / `replace` |
| `next_run_at` | INTEGER | 下次触发时间戳 |
| `last_run_at` | INTEGER NULL | 最近执行时间 |
| `last_success_at` | INTEGER NULL | 最近成功时间 |
| `last_error` | TEXT NULL | 最近错误摘要 |
| `lease_token` | TEXT NULL | 当前执行租约标识 |
| `lease_until` | INTEGER NULL | 租约过期时间 |
| `version` | INTEGER | 乐观锁版本号 |
| `created_at` | INTEGER | 创建时间 |
| `updated_at` | INTEGER | 更新时间 |

建议约束：

- `UNIQUE(namespace, job_key)`

建议索引：

- `(status, next_run_at)`
- `(lease_until)`
- `(executor_key)`

### 7.2 `scheduler_job_runs`

用途：任务每次执行的明细日志。

建议字段：

| 字段 | 类型建议 | 说明 |
|---|---|---|
| `id` | INTEGER PK | 主键 |
| `job_id` | INTEGER | 关联任务 |
| `trigger_source` | TEXT | `scheduled` / `manual` / `retry` |
| `scheduled_at` | INTEGER | 理论计划执行时间 |
| `started_at` | INTEGER | 实际开始时间 |
| `finished_at` | INTEGER NULL | 结束时间 |
| `status` | TEXT | `running` / `success` / `failed` / `skipped` |
| `attempt_no` | INTEGER | 第几次尝试 |
| `worker_invocation_id` | TEXT NULL | Worker 侧追踪 ID |
| `duration_ms` | INTEGER NULL | 执行耗时 |
| `result_json` | TEXT NULL | 成功结果摘要 |
| `error_text` | TEXT NULL | 失败原因 |
| `created_at` | INTEGER | 创建时间 |

建议索引：

- `(job_id, created_at DESC)`
- `(status, created_at DESC)`

---

## 8. 执行器插件接口设计

### 8.1 核心思想

数据库里不存“代码逻辑”，只存：

- 要执行哪个执行器 `executor_key`
- 传什么参数 `payload_json`

具体执行器通过代码注册。

这样可以保证：

1. 逻辑边界清晰
2. 安全性更高
3. 版本升级可控
4. 更符合当前仓库现有插件注册风格

### 8.2 接口草案

建议抽象：

#### `SchedulerExecutor`

字段：

- `key`：唯一标识
- `description`：说明
- `timeoutMs?`：建议超时时间
- `supportsManualTrigger?`：是否支持手动触发

方法：

- `validate(payload)`：校验任务参数
- `execute(context)`：执行实际业务

#### `SchedulerExecutionContext`

建议包含：

- `env`
- `job`
- `run`
- `now`
- `triggerSource`
- `traceId`
- `logger`

#### `SchedulerExecutionResult`

建议包含：

- `status`
- `message`
- `result`
- `retryAfterSec?`

---

## 9. 调度流程设计

### 9.1 `scheduled` 触发流程

```text
scheduled() 触发
  ↓
查询到期任务（status=active 且 next_run_at <= now）
  ↓
按批次遍历任务
  ↓
尝试抢占 lease
  ↓
创建 run 记录（running）
  ↓
执行 executor.validate(payload)
  ↓
执行 executor.execute(context)
  ↓
根据结果：成功 / 失败 / 跳过
  ↓
更新 scheduler_jobs 与 scheduler_job_runs
```

### 9.2 抢占策略

MVP 推荐简单 lease 模型：

- `lease_until` 表示当前执行权截止时间
- 若 `lease_until < now`，可重新抢占
- 抢占时更新：
  - `lease_token`
  - `lease_until`
  - `version = version + 1`

目标：

- 防止同一任务被重复执行
- 为后续并发安全留空间

### 9.3 成功后的处理

#### 周期任务 `cron`

- 计算下一次 `next_run_at`
- 保持 `status = active`

#### 一次性任务 `once`

- 执行成功后可标记为 `disabled` 或 `completed`

#### 延迟任务 `delay`

- 执行成功后同样转为完成态

### 9.4 失败后的处理

如果未超过 `retry_limit`：

- `next_run_at = now + retry_backoff_sec`
- `trigger_source` 下次记为 `retry`

如果已超过限制：

- 保留 `last_error`
- 视情况设为 `paused` 或 `failed_terminal`

MVP 可先简化为：

- 成功：重算下次执行时间
- 失败：延迟重试，超限后暂停

---

## 10. 管理 API 草案

建议复用当前 `src/index.ts` 里已有 `/admin/*` 风格与 `ADMIN_TOKEN` 鉴权。

### 10.1 API 列表

#### `GET /admin/scheduler/jobs`

用途：分页查看任务列表。

返回重点：

- 基本信息
- 状态
- 下次运行时间
- 最近成功/失败信息

#### `POST /admin/scheduler/jobs`

用途：创建任务。

请求体示例：

```json
{
  "namespace": "system",
  "jobKey": "heartbeat-owner",
  "name": "给主人发送心跳",
  "executorKey": "send-wechat-text",
  "scheduleType": "cron",
  "cronExpr": "0 9 * * *",
  "timezone": "Asia/Shanghai",
  "payload": {
	"receiver": "wxid_xxx",
	"content": "定时任务正常运行"
  },
  "retryLimit": 3,
  "retryBackoffSec": 60,
  "concurrencyPolicy": "forbid"
}
```

#### `GET /admin/scheduler/jobs/:id`

用途：查看任务详情。

#### `POST /admin/scheduler/jobs/:id/update`

用途：更新任务定义。

#### `POST /admin/scheduler/jobs/:id/pause`

用途：暂停任务。

#### `POST /admin/scheduler/jobs/:id/resume`

用途：恢复任务。

#### `POST /admin/scheduler/jobs/:id/trigger`

用途：手动立即执行一次。

说明：

- 不改变周期定义
- 仅产生一次即时 run

#### `GET /admin/scheduler/jobs/:id/runs`

用途：查看执行日志。

#### `GET /admin/scheduler/executors`

用途：查看当前代码已注册执行器。

返回内容：

- `key`
- `description`
- 是否支持手动触发

---

## 11. 推荐的首批执行器

MVP 建议只做 2 个执行器，先跑通完整链路。

### 11.1 `heartbeat`

用途：

- 只写日志
- 或写入 KV / D1 心跳标记

价值：

- 无副作用
- 最适合本地和线上联调

### 11.2 `send-wechat-text`

用途：

- 定时发送文本给指定微信 ID

可复用现有：

- `src/wechat/api.ts`
- `src/wechat/index.ts` 中的发送逻辑

价值：

- 直接验证主动消息链路
- 为后续更复杂任务打样

### 11.3 后续执行器预留

- `send-wechat-app`
- `fake-forward-flush`
- `common-plugin-workflow-trigger`
- `xiuxian-daily-reset`

---

## 12. 与伪造转发需求的衔接方式

后续“伪造转发超时自动发送”可以直接复用本调度中心。

### 12.1 未来业务流

1. 用户发送 `转发开始`
2. 系统创建草稿会话
3. 同时创建一个 `delay` 任务，2 分钟后执行
4. 用户每次 `转发添加`，都把该任务的 `next_run_at` 向后推 2 分钟
5. 超时后调度中心扫到任务
6. 执行 `fake-forward-flush`
7. 构造微信聊天记录卡片并主动发出
8. 更新会话状态与任务状态

### 12.2 为什么先做调度中心是对的

因为伪造转发的“自动发送”本质就是：

- 一个可维护的延迟任务
- 一个执行器
- 一条运行记录

而不是单纯的文本插件逻辑。

---

## 13. MVP 范围定义

### 13.1 本阶段必须完成

1. `wrangler.toml` 增加单一 cron trigger
2. `src/index.ts` 增加 `scheduled` 入口
3. 新增 `src/scheduler/*` 基础模块
4. D1 两张表：`scheduler_jobs`、`scheduler_job_runs`
5. 执行器注册机制
6. 首批两个执行器：`heartbeat`、`send-wechat-text`
7. 管理 API：
   - 创建任务
   - 查看任务列表
   - 暂停/恢复任务
   - 手动触发任务
   - 查看执行日志

### 13.2 本阶段可延后

- 死信队列
- 复杂 misfire 策略
- 批量任务操作
- 任务模板
- 前端可视化控制台
- 告警通知

---

## 14. 开发阶段拆分建议

### Phase 1：接入基础心跳

目标：先让 Worker 具备 `scheduled` 能力。

交付：

- `wrangler.toml` 增加 cron
- `src/index.ts` 增加 `scheduled`
- 一个最小的 heartbeat 执行器

### Phase 2：建 D1 任务中心

目标：让任务不再写死在代码里。

交付：

- `scheduler_jobs`
- `scheduler_job_runs`
- repository 层

### Phase 3：补执行器注册表

目标：形成“任务定义在 DB，逻辑定义在代码”的模式。

交付：

- `SchedulerExecutor`
- `ExecutorRegistry`
- `send-wechat-text`

### Phase 4：补管理 API

目标：做到任务可维护。

交付：

- `/admin/scheduler/*`
- CRUD + 触发 + runs 查询

### Phase 5：接业务任务

目标：接入真实业务。

候选：

- 伪造转发超时自动发送
- 插件配置定时刷新
- 定时给主人发日报

---

## 15. 本地与线上验证方案

### 15.1 本地验证

建议流程：

1. 本地创建 D1 表
2. 启动 Worker 本地开发
3. 用 scheduled 测试模式触发
4. 查看日志与 D1 运行记录
5. 通过 `/admin/scheduler/*` 创建与管理任务

关注点：

- `scheduled` 是否正常进入
- 是否能正确扫描到期任务
- 是否能正确创建 `run` 记录
- 是否能正确重算 `next_run_at`

### 15.2 线上验证

建议先从**无副作用任务**开始：

1. `heartbeat`
2. 低频 `send-wechat-text`

观察手段：

- Worker Logs
- D1 中 `scheduler_jobs`
- D1 中 `scheduler_job_runs`
- `/admin/scheduler/jobs/:id/runs`

---

## 16. 风险与注意事项

### 16.1 幂等性

Cloudflare 环境下，任务执行应按“至少一次”心智设计。

因此执行器要尽量做到：

- 重复执行可接受
- 或能识别已经执行过

### 16.2 锁与并发

虽然 MVP 是单 Worker 调度，但仍建议一开始就使用：

- `lease_until`
- `lease_token`
- `version`

为后续并发保护留接口。

### 16.3 时区

cron 的业务语义必须明确时区。

建议：

- MVP 固定使用 `Asia/Shanghai`
- 文档与 API 都显式带 `timezone`

### 16.4 长任务风险

不建议在 MVP 中放入：

- 大批量长耗时处理
- 强一致金融类任务
- 高并发重 CPU 任务

### 16.5 漏跑策略

如果 Worker 某次触发延迟，或任务错过原计划时间，需要提前定义策略：

- 立即补跑
- 跳过本次
- 仅保留下一次周期

MVP 可先简化成：

- 到期就跑一次
- 成功后计算下一次

---

## 17. 推荐的 MVP 实施顺序

建议按下面顺序开工：

1. **先接 `scheduled`**
2. **再建 D1 两张表**
3. **再写 `repository + center`**
4. **再做执行器注册表**
5. **先落地 `heartbeat`**
6. **再落地 `send-wechat-text`**
7. **最后补 `/admin/scheduler/*`**

这样可以保证每一阶段都能独立验证。

---

## 18. 最终结论

这套方案的核心思想是：

> 把 Cloudflare `scheduled` 当作统一时钟，
> 把 D1 当作任务中心和运行日志中心，
> 把代码内执行器当作业务执行单元。

它不是 1:1 复制 Java `snailjob`，但在当前 Worker 架构下，可以实现一套**足够像、且足够可维护**的轻量调度中心。

对当前项目而言，这也是后续承载“伪造转发自动发送”“定时通知”“定时清理/同步”等需求的最合适基础设施。

---

## 19. 后续建议产物

如果按本设计继续推进，建议下一步补两份文件：

1. `_docs/scheduler/scheduler-mvp.sql`
   - 调度中心两张表的建表 SQL

2. `_docs/scheduler/scheduler-api-draft.md`
   - `/admin/scheduler/*` 的请求/响应草案

届时即可进入正式编码阶段。


