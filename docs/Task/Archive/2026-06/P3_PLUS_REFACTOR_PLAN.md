# 任务：P3+ 持续重构（PinyinMixin + Worker 测试）

**状态**: ✅ 已完成 (2026-06-19)
**创建时间**: 2026-06-19
**创建人**: main 助手（用户推动）
**实际完成**: 2026-06-19

---

## 背景

继 v1.33 完成 P0/P1/P1.5/P2 后，外部 review 留下两项 P3 待办：

1. **pinyinDict 跨 GroupOp + SyncMixin 边界**——reviewer 建议抽离为独立 mixin
2. **Worker 路径缺测试**——`dictWorkerClient.js` 无单测

本任务解决这两项。

## 子任务

### P3+ Step 1：抽取 PinyinMixin

- **范围**：GroupOpMixin 行 366-446（5 个方法）
- **改动**：抽到 `view/index/mixins/PinyinMixin.js`；GroupOpMixin 448 → 367 行
- **App.js**：mixins 数组插入 PinyinMixin（位置：GroupOpMixin 之后）
- **文档**：PinyinMixin / GroupOpMixin 顶部 JSDoc 标注 mixin 数组顺序约束
- **review**：1 次 review `d2d15a3c-...` → APPROVED（采纳 2 项：JSDoc + 删空 require）
- **测试**：33/33

### P3+ Step 2：Worker 路径测试

- **新增**：`tests/dictWorkerClient.test.js`（7 → 9 用例，最终 v3）
  - exports 检查
  - parseDictAsync 小输入 round-trip
  - serializeDictAsync 小输入
  - Worker 不可用降级
  - isForceProcessInUngroupMode flag
  - threshold 边界（< 50000）
  - 错误路径（rejected promise）
  - falsy 输入短路（v3）
  - 大词库序列化（>= 10000，v3）
- **review**：3 次 review（2 REJECTED → 1 APPROVED via kimi fallback）
  - `dcdad971-...` 第一次 REJECTED → 补 require.cache 恢复、threshold 边界、错误路径、TODO 上下文
  - `3e51c8e1-...` 第二次 REJECTED（coding-bridge 超时后 kimi）→ 补 falsy + 大词库测试
- **最终**：42/42

## 关键经验

1. **每步立即 review** 真的能抓到问题（CHANGELOG 笔误、测试夹具恢复、缺失边界值）
2. **fallback 链 coding-bridge → kimi** 在 coding-bridge 超时时生效
3. **reviewer 也会误判**（P3+ Step 1 review 中 P4 "无 try-catch" 实际已有；P3+ Step 2 review 中 "global.Worker 未恢复" 实际已恢复）——必须自己看代码，不能盲从
4. **TODO(electron-e2e)** 显式标记已知未覆盖范围，避免后续误解

## 最终产物

- `view/index/mixins/PinyinMixin.js` (92 行, 新增)
- `view/index/mixins/GroupOpMixin.js` (448 → 367 行)
- `view/index/App.js` (mixins 数组扩展)
- `tests/dictWorkerClient.test.js` (9 用例, 新增)
- `tests/TipMixin.test.js` (断言更新 5 → 6 mixin)
- `CHANGELOG.md` (v1.34 节)
- `package.json` (version 1.3.4)

## Review Session 记录

| 步骤 | Provider | Session ID | 裁决 |
|---|---|---|---|
| P3+ PinyinMixin | coding-bridge | `d2d15a3c-2bd3-490e-851d-3427a6b6c13c` | APPROVED |
| P3+ Worker v1 | coding-bridge | `dcdad971-31dc-47d1-aa54-591c46ef6306` | REJECTED |
| P3+ Worker v2 | coding-bridge | `3e51c8e1-ca89-414e-bdc9-323d126eaa3a` | timeout → fallback |
| P3+ Worker v3 | kimi | `session_ba3e5d5c-edee-4f4b-809e-1fd7d0746cad` | APPROVED |

## 后续 P4+ 待办

- Electron 渲染进程 E2E 测试（worker postMessage 协议、Transferable、electron-shell 集成）
- 把 `pinyinDict` 数据字段从 App.js data() 移到 PinyinMixin.data()（避免跨 mixin 隐式 data 依赖）
- 考虑把 moveWordsToTargetDict / resetDropList 也归到 PinyinMixin 或独立 DictTransferMixin