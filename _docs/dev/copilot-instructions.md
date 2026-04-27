# Copilot Instructions

## Commit Message Language

- 提交信息统一使用中文。
- 如需切换为英文，需在当前任务中明确说明，且本次提交内保持一致。

## Commit Message Convention (中文)

- 使用 Conventional Commits 结构：`type(scope): subject`
- `subject` 必须使用中文，简洁说明“做了什么”。
- 推荐长度：`subject` 不超过 50 个字符。
- 一次提交聚焦一个主题，避免混合多个无关改动。

## Commit Emoji（可选）

- 可在 `subject` 开头添加 **1 个** Emoji，增强可读性。
- 推荐格式：`type(scope): Emoji + 空格 + 中文动作描述`
- Emoji 只作语义增强，不替代关键信息。
- 避免连续多个 Emoji，避免与语义无关的表情。

### 类型与 Emoji 推荐映射

- `feat`: ✨（新功能）
- `fix`: 🐛（缺陷修复）
- `docs`: 📝（文档更新）
- `refactor`: ♻️（重构优化）
- `test`: ✅（测试完善）
- `chore`: 🔧（构建/依赖/维护）

### 固定类型与中文模板

1) `feat`

- 用途：新增功能
- 模板：`feat(scope): ✨ 新增{功能点}`
- 示例：`feat(casemgmt): ✨ 新增案件合作申请批量审核接口`

2) `fix`

- 用途：修复缺陷
- 模板：`fix(scope): 🐛 修复{问题现象}`
- 示例：`fix(reference): 🐛 修复行政区划初始化时code包含非数字导致解析失败`

3) `docs`

- 用途：文档变更
- 模板：`docs(scope): 📝 更新{文档主题}`
- 示例：`docs(reference): 📝 补充行政区划与法院代字模块使用说明`

4) `refactor`

- 用途：重构（不改变外部行为）
- 模板：`refactor(scope): ♻️ 重构{模块或逻辑}`
- 示例：`refactor(compare): ♻️ 重构特殊类型比较逻辑并统一命名`

5) `test`

- 用途：测试相关
- 模板：`test(scope): ✅ 增加/调整{测试内容}`
- 示例：`test(casemgmt): ✅ 增加案件合作状态流转单元测试`

6) `chore`

- 用途：构建、依赖、脚手架、杂项维护
- 模板：`chore(scope): 🔧 调整{维护项}`
- 示例：`chore(parent): 🔧 升级Maven插件版本并统一编码配置`

### 可选扩展

- 破坏性变更：`type(scope)!: subject`
- 关联任务：在提交正文或尾部追加 `Refs: #123` 或 `Closes: #123`

### 生成要求（给 Copilot）

- 默认按以上规范生成中文提交信息。
- 默认使用“单个 Emoji + 中文动词”的 `subject` 风格；如任务要求纯文本，可去掉 Emoji。
- 未提供 `scope` 时，按模块名推断（如 `reference`、`casemgmt`、`finance`）。
- 若一次改动跨多个模块，优先拆分为多次提交；无法拆分时使用最主要模块作为 `scope`。
- 禁止使用空泛描述（如“修改代码”“优化一下”）。
