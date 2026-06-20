# 审核修复计划

**Status**: 🔄 In progress (start time: 2026-06-21)
**背景**: 5 次提交审核 + 外部 review（coding-bridge provider）发现 6 个问题，按 P0~P2 分级
**目标**: 修复 6 个审核问题；保持现有测试通过；保持 changelog/version 一致

## 子任务清单

| # | 等级 | 文件 | 问题 | 状态 |
|---|---|---|---|---|
| 1 | P0 | js/Dict.js | lastIndex 来源错误：取 lines.length 而非最大 word id，重启后 id 冲突 | ⏳ |
| 2 | P0 | forge.config.js + package.json | Worker 在 ASAR 打包后加载可能失败，需 asarUnpack 排除 | ⏳ |
| 3 | P1 | js/dictParseCore.js | wordFromLine 边界防御不足（空行/BOM/缺字段） | ⏳ |
| 4 | P1 | view/index/mixins/PinyinMixin.js | Mixin 顺序无运行时检测，依赖 JSDoc 注释 | ⏳ |
| 5 | P2 | main.js | getRimeExecDir 本地函数与 RimeExecResolver 重复 | ⏳ |
| 6 | - | - | 验证：运行 yarn test 全部通过 | ⏳ |

## 已排除的问题

- **CSS `:has()` 兼容性疑虑**：electron ^28.3.3 内置 Chromium 120+，完全支持 `:has()`。无需修复。

## 实施顺序

1. P0-1：Dict lastIndex 来源修复（最严重，影响持久化正确性）
2. P0-2：Worker ASAR 排除（防止发版崩溃）
3. P1-1：wordFromLine 防御（防止用户字典格式不规范导致解析崩溃）
4. P1-2：Mixin 顺序运行时检测（防止重构引入静默 bug）
5. P2-1：main.js 函数清理（提升可维护性）
6. 验证：yarn test

## 验收标准

- 所有 6 个子任务完成
- `yarn test` 全部通过
- CHANGELOG 更新（如需）
- Git commit 提交