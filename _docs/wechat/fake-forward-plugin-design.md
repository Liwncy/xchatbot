# 伪造转发插件设计稿（MVP / KV 版）

> 面向当前 `xchatbot` 仓库的“伪造聊天记录转发”功能设计。
> 目标是基于现有 `wechat chat-record + scheduler delay + 文本插件 + KV` 能力，做一个轻量、可维护、可自动发送的草稿式插件。

---

## 1. 目标与范围

### 1.1 目标

本设计稿希望实现一个“伪造转发记录”插件，支持：

1. 用户通过文本指令开启一份聊天记录草稿
2. 用户在草稿中定义多个“角色”，每个角色包含：姓名、头像
3. 用户通过后续指令按“角色 + 时间 + 内容”追加伪造聊天记录
4. 用户可手动预览、撤回最后一条、发送、取消
5. 若连续 **2 分钟** 没有新的相关指令，则自动发送
6. 自动发送能力复用现有 `scheduler`，而不是在插件内自己维护定时器
7. 草稿状态不落 D1 业务表，改为短期存放在 `KV`
8. 发送内容优先复用现有 `src/wechat/chat-record.ts` 的聊天记录卡片构造能力

### 1.2 MVP 非目标

MVP 暂不做：

- 真正可点击/可预览的图片条目伪造
- 真正可播放的视频条目伪造
- 语音条目伪造
- 自定义头像抓取与上传
- 已发送消息的“撤回整条卡片”指令
- 多草稿并行编辑
- Web 管理界面

> 注：
> “撤回”在 MVP 中指 **撤回草稿中的最后一条聊天项**，不是撤回已经发出的微信消息。

---

## 2. 当前能力评估

当前仓库已有以下能力可直接复用：

- `src/plugins/types.ts`
  - 文本插件匹配与处理入口
- `src/wechat/chat-record.ts`
  - 构造微信聊天记录 `appXml`
- `src/wechat/index.ts`
  - 发送 `app` 类型消息
- `src/scheduler/*`
  - 延迟任务 / 管理接口 / D1 任务中心
- `src/scheduler-ext/*`
  - 业务侧执行器扩展注册点
- `XBOT_KV`
  - 适合保存短生命周期草稿态

### 2.1 已确认可实现

基于当前 `src/wechat/chat-record.ts`，以下能力已经明确可做：

- 文本型聊天记录项
- 自定义昵称
- 自定义头像 URL
- 自定义时间戳
- 多条记录合并为一张聊天记录卡片

原因是当前 `WechatChatRecordItem` 已支持：

- `nickname`
- `content`
- `avatarUrl`
- `timestampMs`

### 2.2 当前不建议直接做的内容

基于现有实现，**图片 / 视频类型的伪造记录项，当前不建议纳入 MVP**。

原因：

1. 现有 `buildWechatChatRecordAppXml` 内部只构造了 `datatype="1"` 的文本数据项
2. 图片/视频记录项通常需要不同的 `datatype` 与额外 XML 字段
3. 很可能还涉及真实媒体元数据、缩略图、cdn / attach 信息，兼容成本高
4. 即使拼出“像图片/视频”的 XML，也未必能在微信里稳定展示或打开

### 2.3 对图片 / 视频的建议结论

结论分两层：

#### MVP 可做

使用文本占位方式模拟：

- `[图片] 海边日落.jpg`
- `[视频] 聚餐现场.mp4`

这本质上仍是**文本聊天项**，但能在视觉上表达“这是一条图片/视频消息”。

#### 后续可研究

若未来要支持“更像真的图片/视频聊天项”，需要单独研究：

- 微信聊天记录 `recorditem` 中不同 `datatype` 的 XML 结构
- 图片 / 视频所需的附加字段
- 是否需要真实可访问的资源 URL
- 当前网关是否支持相关发送方式

因此：

> **第一版先做“文本 + 头像 + 时间 + 角色”最稳。**

---

## 3. 用户交互设计

### 3.1 指令前缀

MVP 建议统一使用前缀：

- `伪转发`

### 3.2 指令集合（新版）

#### 开始草稿

```text
伪转发 开始
伪转发 开始 昨晚群聊
```

说明：

- 不带标题时，群聊默认标题为 `群聊的聊天记录`
- 私聊默认标题为 `聊天记录`
- 若当前已有未完成草稿，则提示用户继续编辑或先取消

#### 定义角色

```text
伪转发 角色 A 张三 https://example.com/a.jpg
伪转发 角色 B 李四 https://example.com/b.jpg
```

固定语法建议：

```text
伪转发 角色 <角色ID> <姓名> [头像URL]
```

约定：

- `角色ID` 用于后续聊天时引用，如 `A` / `B` / `C`
- `姓名` 为展示名称
- `头像URL` 可选；省略时使用默认空头像 URL

#### 追加聊天项

```text
伪转发 聊天 A 09:12 你到了吗
伪转发 聊天 B 09:13 快了，楼下了
伪转发 聊天 A 2026-04-29 09:15 今天别迟到
```

固定语法建议：

```text
伪转发 聊天 <角色ID> <时间> <内容>
```

时间格式 MVP 建议支持：

- `HH:mm`
- `YYYY-MM-DD HH:mm`

解析策略：

- 若仅提供 `HH:mm`，默认使用当天日期
- 若无法解析，则提示格式错误

#### 批量追加聊天项（增强）

```text
伪转发 聊天 2026-04-29 09:13
A：你好
B：我好
A 09:15：你真棒
B：确实
```

批量模式语法：

```text
伪转发 聊天 [批次默认时间]
<角色ID> [时间]：<内容>
<角色ID> [时间]：<内容>
...
```

说明：

- 批次第一行可选提供默认时间
- 每条聊天行也可以单独写时间，如 `A 09:15：你真棒`
- 若某一行不写时间，则沿用上一条消息时间
- 若整批第一条也没有时间，则以当前时间作为起始时间
- 当某一行写的是 `HH:mm`，且前面已经出现过完整日期时间时，默认沿用上一条的日期

#### 预览草稿

```text
伪转发 预览
```

返回内容建议为纯文本摘要：

- 草稿标题
- 当前角色列表
- 当前已有条数
- 最近几条内容
- 自动发送倒计时说明

#### 撤回最后一条聊天项

```text
伪转发 撤回
```

说明：

- 删除最后一条“聊天项”
- 不删除角色定义

#### 结束并发送

```text
伪转发 结束
伪转发 发送
```

建议二者都支持，并视为同义指令。

#### 取消草稿

```text
伪转发 取消
```

丢弃当前草稿，并停止后续自动发送。

### 3.3 自动发送规则

- 每次执行与该草稿相关的有效命令时，都将自动发送时间刷新为：`当前时间 + 120 秒`
- 如果 120 秒内没有新的相关命令，则由 scheduler 自动触发发送
- 自动发送成功后，删除草稿 KV

---

## 4. 会话范围与约束

### 4.1 草稿归属

MVP 建议：**一个用户在一个会话里最多只有 1 个活跃草稿**。

会话维度按当前消息来源区分：

- 群聊：`wechat:group:<roomId>:<initiatorWxid>`
- 私聊：`wechat:private:<fromWxid>:<initiatorWxid>`

其中：

- `initiatorWxid` = 发起该草稿命令的用户
- 群聊消息实际发送目标 = `room.id`
- 私聊消息实际发送目标 = 当前对话用户

### 4.2 基础限制

MVP 建议加上以下约束：

- 单草稿最多 `20` 条聊天项
- 单草稿最多 `10` 个角色
- 单个角色名最大 `30` 字符
- 单条内容最大 `300` 字符
- 空草稿不允许发送
- 聊天项必须引用已定义角色
- 第一版仅支持文本型聊天项

---

## 5. 模块拆分建议

为保持 `scheduler core` 纯净，建议按以下结构落地：

```text
src/
  plugins/
    wechat/
      fake-forward.ts         # 文本指令入口插件
      fake-forward-service.ts # 草稿业务服务
      fake-forward-kv.ts      # KV 读写封装
      fake-forward-types.ts   # 领域类型
      fake-forward-reply.ts   # 文本预览/提示语构造

  scheduler-ext/
    fake-forward-flush.ts     # 自动发送执行器
```

### 各模块职责

#### `src/plugins/wechat/fake-forward.ts`

负责：

- 匹配 `伪转发 ...` 指令
- 解析子命令
- 调用 service 完成业务
- 返回文本提示或聊天记录卡片

#### `src/plugins/wechat/fake-forward-service.ts`

负责：

- 创建草稿
- 定义 / 更新角色
- 追加聊天项
- 预览
- 撤回最后一条
- 取消
- 手动发送
- 刷新自动发送 delay 任务
- 与 scheduler 交互

#### `src/plugins/wechat/fake-forward-kv.ts`

负责：

- 草稿 KV 读写
- TTL 刷新
- JSON 序列化 / 反序列化
- 版本号更新

#### `src/scheduler-ext/fake-forward-flush.ts`

负责：

- 接收 scheduler delay 任务
- 校验草稿版本与 `autoSendAt`
- 调用 service 执行自动发送
- 确保幂等

---

## 6. KV 数据模型设计

MVP 不再新增 `fake_forward_drafts` / `fake_forward_items` 两张 D1 业务表。

草稿统一保存在 `XBOT_KV`。

### 6.1 KV key 设计

建议格式：

```text
fake-forward:draft:<sessionKey>
```

示例：

```text
fake-forward:draft:wechat:group:123@chatroom:wxid_abc
```

### 6.2 KV value 结构

建议存一个完整 JSON：

```json
{
  "sessionKey": "wechat:group:123@chatroom:wxid_abc",
  "source": "group",
  "initiatorId": "wxid_abc",
  "receiverId": "123@chatroom",
  "roomId": "123@chatroom",
  "title": "昨晚群聊",
  "version": 4,
  "autoSendAt": 1745892000,
  "createdAt": 1745891800,
  "updatedAt": 1745891880,
  "roles": {
    "A": {
      "id": "A",
      "name": "张三",
      "avatarUrl": "https://example.com/a.jpg"
    },
    "B": {
      "id": "B",
      "name": "李四",
      "avatarUrl": "https://example.com/b.jpg"
    }
  },
  "items": [
    {
      "seq": 1,
      "roleId": "A",
      "timestampMs": 1745891520000,
      "content": "你到了吗",
      "kind": "text"
    },
    {
      "seq": 2,
      "roleId": "B",
      "timestampMs": 1745891580000,
      "content": "快了，楼下了",
      "kind": "text"
    }
  ]
}
```

### 6.3 TTL 设计

不建议把 TTL 直接设为 120 秒。

建议：

- `autoSendAt = now + 120`
- KV TTL 设为 `1800` 秒（30 分钟）

原因：

- 到 2 分钟时，scheduler 还能读到草稿并发送
- 若自动发送失败，草稿仍可保留并重试
- 手动继续编辑时可刷新 TTL

草稿在以下时机主动删除：

- 成功发送后
- 用户取消后

---

## 7. 与 scheduler 的关系

### 7.1 核心原则

自动发送必须复用现有 scheduler，而不是在插件内放内存定时器。

原因：

- Worker 不是常驻进程
- 插件内定时器不可靠
- KV 过期只能删数据，不能自动执行“发送”动作

### 7.2 delay 任务约定

每份草稿对应一条 delay 任务：

- `namespace = "fake-forward"`
- `jobKey = sessionKey`
- `scheduleType = "delay"`
- `executorKey = "fake-forward-flush"`

建议 payload：

```json
{
  "sessionKey": "wechat:group:123@chatroom:wxid_abc",
  "version": 4
}
```

### 7.3 自动顺延机制

每次执行以下命令时，都更新草稿版本并顺延 delay：

- `开始`
- `角色`
- `聊天`
- `撤回`
- `预览`

建议顺延规则：

- `autoSendAt = now + 120`
- 更新已有 scheduler job 的 `next_run_at`
- 同时更新 payload 中的 `version`

### 7.4 幂等策略

`src/scheduler-ext/fake-forward-flush.ts` 执行时，应检查：

1. KV 草稿是否存在
2. payload.version 是否等于当前草稿 `version`
3. 当前时间是否已达到 `autoSendAt`
4. 草稿是否仍有有效聊天项

若任一条件不满足，则直接 `skipped`，避免旧任务误发。

---

## 8. 发送流程设计

### 8.1 手动发送

```text
用户发送：伪转发 结束
  ↓
插件解析命令
  ↓
service 从 KV 读取草稿
  ↓
按角色定义展开 items（昵称 / 头像 / 时间）
  ↓
buildWechatChatRecordAppReply(...)
  ↓
发送 app 消息
  ↓
发送成功后删除 KV 草稿
  ↓
原 delay 任务后续即使触发，也会因 version 不匹配或草稿不存在而 skipped
```

### 8.2 自动发送

```text
scheduler tick
  ↓
命中 namespace=fake-forward 的 due job
  ↓
executor: fake-forward-flush
  ↓
按 sessionKey + version 校验 KV 草稿
  ↓
调用同一个 flushDraft(service)
  ↓
构造 app 聊天记录并发送
  ↓
删除 KV 草稿
```

### 8.3 统一 flush 入口

建议无论是：

- 手动发送
- 自动发送

都调用同一个 service 方法，例如：

- `flushDraft(sessionKey, mode)`

---

## 9. 聊天记录卡片构造

建议直接复用：

- `buildWechatChatRecordAppReply`

构造参数来源：

- `title`：草稿标题
- `items`：由草稿中的 `items` + `roles` 展开得到
- `item.nickname`：来自角色姓名
- `item.avatarUrl`：来自角色头像 URL
- `item.timestampMs`：来自聊天项时间
- `item.content`：来自聊天项内容
- `isChatRoom`：消息来源为群聊时传 `true`

### 9.1 角色与聊天项展开规则

例如草稿中：

- 角色 `A` = 张三 / 头像 A
- 角色 `B` = 李四 / 头像 B

聊天项：

- `A 09:12 你到了吗`
- `B 09:13 快了`

发送前展开为：

```ts
[
  { nickname: '张三', avatarUrl: '...', timestampMs: ..., content: '你到了吗' },
  { nickname: '李四', avatarUrl: '...', timestampMs: ..., content: '快了' },
]
```

---

## 10. 关于图片 / 视频伪造的专项结论

### 10.1 当前能不能实现？

#### 文字占位版：能

例如：

```text
伪转发 聊天 A 09:15 [图片] 海边日落
伪转发 聊天 B 09:16 [视频] 包厢现场
```

这仍然是文本消息，只是视觉上模拟“图片 / 视频消息”。

#### 真图片 / 真视频记录项：当前不建议承诺

原因：

- 当前代码只支持文本 `datatype="1"`
- 尚未验证微信聊天记录卡片中图片/视频项的 XML 结构
- 未验证是否需要真实媒体元数据或附件字段
- 即使能生成，也不保证微信端稳定展示

### 10.2 文档结论

因此文档层面的推荐是：

1. **MVP 正式支持：文本聊天项**
2. **MVP 允许：用文本占位模拟图片/视频**
3. **后续研究项：真正图片/视频记录项**

---

## 11. 插件回复文案建议

### 11.1 开始

```text
已开始伪转发草稿。
标题：昨晚群聊
请先使用“伪转发 角色 角色ID 姓名 [头像URL]”定义角色。
然后使用“伪转发 聊天 角色ID 时间 内容”追加聊天项。
2 分钟无新命令将自动发送。
```

### 11.2 定义角色成功

```text
已定义角色 A：张三
头像：https://example.com/a.jpg
```

### 11.3 追加聊天成功

```text
已添加第 3 条：A 09:12 你到了吗
2 分钟无新命令将自动发送。
```

### 11.4 预览

```text
【伪转发草稿预览】
标题：昨晚群聊
角色：
- A：张三
- B：李四
聊天项：3
1. A 09:12 你到了吗
2. B 09:13 快了，楼下了
3. A 09:15 今天别迟到
输入“伪转发 结束”立即发出，或等待 2 分钟自动发送。
```

### 11.5 撤回

```text
已撤回最后一条聊天项，当前还剩 2 条。
```

### 11.6 取消

```text
已取消当前伪转发草稿。
```

---

## 12. 风险与边界

### 12.1 并发与重复触发

风险：

- 用户手动发送与 scheduler 自动发送几乎同时发生
- 旧 delay 任务在新版本草稿之后触发

解决方式：

- KV 草稿维护 `version`
- flush 前再次读取并校验版本与 `autoSendAt`
- 发送成功后立即删除草稿 KV

### 12.2 KV 的一致性边界

KV 适合短生命周期草稿，但不是强一致数据库。

因此设计上应做到：

- 一个会话只允许一个活跃草稿
- 所有修改都走同一个 service
- 调度任务用 `version` 防旧任务误发

### 12.3 内容滥用

该功能本质上是“合成聊天记录卡片”，建议预留开关：

- 是否默认启用
- 是否仅 owner / 白名单可用
- 是否默认加轻度标识（例如标题前缀）

### 12.4 发送失败

发送失败时建议：

- 草稿暂不删除
- 保持 KV 继续有效一段时间
- 由 scheduler 按重试策略重试，或等待用户继续操作

---

## 13. MVP 实施顺序

建议按以下顺序开发：

1. 先确认文档与命令语法
2. 新增 `fake-forward-types.ts`
3. 新增 `fake-forward-kv.ts`
4. 新增 `fake-forward-service.ts`，先打通：开始 / 角色 / 聊天 / 预览 / 撤回 / 取消 / 手动发送
5. 新增 `src/scheduler-ext/fake-forward-flush.ts`
6. 接入 2 分钟 delay 自动发送
7. 最后在 `src/plugins/index.ts` 注册插件

---

## 14. 建议的 MVP 命令结论

第一版建议最终定为：

```text
伪转发 开始 [标题]
伪转发 角色 <角色ID> <姓名> [头像URL]
伪转发 聊天 <角色ID> <时间> <内容>
伪转发 预览
伪转发 撤回
伪转发 结束
伪转发 发送
伪转发 取消
```

这套命令：

- 能覆盖“角色定义 + 聊天造句 + 结束发送”的完整流程
- 解析相对稳定
- 支持头像与显式时间
- 方便后续扩展图片/视频占位语法

---

## 15. 下一步产物

如果按本设计继续推进，下一步建议直接进入代码阶段：

- `src/plugins/wechat/fake-forward.ts`
- `src/plugins/wechat/fake-forward-service.ts`
- `src/plugins/wechat/fake-forward-kv.ts`
- `src/plugins/wechat/fake-forward-types.ts`
- `src/plugins/wechat/fake-forward-reply.ts`
- `src/scheduler-ext/fake-forward-flush.ts`

当前版本**不再需要补 `fake-forward-mvp.sql`**，因为草稿数据改存 `KV`。


