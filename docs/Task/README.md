# 任务索引

## 活跃任务 (Active)
（当前无活跃任务）

## 已完成任务 (Archive)

### 2026-06

- ✅ [fork 与上游对齐 + 内部重构](Archive/2026-06/P0P1_REFACTOR_PLAN.md) — 完成于 2026-06-19
  - P0 合并 PinyinDictHelper 同步/异步实现
  - P1 round-trip smoke test
  - P1.5 App.js 烟雾测试
  - P2 拆分 App.js 为 5 个 mixin
  - P3a CHANGELOG v1.33
  - 外部审核 MCP 4 次 review（3 APPROVED + 1 REJECTED 已修）
  - 33/33 测试通过

- ✅ [P3+ 持续重构](Archive/2026-06/P3_PLUS_REFACTOR_PLAN.md) — 完成于 2026-06-19
  - PinyinMixin 抽取（GroupOpMixin 448 → 367 行）
  - Worker 路径测试（dictWorkerClient 9 用例）
  - CHANGELOG v1.34
  - 4 次外部 review（2 APPROVED + 1 timeout fallback kimi APPROVED + 1 REJECTED 已修）
  - 42/42 测试通过

- ✅ [审核发现的问题修复](Archive/2026-06/AUDIT_FIX_PLAN.md) — 完成于 2026-06-21
  - P0 Dict.lastIndex 取文件中最大 word id 而非 lines.length（修复持久化 id 冲突）
  - P0 Worker 文件 asarUnpack 排除（防止打包后 Worker 加载失败）
  - P1 wordFromLine 边界防御（空行/BOM/缺字段）
  - P1 PinyinMixin.created 依赖方法运行时检测
  - P2 main.js 删除重复 getRimeExecDir，统一从 RimeExecResolver 导入
  - 2 个新增回归测试，44/44 通过
