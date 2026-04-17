# xiuxian 目录结构重构方案

## 目标

本方案只定义目录结构、层级职责、迁移边界和执行顺序，不涉及任何代码修改。

目标如下：

1. xiuxian 根目录只保留单一入口文件。
2. 玩法功能统一收敛到 features 目录，不与底层实现平铺。
3. 底层能力统一收敛到 core 目录，但避免 core 变成新的大杂烩。
4. app 仅负责命令解析接线、服务编排和顶层回复兜底，不承载业务规则或 SQL。
5. 每次迁移都可以单独验证、单独保存，避免再次出现大面积误改或结构回退困难的问题。

## 推荐定稿结构

```text
src/plugins/game/xiuxian/
└── index.ts

    app/
    ├── router.ts
    ├── service.ts
    ├── commands/
    │   ├── index.ts
    │   ├── common.ts
    │   ├── player.ts
    │   ├── inventory.ts
    │   ├── economy.ts
    │   ├── growth.ts
    │   ├── social.ts
    │   ├── combat.ts
    │   └── pet.ts
    └── reply/
        ├── index.ts
        └── unknown-command.ts

    core/
    ├── types/
    │   ├── index.ts
    │   ├── domain/
    │   │   ├── player.ts
    │   │   ├── item.ts
    │   │   ├── battle.ts
    │   │   ├── economy.ts
    │   │   ├── growth.ts
    │   │   ├── social.ts
    │   │   ├── tower.ts
    │   │   ├── boss.ts
    │   │   └── pet.ts
    │   ├── command/
    │   │   ├── index.ts
    │   │   ├── base.ts
    │   │   ├── player.ts
    │   │   ├── inventory.ts
    │   │   ├── economy.ts
    │   │   ├── growth.ts
    │   │   ├── social.ts
    │   │   ├── combat.ts
    │   │   └── pet.ts
    │   ├── repository/
    │   │   ├── index.ts
    │   │   ├── player.ts
    │   │   ├── inventory.ts
    │   │   ├── economy.ts
    │   │   ├── growth.ts
    │   │   ├── social.ts
    │   │   ├── combat.ts
    │   │   ├── tower.ts
    │   │   ├── boss.ts
    │   │   └── pet.ts
    │   └── shared/
    │       ├── index.ts
    │       ├── context.ts
    │       ├── response.ts
    │       └── pagination.ts
    │
    ├── constants/
    │   ├── index.ts
    │   ├── gameplay.ts
    │   ├── text.ts
    │   ├── limits.ts
    │   └── pet.ts
    │
    ├── enums/
    │   ├── index.ts
    │   ├── item.ts
    │   ├── combat.ts
    │   └── social.ts
    │
    ├── config/
    │   ├── index.ts
    │   ├── runtime.ts
    │   ├── prefix-set.ts
    │   └── pet-banner.ts
    │
    ├── utils/
    │   ├── index.ts
    │   ├── time.ts
    │   ├── realm.ts
    │   ├── id.ts
    │   └── random.ts
    │
    ├── balance/
    │   ├── index.ts
    │   ├── models.ts
    │   ├── progression.ts
    │   ├── combat.ts
    │   ├── loot.ts
    │   ├── sets.ts
    │   └── prefix-set.ts
    │
    └── repository/
        ├── index.ts
        ├── base.ts
        ├── player.ts
        ├── inventory.ts
        ├── economy.ts
        ├── auction.ts
        ├── growth.ts
        ├── social.ts
        ├── combat.ts
        ├── boss.ts
        ├── tower.ts
        └── pet.ts

    features/
    ├── help/
    │   ├── index.ts
    │   ├── handlers.ts
    │   └── reply.ts
    │
    ├── player/
    │   ├── index.ts
    │   ├── handlers.ts
    │   └── reply.ts
    │
    ├── inventory/
    │   ├── index.ts
    │   ├── handlers.ts
    │   ├── helpers.ts
    │   └── reply.ts
    │
    ├── fortune/
    │   ├── index.ts
    │   ├── handlers.ts
    │   ├── buff.ts
    │   └── reply.ts
    │
    ├── growth/
    │   ├── index.ts
    │   ├── handlers.ts
    │   └── reply.ts
    │
    ├── economy/
    │   ├── index.ts
    │   ├── handlers.ts
    │   └── reply.ts
    │
    ├── auction/
    │   ├── index.ts
    │   ├── handlers.ts
    │   └── reply.ts
    │
    ├── social/
    │   ├── index.ts
    │   ├── pvp.ts
    │   ├── bond.ts
    │   ├── npc.ts
    │   └── reply.ts
    │
    ├── combat/
    │   ├── index.ts
    │   ├── battle.ts
    │   ├── boss.ts
    │   ├── tower.ts
    │   └── reply.ts
    │
    └── pet/
        ├── index.ts
        ├── handlers.ts
        ├── helpers.ts
        └── reply.ts
```

## 三层职责

### 1. app

app 只做顶层接线和服务编排。

允许放入：

1. 命令解析入口。
2. command parser 分发。
3. service 主流程编排。
4. 未识别命令等顶层通用回复。

禁止放入：

1. SQL。
2. 数值计算。
3. 玩法专属规则实现。
4. 长篇业务文案。

### 2. core

core 是全插件共享的底层能力层，只放跨玩法复用的稳定能力。

允许放入：

1. 领域类型与命令类型。
2. 常量、枚举、运行配置。
3. 通用工具函数。
4. balance 数值与掉落计算。
5. repository 数据访问实现。

禁止放入：

1. 具体玩法 handler。
2. 某个玩法独有且不会复用的临时代码。
3. 依赖消息上下文的流程判断。

### 3. features

features 是玩法行为层，每个目录对齐一个玩家可感知的玩法域。

允许放入：

1. 玩法 handler。
2. 玩法 reply。
3. 玩法内部 helper。
4. 少量玩法内聚的局部实现。

禁止放入：

1. SQL。
2. 跨玩法通用类型定义。
3. 全局常量。

## 为什么不保留 foundation 目录

本次不建议继续使用 core/foundation 这种单桶目录，原因如下：

1. types、constants、time、realm、context 会快速膨胀到一个杂糅层。
2. 目录名抽象，但文件职责不抽象，后期会再次失控。
3. 既然已经明确未来还会有 enums、config、utils，就应该现在直接拆开。

因此推荐改为：

1. core/types
2. core/constants
3. core/enums
4. core/config
5. core/utils

## types 应该如何拆

types 建议作为目录存在，不再保留单一大文件。

### types/domain

放跨玩法复用的核心领域实体：

1. XiuxianPlayer
2. XiuxianItem
3. XiuxianBattle
4. XiuxianShopOffer
5. XiuxianAuction
6. XiuxianTaskDef
7. XiuxianPet
8. XiuxianBossState
9. XiuxianTowerProgress

### types/command

放命令协议和解析结果：

1. XiuxianCommand 主联合类型。
2. 各子命令类型。
3. 命令参数对象。

### types/repository

放仓储层输入输出契约：

1. repository 方法参数结构。
2. repository 返回 DTO。
3. 跨模块需要共享的仓储结果类型。

### types/shared

放跨层通用共享类型：

1. HandlerContext
2. Response helper 类型。
3. 分页、过滤、排序等公共结构。

### types 不应放入的内容

1. 某单个 feature 私有的中间类型。
2. SQL row 的文件内临时映射结构。
3. 文案模板结构。
4. 配置常量。

## constants、enums、config、utils 的边界

### constants

constants 存放运行期常量值，不包含行为。

例如：

1. 境界名称。
2. 文案短标签。
3. 数值上限。
4. 宠物相关常量。

### enums

enums 存放语义枚举或联合值聚合。

例如：

1. EquipmentSlot
2. XiuxianItemQuality
3. XiuxianPvpMode

如果项目更偏向 TypeScript 联合类型而不是 enum，也可以保留为 types 中的字面量联合；本目录主要是为了给未来增长预留位置。

### config

config 存放外部配置、运行时配置和预设。

例如：

1. prefix set 配置。
2. pet banner 配置。
3. feature flags。
4. runtime loader。

### utils

utils 只放纯工具，不放业务规则。

例如：

1. time.ts
2. realm.ts
3. id.ts
4. random.ts

## 与当前基线文件的映射

当前大文件建议映射如下：

1. src/plugins/game/xiuxian/index.ts
   - 迁移后仍然保留为唯一根入口。

2. src/plugins/game/xiuxian/service.ts
   - 迁入 app/service.ts。
   - 玩法分支逐步下沉到 features/*。

3. src/plugins/game/xiuxian/commands.ts
   - 迁入 app/commands/*。

4. src/plugins/game/xiuxian/reply.ts
   - 顶层兜底文案迁入 app/reply/*。
   - 玩法文案逐步迁入 features/*/reply.ts。

5. src/plugins/game/xiuxian/balance.ts
   - 迁入 core/balance/*。

6. src/plugins/game/xiuxian/repository.ts
   - 迁入 core/repository/*。

7. src/plugins/game/xiuxian/types.ts
   - 拆入 core/types/*。

8. src/plugins/game/xiuxian/constants.ts
   - 拆入 core/constants/*。

9. src/plugins/game/xiuxian/time.ts
   - 迁入 core/utils/time.ts。

10. src/plugins/game/xiuxian/realm.ts
    - 迁入 core/utils/realm.ts。

## 迁移原则

这次必须遵守以下原则：

1. 一次只迁移一个层级或一个主题块。
2. 根目录最终只保留 index.ts，但迁移过程中允许先保留门面文件，最后再收口。
3. 先拆纯函数层，再拆仓储层，再拆服务层。
4. reply 不单独发起一次大迁移，而是跟随 feature 一起移动。
5. 每一步必须能单独编译、单独回滚、单独保存。

## 推荐执行顺序

### 第 0 步：冻结基线

1. 确保当前代码为可信基线。
2. 运行一次完整编译。
3. 保存一个明确的 git 提交点。

### 第 1 步：先建目录骨架

仅创建：

1. app
2. core/types
3. core/constants
4. core/enums
5. core/config
6. core/utils
7. core/balance
8. core/repository
9. features/*

不迁移任何逻辑。

### 第 2 步：先迁移纯函数层

1. balance.ts -> core/balance/*
2. commands.ts -> app/commands/*

原因：

1. 依赖关系最简单。
2. 不涉及消息流程与 SQL。

### 第 3 步：迁移 core 基础层

1. types.ts -> core/types/*
2. constants.ts -> core/constants/*
3. time.ts / realm.ts -> core/utils/*

### 第 4 步：迁移 repository

建议顺序：

1. player + inventory + combat(battle)
2. economy + auction + growth
3. social + boss + tower
4. pet 最后

### 第 5 步：迁移 features

建议顺序：

1. help + player
2. inventory
3. fortune + growth
4. economy + auction
5. social
6. combat
7. pet

### 第 6 步：收口根目录

在所有逻辑迁移稳定后：

1. 删除旧的根层大文件。
2. 仅保留 index.ts。

## 每一步的验收标准

每一步都必须完成以下检查：

1. git diff 只包含当前步骤预期文件。
2. npx tsc --noEmit 通过。
3. 至少抽查 3 到 5 个代表命令。
4. 通过后立即保存。

## 风险点

### 风险 1：core 再次膨胀

规避：

1. 不允许 core 平铺。
2. 新增内容必须先判断属于 types/constants/enums/config/utils/balance/repository 的哪一个。

### 风险 2：reply 拆散后找不到文案

规避：

1. 顶层只保留 app/reply 兜底回复。
2. 玩法文案必须跟 feature 同目录。

### 风险 3：service 迁移时改行为

规避：

1. 每次只迁移一个命令组。
2. 迁移时先做委托，不改逻辑。

## 当前建议

当前建议已定稿为：

1. 使用 app / core / features 三层结构。
2. root 最终只保留 index.ts。
3. core 不使用 foundation 单桶，直接拆为 types/constants/enums/config/utils/balance/repository。
4. types 独立成目录，位于 core/types。

在文档确认前，不进行任何代码修改。