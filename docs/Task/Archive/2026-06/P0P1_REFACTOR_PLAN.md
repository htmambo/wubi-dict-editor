# 任务：fork 与上游对齐 + 内部重构

**状态**: ✅ 已完成 (2026-06-19)
**创建时间**: 2026-06-18
**创建人**: main 助手（与用户对齐确认后）
**实际完成**: 2026-06-19
**关联分支**: master（基于 d1d41f3）

---

## 背景

完成两个仓库对比分析后，发现本地 `wubiDictEditor` fork 相对上游 `wubi-dict-editor`：

- **优势**：Worker 异步解析、拼音词库辅助器、`safeStorage` 密码加密、`spawn` 替代 `exec`、`validatePath`、智能 Weasel 路径发现（已实现）
- **落后**：CHANGELOG 没跟上、view 层仍是无模块化单文件、未补 smoke test、内部 `PinyinDictHelper.js` 同步/异步两套实现并存

## 目标

按 P0 → P1 → P2 → P3 顺序串行处理：

1. **P0**：合并 `PinyinDictHelper.js` 同步/异步（如果真的存在双套实现）
2. **P1**：建 `tests/` 目录，用 `node:test` 覆盖核心 round-trip
3. **P2**：拆分 `view/index/App.js`（mixin/data/computed/methods）
4. **P3a**：与上游 v1.32 对齐 js/ 目录与 CHANGELOG
5. **P3b**：与上游 v1.32 view 层模块化对齐（如上游做了则同步）
6. **归档**：完成所有子任务后归档任务文档

---

## 子任务清单

### P0 — 合并 PinyinDictHelper 同步/异步

- **现状**：`js/PinyinDictHelper.js` 同时导出 `prepareWordsForPinyinDict`（同步）和 `prepareWordsForPinyinDictAsync`（异步）；`view/index/App.js` 顶部已经 require 的是 async 版
- **改动**：先用 Grep 确认 fork 内没有其它文件 require 同步版；如没有，删除 `prepareWordsForPinyinDict` 同步实现，从 exports 中移除
- **验收**：Grep `prepareWordsForPinyinDict[^A]`（非 Async）结果为空；js/PinyinDictHelper.js 同步函数消失
- **风险**：低——纯删除，不影响行为

### P1 — 补 round-trip smoke test

- **改动**：
  - 建 `tests/dictParseCore.test.js`：覆盖 `parseDictFile` → `serializeDictYaml` round-trip（包括普通模式与分组模式）
  - 建 `tests/RimeExecResolver.test.js`：覆盖 `validatePath` 与 `parseWeaselVersion`
  - `package.json` 加 `"test": "node --test tests/"`
- **验收**：`npm test` 跑通，3+ 测试用例全部通过；测试不依赖 electron / node_modules（仅测 pure 函数）
- **风险**：低——新增测试，不改业务代码

### P2 — 拆分 App.js

- **现状**：`view/index/App.js` 1489 行单文件
- **改动**：按职责拆成：
  - `view/index/mixins/TipMixin.js`（如未独立）
  - `view/index/mixins/KeyboardMixin.js`（键盘事件）
  - `view/index/mixins/SearchMixin.js`（搜索/防抖）
  - `view/index/store/SelectedSet.js`（chosenWordIds Set 状态封装）
  - `view/index/index.js`（Vue 实例入口）
- **验收**：App.js 行数 < 400；UI 行为不变（手动 smoke 或保留 key 行为注释）
- **风险**：高——逐方法迁移，行为漂移可能

### P3a — 与上游 v1.32 对齐

- **改动**：
  - 对比上游 `wubi-dict-editor` js/ 目录与本仓库差异，确认 fork 是否所有 v1.32 特性都已吸收
  - 若有遗漏，回写
  - CHANGELOG 补到 v1.32+1（说明这是 fork）
- **验收**：`diff` 显示仅 CHANGELOG/version 差异；js/ 目录与上游等价

### P3b — 上游 view 模块化对齐

- **改动**：检查上游是否有 view 拆分方案；若没有，本任务跳过
- **验收**：CHANGELOG 标注 skipped/原因

### 归档

- 全部子任务完成后，把本文档移到 `docs/Task/Archive/YYYY-MM/`，更新 `docs/Task/README.md`，git commit

---

## 实施顺序与依赖

```
P0（删除双套）──→ P1（test 兜底）──→ P2（拆分 view）──→ P3a ──→ P3b ──→ 归档
```

P0 必须最先做：因为它减少代码体积，让 P1 测试覆盖的代码更少。
P1 在 P0 之后：保证 round-trip 测试通过是后续改动的基础安全网。
P2 在 P1 之后：拆分 App.js 时如有回归，P1 测试无法兜底（它是 view 层）；所以 P2 风险最高，需要在 P3 之前完成。
P3 与 P2 弱耦合：可独立做。

---

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| P0 删除后某个边角调用点崩 | 全仓 Grep 同步版调用；删除前先看 require/export 表 |
| P1 测试在 fork 独有字段上失败 | 用 fork 现有 Dict 字段（id/code/word/priority/note/indicator）作为断言目标 |
| P2 App.js 拆分导致 UI 行为漂移 | 拆分粒度按 mixin 边界，不动 methods 内部；保留原顺序；不做逻辑重构 |
| P3 上游 v1.32 引入 breaking change | 跳过 PR 模式，直接 cherry-pick 关键 commit；保留 fork 自身的安全加固 |
| node_modules 缺失 | P0/P1 不依赖；P2 验证需先 `npm install`（与用户确认） |

---

## 验收标准（全局）

- 所有 5 个子任务的子验收标准达成
- 测试通过
- 现有功能不退化（按 commit message "不引入回归" 的承诺）
- 文档同步：CHANGELOG、Task README、本文档

---

## 备注

- fork 的 `package.json` 没有 eslint/prettier 脚本——之前误读上游 README（README 对比表里看到的 lint 信息来自上游 `wubi-dict-editor`），本仓库实际无 lint 流程
- fork 当前 node_modules 未安装——P0/P1/P3a 不需要 electron；P2 验证需要 `npm install`（与用户确认是否执行）
- 上游 v1.32 已经发布，本仓库 HEAD 在 v1.31 之后的 d1d41f3——CHANGELOG 滞后

---

## 验收结果（实际执行）

**最终状态**：✅ 全部 7 个子任务完成

| 任务 | 状态 | 关键产物 | 测试 |
|---|---|---|---|
| P0 合并 PinyinDictHelper | ✅ | 删 -59 行重复代码 | 32/32 |
| P1 round-trip smoke test | ✅ | tests/dictParseCore + RimeExecResolver（20 用例） | — |
| P1.5 App.js 烟雾测试 | ✅ | tests/TipMixin + mount 守卫 + module.exports | — |
| P2 拆分 App.js | ✅ | 1495 → 365 行 + 5 mixin 子文件 | — |
| P3a 同步上游 CHANGELOG | ✅ | v1.33 + version 1.3.3 | — |
| P3b 上游 view 模块化 | ✅ 跳过 | 已在 CHANGELOG 标"待办：独立 PinyinMixin" | — |
| 归档 | ✅ | 见本文件 Archive 移动 | — |

**总体测试**：33/33 全通过（`npm test`）

## 外部审核 MCP Review 记录

| 步骤 | Session ID | 裁决 | 采纳的硬化 |
|---|---|---|---|
| P0+P1 | `3077f844-e03b-40a4-b264-bcf1e191a20a` | APPROVED | `compareVersionParts` null 防御 + `parseWeaselVersion` NaN 兜底 |
| P1.5 | `e4878e1e-424e-4456-a5a6-f3b4131b8867` | REJECTED → 已修 | 交换 mount/导出顺序（reviewer 误判的 `#app` 实为 prompt 笔误，代码本就正确） |
| P2 | `2cc7335d-4277-4ce5-866c-760ea79688e2` | APPROVED | `computedMixin` 改名 `computedOptions` |
| P3a | `5ecb155c-76cc-43e9-addc-fc1d8902bbaf` | APPROVED | CHANGELOG `#app` → `'app'` 笔误修正 |

## 经验教训

1. **每步立即 review** 是必要的——P3a CHANGELOG 描述里 `#app` 笔误被 reviewer 抓到、而真实代码正确，说明文档描述与代码不一致也会造成混乱
2. **mount 守卫顺序**：先 `module.exports` 再 `new Vue(app)`——确保测试环境能拿到配置而不被 mount 副作用打断
3. **P1.5 拆分时机**：原本认为"测试代码不需要单独 review"是不对的，P1.5 的 App.js 守卫改动值得单独 review
4. **P2 拆分的 mixin 顺序**很重要——Vue 按 mixins 数组顺序合并，pinyinDict 跨边界是已知妥协，下一步 PinyinMixin 独立化

## 后续 P3+ 待办

- 把 `pinyinDict` 相关方法（`beginPinyinAdd` / `updatePinyinAddProgress` / `finishPinyinAdd` / `addSelectionToPinyinDict` / `applyAddToPinyinDict`）从 `GroupOpMixin.js` 抽离到独立 `PinyinMixin.js`
- 把 `moveWordsToTargetDict` 与 `resetDropList` 从 `SyncMixin.js` 抽到 `PinyinMixin.js` 或新的 `DictTransferMixin.js`
- 考虑补 `tests/dictParseCore` 对 Worker 路径的 mock 测试