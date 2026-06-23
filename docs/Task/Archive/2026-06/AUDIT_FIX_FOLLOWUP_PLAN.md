# 任务计划 — audit-fix-followup

**状态**: ✅ 已完成 (完成时间: 2026-06-23)
> 对应 fullauto 状态：.omc/fullauto/audit-fix-followup/state.json

## 任务目标

修复项目分析阶段发现的 3 个问题：P1 同步上限文案错误、P3 残留死代码、P3 时间函数风格不统一。均为低风险清理类改动。

## 问题分析
见 `.omc/fullauto/audit-fix-followup/spec.md`。核心：
- **P1**：`main.js:291` 写死 `'同步内容超过 20000 字'`，实际阈值 `SYNC_MAX_WORD_COUNT=40000`，文案与真实限制不符
- **P3**：`DictMap.js` `getDictWordsInNormalMode` 中 `bodyString` 死代码(含未定义引用 `this.indexEndOfHeader`)从未使用
- **P3(勘误)**：原报告称 Dict.js 混用时间函数。grep 证实 Dict.js 仅 `new Date().getTime()`，唯一异类是 `dictParseCore.js`(3 处 `Date.now()`)。决策：改异类对齐主流

## 子任务列表
- ✅ T1 `main.js` 同步失败文案动态化(引用 SYNC_MAX_WORD_COUNT)+ 解构默认值
- ✅ T2 `js/DictMap.js` 删除 bodyString 死代码
- ✅ T3 `js/dictParseCore.js` 6 处 Date.now() → new Date().getTime()

## 每个子任务的改动内容
见 `.omc/plans/fullauto-audit-fix-followup-impl.md`

## 预期效果和验收标准
- `npm test` 47/47 全绿
- grep: main.js 无 20000 字面量；DictMap.js 无 bodyString；dictParseCore.js 无 Date.now()

## 风险评估和缓解措施
- 全部局部清理，无 API/行为变化
- T1 需 SYNC_MAX_WORD_COUNT 已在 main.js 顶部引入(已确认 main.js:32)

## 实施顺序和依赖关系
T1 → T2 → T3，互不依赖，串行执行稳妥

## 阶段 0 输出（spec）
- 路径：.omc/fullauto/audit-fix-followup/spec.md
- 包含：## Assumptions Made / ## Decisions Made
- 备注：self-authored(上下文充分)

## 实施计划
- 路径：.omc/plans/fullauto-audit-fix-followup-impl.md
- 备注：self-authored

## 外部审核意见（Phase 1）
- provider: coding-bridge (SESSION_ID 79c480b9)
- verdict: APPROVED
- 风险点(5):T1 建议模板字符串引用常量;T2 死代码删除安全;T3 对齐少数服从多数合理;T4 IPC 路径无自动化测试覆盖;T5 建议独立分支可回滚
- 采纳:模板字符串引用常量。未采纳:T2 加 TODO 注释(违反 do-not-create-unless-necessary)

## 子任务状态
- ✅ T1 `main.js` 同步失败文案动态化 + 解构默认值
- ✅ T2 `js/DictMap.js` 删除 bodyString 死代码
- ✅ T3 `js/dictParseCore.js` 6 处 Date.now() → new Date().getTime()

## 外部审核意见（Phase 2 单文件复审）
- provider: coding-bridge (SESSION_ID 91d0a59a)
- verdict: REJECTED → 修复后转 APPROVED
- 核心理由:P0-1 单位语义错位;P1-2 解构无默认值
- 处置:
  - P1-2 **采纳**:main.js:32 解构加 `SYNC_MAX_WORD_COUNT = 40000` 默认值
  - P0-1 **否决**:经 main.js:265 核查,`fileContentYaml.length` 实为字符数,文案"字符"正确。变量名 SYNC_MAX_WORD_COUNT 为历史命名瑕疵,重命名属跨文件重构,超出最小修复边界,记为已知项
  - P1-3 排除:grep 确认前端无字符串匹配该消息

## QA 记录
- npm test: 47/47 全绿(6.1s),改动前后均通过
- node --check: main.js / dictParseCore.js / DictMap.js 语法 OK
- node -e require: dictParseCore.js + DictMap.js 加载无错
- grep 验收:
  - main.js 无 `20000` 字面量 ✓
  - DictMap.js 无 `bodyString` / `indexEndOfHeader` ✓
  - dictParseCore.js 无 `Date.now()`(全项目 0 残留) ✓
  - dictParseCore.js 有 6 处 `new Date().getTime()` ✓
- 已知项(本次不修):`SYNC_MAX_WORD_COUNT` 常量命名(实为字符数限制)误导;Dict.js getRepetitionWords/getRepeatedWordsWithSameCode 重复逻辑

## 验证
- 路径：.omc/fullauto/audit-fix-followup/validation.md

## 三视角验证 verdict
- **功能完整性**(architect agent):APPROVED — T1 单位"字符"与 main.js:265 字符计数语义一致;T2 死代码下游依赖 fileContent 已验证;T3 6 处对齐行为等价
- **安全性**(self-checked):APPROVED — 无注入面,模板插值为数字常量,删除死代码不引入攻击面
- **代码质量**(self-checked):APPROVED — 47/47 测试绿,风格统一,无新增死代码

## 外部审核意见（Phase 4）
- provider: coding-bridge (SESSION_ID 1b829b22)
- verdict: APPROVED
- 风险点(4):命名误导认知风险;IPC 路径缺自动化测试;解构默认值对显式 undefined/null 不生效;动态拼接前端兼容
- 处置:全部认可为已知项/超范围。审核建议加 tech-debt 注释未采纳(违反 do-not-create-unless-necessary,已知项已在本文档充分记录)

## 验收结论
3 项问题全部修复,47/47 测试通过,4 文件 +9/-17 行纯清理,无行为回归。2 轮外部审核 + 1 轮 architect 复核均 APPROVED。
