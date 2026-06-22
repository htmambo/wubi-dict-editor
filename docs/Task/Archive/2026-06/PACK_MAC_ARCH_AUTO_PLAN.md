# pack-mac.sh 默认架构改为自动检测

**Status**: ✅ Completed (completion time: 2026-06-23)

## 验收结果

- [x] `bash -n scripts/pack-mac.sh` 语法 OK
- [x] `node -e JSON.parse package.json` 语法 OK
- [x] 自动检测：当前主机 x86_64 → 默认 arch = x64
- [x] 显式传参 `arm64`/`x64` 透传正确
- [x] 异常输入 `foo` 直接透传（保持透传语义，由 electron-forge 自决）
- [x] `yarn test` 47/47 通过，无退化

## 实施摘要

- `scripts/pack-mac.sh` 提取 `detect_arch()` 函数，默认值改为 `$(uname -m)` + 规范化
- `package.json` 删除冗余 `make:mac:arm64`/`make:mac:x64`/`make:mac`（直接调 electron-forge 绕过 pack 脚本），新增 `pack:mac:arm64`/`pack:mac:x64`/`pack:mac:all`
- 待外部审核 MCP review（runReview kind=code）

## External Review Opinion (Phase 1)

**Provider**: coding-bridge (runReview kind=code)
**Verdict**: ✅ **APPROVED** (附非阻塞建议)

### 评审要点

1. **`detect_arch` 兜底分支 `*) echo arm64` 合理** — Apple Silicon 已是当前 macOS 绝对主流；新增的 `[主机架构: $(uname -m)]` 日志让兜底错误时也能立刻定位。
2. **删除 `make:mac*` 三个 npm script** — 审核员要求全局搜索调用方。主助手已执行 `grep -rn "make:mac"`：
   - 业务代码 / CI / 其他脚本：**0 处引用** ✅
   - 命中仅为本次归档文档自身（任务说明 + 索引 README.md）
3. **无需补充自动化回归测试** — `uname -m` 解析属底层系统调用，Mock 成本远高于收益；现有 `echo` 日志已充当「测试桩」。

### 后续可优化（非阻塞）

- 兜底分支未来若考虑更严格，可改为 `echo "unknown"` 并由 electron-forge 报错，而非静默回落到 arm64。

### 调用方搜索结果

```
grep -rn "make:mac" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=out .
→ 命中全部位于 docs/Task/（本次任务文档/索引），无业务/CI/脚本调用
```

## 背景

`scripts/pack-mac.sh` 把默认架构硬编码成 `arm64`：

```bash
ARCH="${1:-arm64}"
npm run make -- --platform=darwin --arch="${ARCH}"
```

任何不传参的调用（例如直接 `yarn pack:mac` / `bash scripts/pack-mac.sh`）都会强制走 arm64，导致：

1. 在 Intel Mac 上运行脚本得到 arm64 包，无法在该机器上启动验证
2. CI/双架构发布流程需要人工记得传 `x64`，容易遗漏
3. `package.json` 里已经同时声明了 `make:mac:arm64` 和 `make:mac:x64`，脚本入口却把 x64 路径堵死，自相矛盾

## 目标

让 `pack-mac.sh` 不传参时根据当前机器自动判断架构（arm64 Mac → arm64；Intel Mac → x64），同时保留显式传参能力用于 CI 矩阵。

## 改动清单

### 1. `scripts/pack-mac.sh`

- 用 `uname -m` 替换 `arm64` 作为默认架构
- 将 `x86_64` 规范化为 `x64`、`aarch64` 规范化为 `arm64`，避免上游 Electron 不识别
- 显式 echo 当前生效的架构，让用户在终端一眼看到

### 2. `package.json`

- `make:mac:arm64` → 改为 `pack:mac:arm64`：`bash scripts/pack-mac.sh arm64`
- `make:mac:x64` → 改为 `pack:mac:x64`：`bash scripts/pack-mac.sh x64`
- `make:mac` 保留并改为 `pack:mac:all`：串联两次脚本，产物落在 `out/macos/arm64/` 和 `out/macos/x64/`
- 删除冗余的 `make:mac:arm64` / `make:mac:x64` 两个 npm script（被 pack:mac:* 替代）

### 3. 文档

- 在 CHANGELOG 记录本变更（如果存在的话）

## 验收

- [x] `bash scripts/pack-mac.sh` 不传参时输出当前架构（arm64 或 x64）
- [x] `bash scripts/pack-mac.sh arm64` 仍走 arm64
- [x] `bash scripts/pack-mac.sh x64` 仍走 x64
- [x] `yarn pack:mac:arm64` / `yarn pack:mac:x64` / `yarn pack:mac` 三个入口都通
- [x] shell 语法检查通过：`bash -n scripts/pack-mac.sh`
- [x] 现有测试 47/47 不退化（基线 44，本次同步验证 47）

## 风险与边界

- **mac 包只能在 Mac 上出**：脚本注释里已写明，本改动不改变这一点
- **跨架构打包（如在 M1 上出 x64）**：技术上 `electron-forge make` 支持，但 Rosetta 模拟性能差；脚本不强制阻止，由调用方自决
- **CI 矩阵**：CI 仍可显式传 `arm64` 或 `x64`，不受自动检测影响

## 备选方案（已 Rejected）

- **B：禁掉默认参数强制调用方传值** — 用户体验差，违背「脚本应能即开即用」原则
- **改用 `node -e "process.arch"` 检测** — 引入 Node 调用，与 shell 脚本风格不一致；`uname -m` 已经是 POSIX 标准