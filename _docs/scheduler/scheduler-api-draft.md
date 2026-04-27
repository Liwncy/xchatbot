# Scheduler Admin API 草案（MVP）

> 面向 `xchatbot` 当前已实现的定时任务中心接口。
> 管理接口沿用现有 `/admin/*` 风格，默认要求：
>
> `Authorization: Bearer <ADMIN_TOKEN>`

---

## 1. 鉴权说明

当 `ADMIN_TOKEN` 已配置时，所有 `/admin/scheduler/*` 接口都需要：

```http
Authorization: Bearer <ADMIN_TOKEN>
```

当 `ADMIN_TOKEN` 未配置时，本地开发环境可直接访问。

---

## 2. 接口清单

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/admin/scheduler/executors` | 查看当前已注册执行器 |
| `GET` | `/admin/scheduler/jobs` | 分页查看任务列表 |
| `POST` | `/admin/scheduler/jobs` | 创建任务 |
| `GET` | `/admin/scheduler/jobs/:id` | 查看任务详情 |
| `POST` | `/admin/scheduler/jobs/:id/update` | 更新任务定义 |
| `POST` | `/admin/scheduler/jobs/:id/pause` | 暂停任务 |
| `POST` | `/admin/scheduler/jobs/:id/resume` | 恢复任务 |
| `POST` | `/admin/scheduler/jobs/:id/trigger` | 立即手动执行一次 |
| `GET` | `/admin/scheduler/jobs/:id/runs` | 查看任务执行记录 |

---

## 3. 执行器列表

### `GET /admin/scheduler/executors`

返回示例：

```json
{
  "items": [
    {
      "key": "heartbeat",
      "description": "写入心跳日志，可选同步写入 KV 键",
      "supportsManualTrigger": true
    },
    {
      "key": "send-wechat-text",
      "description": "主动发送一条微信文本消息",
      "supportsManualTrigger": true
    }
  ]
}
```

---

## 4. 任务列表

### `GET /admin/scheduler/jobs?limit=20&offset=0`

返回示例：

```json
{
  "total": 1,
  "limit": 20,
  "offset": 0,
  "items": [
    {
      "id": 1,
      "namespace": "system",
      "jobKey": "heartbeat-demo",
      "name": "本地心跳演示",
      "status": "active",
      "executorKey": "heartbeat",
      "scheduleType": "delay",
      "cronExpr": null,
      "timezone": null,
      "misfirePolicy": "fire_once",
      "retryLimit": 1,
      "retryBackoffSec": 30,
      "retryCount": 0,
      "concurrencyPolicy": "forbid",
      "nextRunAt": 1777279960,
      "lastRunAt": null,
      "lastSuccessAt": null,
      "lastError": null,
      "leaseToken": null,
      "leaseUntil": null,
      "version": 0,
      "createdAt": 1777279930,
      "updatedAt": 1777279930,
      "payload": {
        "kvKey": "scheduler:heartbeat:demo",
        "logMessage": "local heartbeat demo"
      }
    }
  ]
}
```

---

## 5. 创建任务

### `POST /admin/scheduler/jobs`

支持三类调度方式：

- `cron`
- `once`
- `delay`

### 5.1 创建延迟任务

```json
{
  "namespace": "system",
  "jobKey": "heartbeat-delay-demo",
  "name": "延迟心跳",
  "executorKey": "heartbeat",
  "scheduleType": "delay",
  "delaySeconds": 120,
  "payload": {
    "kvKey": "scheduler:heartbeat:delay-demo",
    "logMessage": "delay heartbeat demo"
  },
  "retryLimit": 1,
  "retryBackoffSec": 30,
  "concurrencyPolicy": "forbid"
}
```

### 5.2 创建一次性任务

```json
{
  "namespace": "system",
  "jobKey": "once-demo",
  "name": "一次性任务",
  "executorKey": "heartbeat",
  "scheduleType": "once",
  "runAt": "2026-04-28T09:00:00+08:00",
  "payload": {
    "logMessage": "run once"
  }
}
```

### 5.3 创建周期任务

```json
{
  "namespace": "system",
  "jobKey": "morning-heartbeat",
  "name": "每天早上 9 点心跳",
  "executorKey": "heartbeat",
  "scheduleType": "cron",
  "cronExpr": "0 9 * * *",
  "timezone": "Asia/Shanghai",
  "payload": {
    "logMessage": "good morning"
  },
  "retryLimit": 3,
  "retryBackoffSec": 60,
  "concurrencyPolicy": "forbid"
}
```

### 5.4 创建微信文本通知任务

```json
{
  "namespace": "wechat",
  "jobKey": "owner-daily-ping",
  "name": "给主人发定时通知",
  "executorKey": "send-wechat-text",
  "scheduleType": "cron",
  "cronExpr": "0 9 * * *",
  "timezone": "Asia/Shanghai",
  "payload": {
    "receiver": "wxid_xxx",
    "content": "早上好，定时任务运行正常～"
  },
  "retryLimit": 2,
  "retryBackoffSec": 120,
  "concurrencyPolicy": "forbid"
}
```

如果不传 `payload.receiver`，执行器会尝试使用环境变量 `BOT_OWNER_WECHAT_ID` 作为默认接收人。

---

## 6. 查看任务详情

### `GET /admin/scheduler/jobs/:id`

返回字段与列表项基本一致，但仅返回单个任务。

---

## 7. 更新任务

### `POST /admin/scheduler/jobs/:id/update`

用途：

- 更新任务的名称、执行器、调度类型、参数与重试配置
- 未传字段默认沿用旧值
- 更新后会清空当前 lease 与最近错误，并重置重试计数

示例：把一个已有 `heartbeat` 任务改成 cron 周期任务：

```json
{
  "name": "每天 9 点心跳",
  "scheduleType": "cron",
  "cronExpr": "0 9 * * *",
  "timezone": "Asia/Shanghai",
  "payload": {
    "kvKey": "scheduler:heartbeat:daily",
    "logMessage": "daily heartbeat"
  },
  "retryLimit": 2,
  "retryBackoffSec": 120
}
```

如果更新为 `delay`：

```json
{
  "scheduleType": "delay",
  "delaySeconds": 300
}
```

如果更新为 `once`：

```json
{
  "scheduleType": "once",
  "runAt": "2026-04-28T10:00:00+08:00"
}
```

---

## 8. 暂停与恢复

### `POST /admin/scheduler/jobs/:id/pause`

作用：

- 将任务状态切为 `paused`
- 清除当前 lease，避免继续被调度

### `POST /admin/scheduler/jobs/:id/resume`

作用：

- 将任务状态切回 `active`
- 若为 `cron` 任务，会重新计算下一次执行时间
- 若为 `delay/once` 且原时间已过，会基于当前时间顺延一个基础退避周期

---

## 9. 手动触发

### `POST /admin/scheduler/jobs/:id/trigger`

语义：

- 立即执行一次任务
- 不改写原周期计划
- 结果会进入 `scheduler_job_runs`

返回示例：

```json
{
  "ok": true,
  "job": {
    "id": 1,
    "status": "active",
    "lastRunAt": 1777279962,
    "lastSuccessAt": 1777279962,
    "payload": {
      "kvKey": "scheduler:heartbeat:api-demo",
      "logMessage": "api heartbeat demo"
    }
  },
  "run": {
    "id": 1,
    "jobId": 1,
    "triggerSource": "manual",
    "status": "success",
    "startedAt": 1777279962,
    "finishedAt": 1777279962,
    "result": {
      "message": "api heartbeat demo"
    }
  }
}
```

当任务正处于 lease 中，可能返回 `409`。

---

## 10. 执行记录

### `GET /admin/scheduler/jobs/:id/runs?limit=20&offset=0`

返回示例：

```json
{
  "job": {
    "id": 2,
    "jobKey": "heartbeat-scheduled-demo",
    "status": "disabled"
  },
  "total": 1,
  "limit": 20,
  "offset": 0,
  "items": [
    {
      "id": 3,
      "jobId": 2,
      "triggerSource": "scheduled",
      "scheduledAt": 1777279983,
      "startedAt": 1777279984,
      "finishedAt": 1777279984,
      "status": "success",
      "attemptNo": 1,
      "workerInvocationId": "tick_xxx",
      "durationMs": 0,
      "errorText": null,
      "result": {
        "message": "scheduled heartbeat demo"
      }
    }
  ]
}
```

---

## 11. 错误约定

常见错误响应：

```json
{
  "error": "Unauthorized"
}
```

```json
{
  "error": "Unsupported executorKey: xxx"
}
```

```json
{
  "error": "scheduleType must be one of cron/once/delay"
}
```

```json
{
  "ok": false,
  "error": "Job is currently leased or not found"
}
```

---

## 12. 推荐联调顺序

1. 先调用 `GET /admin/scheduler/executors` 确认执行器已注册
2. 再创建一个 `heartbeat` 的 `delay` 任务
3. 调用 `POST /admin/scheduler/jobs/:id/trigger` 验证手动执行
4. 再用本地 `scheduled` 测试入口验证自动调度
5. 最后再联调 `send-wechat-text`


