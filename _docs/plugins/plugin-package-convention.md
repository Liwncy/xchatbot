# 插件包目录规范（v1）

> 目标：统一「一个插件在一个目录里怎么组织」的认知，与能力域分类（`cognitive/`、`media/`、`toolkits/` 等）互补。
>
> 本文只定义规范与迁移方向，不要求一次性改完所有存量插件。

---

## 1. 规范要解决什么问题

插件系统已有两层组织方式：

1. **能力域**（域目录）：插件按「做什么」归类，例如 `cognitive/`、`media/`、`system/`。
2. **插件包**（本文规范）：单个插件目录内部怎么长、对外从哪里 export。

当前存量插件形态不一：

| 形态 | 示例 | 问题 |
|---|---|---|
| 单文件 | `media/video-link-parser.ts` | 无统一入口，注册路径即实现路径 |
| 小目录 | `cognitive/ai-sing/` | 多文件，但 export 文件不统一（`ai-sing.ts` vs `index.ts`） |
| 大文件 + 游离配置 | `cognitive/ai-dialog.ts` + 同级 `config.ts` | 配置与插件本体不在同一包内 |
| 单文件多插件 | `cognitive/intent-image.ts` | 两个 plugin 挤在一个文件 |
| 场景子系统 | `scenarios/xiuxian/`、`scenarios/xuanxue/` | 内部分层已有，但缺少与轻量插件对齐的对外约定 |

本规范的核心约定：

> **每个插件（或插件包）对外只暴露一个目录入口，优先使用 `index.ts`。**

---

## 2. 与运行时基础设施的边界

下列文件/目录属于**插件运行时**，不属于单个插件包：

```text
src/plugins/
├── index.ts          # 全局注册入口（registerPlugin 副作用）
├── registry.ts       # 注册表门面
├── dispatcher.ts     # 分发查询
├── manager.ts        # 底层容器
└── types.ts          # 框架级接口：TextMessage / ImageMessage / MessageEvent
```

下列目录属于**跨插件共享**，插件包可依赖，但不应反向依赖具体插件：

```text
src/plugins/common/   # ai-client、draw-service 等
```

**types 分层约定：**

| 路径 | 用途 |
|---|---|
| `plugins/types.ts` | 框架级：所有插件实现的 `TextMessage` / `ImageMessage` 接口 |
| `{plugin}/types.ts` | 插件私有类型，不对外 export（除非明确需要） |

---

## 3. 能力域 + 插件包：两层结构

能力域回答「这类插件放哪」；插件包规范回答「目录里怎么长」。

```text
src/plugins/
├── common/
├── system/
├── rule-engine/          # 特殊：规则引擎集群（见 §7）
├── cognitive/
│   ├── ai-dialog/        # 插件包目录
│   ├── ai-sing/
│   ├── smart-draw/
│   └── intent-image/
├── media/
│   ├── video-link-parser/
│   ├── haokan-video/
│   ├── haokan-image/
│   └── yinguo-image/
├── toolkits/
│   ├── fake-forward/
│   ├── human-verify/
│   └── ...
└── scenarios/
    ├── xiuxian/
    └── xuanxue/
```

**注册约定（目标态）：**

```typescript
// plugins/index.ts 优先从各插件包的 index.ts 导入
import {aiDialogPlugin} from './cognitive/ai-dialog';
import {aiSingPlugin} from './cognitive/ai-sing';
import {imageIntentTriggerPlugin, imageIntentProcessPlugin} from './cognitive/intent-image';
```

---

## 4. 分档规范：S / M / L / XL

不按「一刀切模板」要求每个插件都有 `types.ts`、`service.ts`，而是按复杂度分档。

### 4.1 S 档 — 简单插件

**适用：** 单消息类型、逻辑短（通常 < ~150 行）、无独立配置/KV/仓储。

```text
media/video-link-parser/
└── index.ts    # match + handle + 常量，export videoLinkParserPlugin
```

**规则：**

- 必须有 `index.ts` 作为唯一对外出口。
- 只 export 一个 `xxxPlugin`。
- 私有类型可在文件内用 `interface` 声明，不强制 `types.ts`。

**当前接近目标或适合迁入 S 档：**

- `help`、`smart-draw`、`human-verify`、`random-friend`
- `video-link-parser`、`wechat-chat-record`
- `cat-image`、`today-wife`（未注册 demo）

---

### 4.2 M 档 — 中等插件

**适用：** 有配置读写、外部 API 客户端、仓储，或主逻辑较长。

```text
cognitive/ai-sing/
├── index.ts              # 对外唯一出口：export { aiSingPlugin }
├── plugin.ts             # 可选：组装 TextMessage（逻辑长时从 index 拆出）
├── types.ts              # 插件私有类型（有 2+ 共享类型时）
├── config.ts             # KV / 持久化配置
├── service.ts            # 业务编排（可选）
├── repository.ts         # 数据访问（可选）
├── constants.ts          # 触发词、路由表等（可选）
├── lyrics.ts             # 领域逻辑
└── mimo-tts-client.ts    # 外部 API 客户端
```

**文件职责表：**

| 文件 | 职责 | 是否必须 |
|---|---|---|
| `index.ts` | 对外 export plugin(s) | **必须** |
| `plugin.ts` | 定义 `TextMessage` / `ImageMessage` 对象 | 主逻辑 > ~100 行时建议 |
| `types.ts` | 插件私有类型 | 有共享类型时 |
| `config.ts` | 配置加载/保存 | 有 KV 或 env 配置时 |
| `service.ts` | 业务流程编排 | 有复杂 handle 链路时 |
| `repository.ts` | DB / KV 仓储 | 有持久化层时 |
| `constants.ts` | 触发词、路由表 | 常量较多时 |
| `lib/` | 纯函数工具 | 按需 |
| `clients/` | 第三方 HTTP 客户端 | 按需 |

**当前适合 M 档或需收拢为 M 档：**

- `ai-sing/`（已有目录，补 `index.ts`）
- `contact-admin/`（已有 `plugin.ts` + `repository.ts`，入口可统一为 `index.ts`）
- `fake-forward/`（多文件，入口可统一为 `index.ts`）
- `ai-dialog`（应收拢为 `ai-dialog/`，`config.ts` 迁入目录）
- `plugin-admin`（多文件散落在 `system/`，应收拢为 `plugin-admin/`）
- `haokan-image`、`haokan-video`、`yinguo-image`（路由/配置可抽 `constants.ts`）

---

### 4.3 L 档 — 复合插件包

**适用：** 同一目录 export **多个** plugin（例如 text 触发 + image 处理）。

```text
cognitive/intent-image/
├── index.ts       # export { imageIntentTriggerPlugin, imageIntentProcessPlugin }
├── trigger.ts     # TextMessage：指令入口，建立会话状态
├── process.ts     # ImageMessage：处理后续图片
├── types.ts       # 共享 session / 状态类型（可选）
└── session.ts     # pending 状态管理（可选）
```

**规则：**

- `index.ts` 只做聚合 export，不写业务逻辑。
- 每种消息类型单独一个文件（`trigger.ts` / `process.ts`）。
- 共享状态抽到 `session.ts` 或 `types.ts`，避免跨文件隐式耦合。

**当前：** `cognitive/intent-image.ts` 单文件 export 两个 plugin，建议迁入 L 档结构。

---

### 4.4 XL 档 — 场景子系统

**适用：** 有状态、独立闭环、文件多、内部需再分层的大型业务。

对外仍遵守：**根目录 `index.ts` 只 export 一个 `xxxPlugin`**。

#### XL-A：命令驱动（修仙）

```text
scenarios/xiuxian/
├── index.ts              # export { xiuxianPlugin }
├── app/                  # 命令解析、路由、服务编排、回复兜底
├── features/             # 按玩法域：handlers + reply + shared
├── core/                 # types / balance / repository / constants
└── README.md
```

详见：[`xiuxian-structure-plan.md`](xiuxian/xiuxian-structure-plan.md)

#### XL-B：规则驱动（玄学）

```text
scenarios/xuanxue/
├── index.ts              # export { xuanxuePlugin }
├── types.ts              # 规则/解析相关类型
├── rules.ts              # 规则注册表
├── engine/               # matcher / fetcher / parser / reply
├── parsers/              # 各占卜/测算解析器
└── lib/                  # html / format 等工具
```

**规则：**

- 子系统内部允许自定义分层，但**不在能力域根目录**平铺业务文件。
- 子系统内的 `types.ts` 指玄学/修仙领域类型，与 `plugins/types.ts` 框架类型区分。

---

## 5. 命名约定

| 项 | 约定 | 示例 |
|---|---|---|
| 插件包目录名 | kebab-case，与 plugin `name` 字段一致或强相关 | `ai-dialog`、`video-link-parser` |
| export 名 | `{camelCase}Plugin` | `aiDialogPlugin` |
| 引擎类（rule-engine） | `{scope}PluginsEngine` | `commonPluginsEngine` |
| 对外入口 | 优先 `index.ts` | `import from './cognitive/ai-sing'` |
| 实现文件 | 语义化命名，避免与目录同名冗余 | `plugin.ts`、`trigger.ts`、`service.ts` |

**`index.ts` vs `plugin.ts`：**

- `index.ts`：对外出口，export plugin 与必要的类型/常量。
- `plugin.ts`：可选，专门组装 `TextMessage` / `ImageMessage` 对象。

---

## 6. 依赖方向

```text
plugins/index.ts
    ↓ 只导入各插件包 index.ts
{domain}/{plugin}/index.ts
    ↓ 可依赖
plugins/common/          # 跨插件共享
plugins/types.ts       # 框架接口
src/wechat/、src/utils/ # 平台与工具
```

**禁止：**

- 插件包 A 直接 import 插件包 B 的 `service.ts` / `config.ts`（应通过 `common/` 抽共享能力，或显式设计协作接口）。
- `media/` 反向依赖 `cognitive/` 的具体插件实现；共用绘图能力走 `common/draw-service.ts`。

**允许：**

- `media/haokan-image` → `common/draw-service`（兜底绘图）
- `cognitive/*` → `common/ai-client`

---

## 7. 特殊模块：rule-engine

`rule-engine/` **不适用**单插件包 S/M/L 模板。

它是「规则型执行引擎集群」：

```text
rule-engine/
├── base.ts       → commonPluginsEngine
├── dynamic.ts    → dynamicCommonPluginsEngine
├── workflow.ts   → workflowCommonPluginsEngine
├── shared.ts     # 模板渲染、JSONPath 等共享能力
├── parser.ts
├── matcher.ts
├── remote-config.ts
└── reply-builder.ts
```

三个 engine 各自注册为一个 plugin，但共享同一套基础设施。维护时按引擎模块演进，不拆成三个独立插件包目录。

---

## 8. 当前插件 → 目标档位（迁移清单）

| 插件 | 能力域 | 建议档位 | 目标包路径 | 备注 |
|---|---|---|---|---|
| help | system | S | `system/help/` | 单文件迁入目录 |
| contact-admin | system | M | `system/contact-admin/` | 已有目录，统一 index 出口 |
| plugin-admin | system | M | `system/plugin-admin/` | 收拢散落文件 |
| room-admin | system | M | `system/room-admin/` | 未注册 |
| ai-dialog | cognitive | M | `cognitive/ai-dialog/` | config 迁入包内 |
| ai-sing | cognitive | M | `cognitive/ai-sing/` | 补 index.ts |
| smart-draw | cognitive | S | `cognitive/smart-draw/` | |
| intent-image | cognitive | L | `cognitive/intent-image/` | 拆 trigger + process |
| video-link-parser | media | S | `media/video-link-parser/` | |
| haokan-video | media | M | `media/haokan-video/` | 路由表可抽 constants |
| haokan-image | media | M | `media/haokan-image/` | |
| yinguo-image | media | M | `media/yinguo-image/` | |
| fake-forward | toolkits | M | `toolkits/fake-forward/` | 统一 index 出口 |
| human-verify | toolkits | S | `toolkits/human-verify/` | |
| random-friend | toolkits | S | `toolkits/random-friend/` | |
| wechat-chat-record | toolkits | S | `toolkits/wechat-chat-record/` | |
| xiuxian | scenarios | XL-A | `scenarios/xiuxian/` | 已符合，保持 |
| xuanxue | scenarios | XL-B | `scenarios/xuanxue/` | 已符合，保持 |
| common/dynamic/workflow engine | rule-engine | 特殊 | `rule-engine/` | 不插件包化 |

---

## 9. 渐进式落地路径

### Phase 0 — 规范文档（本文）

- 新插件必须遵守。
- 存量插件触达（修 bug / 加功能）时顺手迁移，不强制一次性全改。

### Phase 1 — 试点（建议 3 个）

1. `cognitive/ai-dialog/`：收拢游离的 `config.ts`
2. `cognitive/intent-image/`：L 档拆分双 plugin
3. `media/video-link-parser/`：S 档样板（`index.ts` 单文件包）

### Phase 2 — M 档收拢

- `ai-sing/`、`fake-forward/`、`contact-admin/` 统一 `index.ts` 出口
- `plugin-admin/` 收成目录

### Phase 3 — 其余 S 档单文件插件目录化

- 按域批量迁移，每批迁移后 `npm run typecheck`

---

## 10. 新插件 Checklist

新增插件时，提交前自检：

- [ ] 已放入正确**能力域**目录（`cognitive` / `media` / `toolkits` / `system` / `scenarios`）
- [ ] 插件包有 **`index.ts`** 作为唯一对外出口
- [ ] 已在 **`plugins/index.ts`** 中 `registerPlugin`
- [ ] export 名为 **`{name}Plugin`**，与 `name` 字段一致
- [ ] 私有类型在 **`{plugin}/types.ts`** 或文件内，未污染 `plugins/types.ts`
- [ ] 跨插件复用逻辑已放入 **`common/`**，未复制粘贴
- [ ] 未引入 **`media → cognitive`** 等跨域反向依赖
- [ ] 复合消息类型（text + image）使用 **L 档** 结构

---

## 11. 相关文档

- 能力域与目录重构蓝图：[`../architecture/xchatbot-structure-refactor-plan.md`](../architecture/xchatbot-structure-refactor-plan.md)
- 修仙子系统内部分层：[`xiuxian/xiuxian-structure-plan.md`](xiuxian/xiuxian-structure-plan.md)
- 规则引擎与管理：[`common/rule-plugin-admin-design.md`](common/rule-plugin-admin-design.md)

---

## 12. 版本记录

| 版本 | 日期 | 说明 |
|---|---|---|
| v1 | 2026-06-08 | 初版：S/M/L/XL 分档、能力域叠加、迁移清单与落地路径 |
