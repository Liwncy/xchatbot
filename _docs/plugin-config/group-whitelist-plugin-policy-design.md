# 联系人白名单与插件权限设计稿（D1 主源）

相关入口：[`README.md`](../../README.md) · [`_docs/README.md`](../README.md)

## 1. 背景

当前项目已具备：

- 微信消息统一入口：`src/wechat/index.ts`
- 系统命令插件能力：`src/plugins/system/*`
- 机器人主人权限模型：`message.from === env.BOT_OWNER_WECHAT_ID`
- 联系人管理命令前缀：`/cm`

已确认一个关键事实：

> 联系人来源为“微信好友 + 保存到通讯录的群聊”。

这意味着“是否允许回复”与“按对象开放插件”都可以统一建立在**联系人**模型上。

## 2. 目标

本设计分两期：

1. **一期（联系人白名单）**
   - 仅私聊、联系人中的群聊可回复
   - 机器人主人消息不受限制
2. **二期（联系人插件权限）**
   - 支持对任意联系人（好友或群）配置插件 allow/deny
   - 支持默认模式（allow_all / deny_all）

## 3. 非目标

当前不做：

- 可视化控制台
- 多租户隔离
- 插件级复杂 RBAC（角色层级）
- 跨平台统一策略（先只做微信）

## 4. 总体原则

1. **D1 作为权限真源**（可审计、可查询）
2. **可选 KV 缓存作为读优化**（不是事实来源）
3. **入口统一判定**（在 `src/wechat/index.ts`）
4. **管理命令仅主人可用**（`/cm ...`）

---

## 5. 数据模型（D1）

### 5.1 `contact`（联系人主表）

```sql
CREATE TABLE IF NOT EXISTS contact (
  contact_id TEXT PRIMARY KEY,               -- wxid_xxx 或 47275691424@chatroom
  contact_type TEXT NOT NULL,                -- user | group | system
  display_name TEXT NOT NULL DEFAULT '',
  alias TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,        -- 联系人总开关
  plugin_default_mode TEXT NOT NULL DEFAULT 'allow_all',
  source TEXT NOT NULL DEFAULT 'contacts',   -- contacts | detail | manual
  raw_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

说明：

- `contact_type='group'` 的联系人，即“保存到通讯录的群聊”
- `contact_type='system'` 用于 `weixin` / `fmessage` 等系统号

### 5.2 `contact_plugin_policy`（联系人插件覆盖）

```sql
CREATE TABLE IF NOT EXISTS contact_plugin_policy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id TEXT NOT NULL,
  plugin_name TEXT NOT NULL,
  enabled INTEGER NOT NULL,                  -- 1允许 0禁用
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(contact_id, plugin_name)
);
```

### 5.3 `group_member`（群成员表，可选）

```sql
CREATE TABLE IF NOT EXISTS group_member (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  member_nickname TEXT NOT NULL DEFAULT '',
  member_display_name TEXT NOT NULL DEFAULT '',
  big_avatar_url TEXT NOT NULL DEFAULT '',
  small_avatar_url TEXT NOT NULL DEFAULT '',
  member_flag INTEGER NOT NULL DEFAULT 0,
  inviter_id TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'group-members',  -- group-members | contact-detail
  server_version INTEGER NOT NULL DEFAULT 0,
  info_mask INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE(group_id, member_id)
);
```

### 5.4 `contact_audit_log`（审计日志，可选）

```sql
CREATE TABLE IF NOT EXISTS contact_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_wxid TEXT NOT NULL,
  action TEXT NOT NULL,                      -- add_group / remove_contact / plugin_allow / plugin_deny / ...
  target_type TEXT NOT NULL,                 -- contact / plugin
  target_id TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);
```

---

## 6. 判定流程

### 6.1 全局放行规则

按顺序：

1. 若 `message.from === env.BOT_OWNER_WECHAT_ID` → 直接放行
2. 若 `message.source === 'private'` → 放行
3. 若 `message.source === 'group'` → 继续联系人判定
4. 其他来源默认不回复

### 6.2 联系人策略判定

输入：`contactId`, `pluginName`

1. 查 `contact`：
   - 不存在：拒绝（未纳入白名单）
   - `enabled = 0`：拒绝
2. 查 `contact_plugin_policy`（`contact_id + plugin_name`）：
   - 命中则按 `enabled` 决定
3. 未命中则按 `plugin_default_mode`：
   - `allow_all`：允许
   - `deny_all`：拒绝

群聊时：`contactId = roomId`；私聊时：`contactId = fromWxid`（未来可选启用）。

---

## 7. 命令设计（/cm）

> 仅机器人主人可执行。

### 7.1 一期命令（联系人白名单）

- `/cm list`
  - 列出联系人（现有）
- `/cm add-group <groupId>`
  - 将群加入联系人（现有）
- `/cm remove <contactId>`
  - 移除联系人（现有）

### 7.2 二期命令（联系人插件权限）

- `/cm contact list`
- `/cm contact enable <contactId>`
- `/cm contact disable <contactId>`
- `/cm contact mode <contactId> allow_all|deny_all`
- `/cm plugin allow <contactId> <pluginName>`
- `/cm plugin deny <contactId> <pluginName>`
- `/cm plugin list <contactId>`

---

## 8. 代码落点

### 8.1 入口层

- `src/wechat/index.ts`
  - 执行全局白名单与联系人策略判定

### 8.2 权限仓储层

- 新增建议：`src/plugins/system/contact-access/`
  - `repository.ts`：D1 读写
  - `service.ts`：策略判定
  - `types.ts`：领域类型

### 8.3 管理命令层

- 扩展现有：`src/plugins/system/contact-admin/plugin.ts`
  - 增加 `contact/*` 与 `plugin/*` 子命令

---

## 9. 刷新与一致性

若接入 KV 缓存：

1. D1 永远为真源
2. `/cm` 命令写 D1 后同步刷新 KV
3. 定时任务每日全量对账（微信联系人 -> D1 -> KV）
4. 缓存失效时可回源 D1

---

## 10. 与当前接口结构的映射

基于已确认返回结构（`/api/contacts`、`/api/contacts/detail`）：

- 联系人 ID：`username.value`
- 昵称：`nickname.value`
- 备注：`remark.value`
- 群判断：`username.value` 以 `@chatroom` 结尾
- 群成员：
  - 来源 A：`/api/contacts/detail` 的 `contact_list[].members.list[]`
  - 来源 B：群成员详情接口的 `data.result.list[]`
  - 两者都建议写入 `group_member`

需要兼容系统号（`weixin` / `fmessage` / `medianote` / `floatbottle`）并按 `contact_type='system'` 处理。

### 10.1 群成员详情接口映射（你提供的样例）

接口返回关键路径：

- `data.group` -> `group_id`
- `data.server_version` -> `server_version`
- `data.result.info_mask` -> `info_mask`
- `data.result.list[]` -> 群成员列表

成员字段映射：

- `username` -> `member_id`
- `nickname` -> `member_nickname`
- `display_name` -> `member_display_name`
- `big_avatar_url` -> `big_avatar_url`
- `small_avatar_url` -> `small_avatar_url`
- `flag` -> `member_flag`
- `inviter_username` -> `inviter_id`

### 10.2 合并优先级

当同一 `group_id + member_id` 同时存在两种来源时：

1. **优先使用群成员详情接口（`data.result.list[]`）**
2. `display_name`、头像字段只覆盖非空值
3. `updated_at` 始终更新为最新写入时间
4. `server_version` 若新值更大则覆盖

---

## 11. 迁移计划

### Phase 1：D1 联系人白名单落地

1. 建 `contact`
2. 将当前“联系人群可回复”改为查 D1 `contact`（`contact_type='group'`）
3. `/cm add-group` 与 `/cm remove` 同步写 D1

### Phase 2：插件级策略

1. 建 `contact_plugin_policy`
2. 在插件执行前注入 `pluginName` 判定
3. 增加 `/cm plugin ...` 命令

### Phase 3：成员快照与审计

1. 建 `contact_group_member_snapshot`
2. 建 `contact_audit_log`
3. 增加状态命令：`/cm whitelist-status` / `/cm plugin status`

---

## 12. 风险与应对

1. **插件名变更导致策略失效**
   - 约定 `plugin.name` 稳定，不随展示文案变化
2. **联系人 ID 误配置**
   - 命令返回 ID 回显 + 查询命令校验
3. **性能开销**
   - 入口判定走缓存，D1 回源兜底
4. **误操作风险**
   - 全部管理命令写审计日志

---

## 13. MVP 验收标准

1. 主人消息在任意会话可触发回复
2. 非主人私聊可触发回复
3. 非主人群聊仅联系人群可触发回复
4. 可针对任意联系人禁用指定插件且即时生效
5. 提供最少一条审计记录查询能力

