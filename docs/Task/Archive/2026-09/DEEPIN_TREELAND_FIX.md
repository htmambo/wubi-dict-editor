# Deepin 25 + Treeland 打包与字号修复

**Status**: ✅ Completed (2026-09-09)

## 验收结果

- [x] `npm install` 后 postinstall 自动应用 unzip.js 替换（`scripts/fix-extract-zip.js`）
- [x] `npm run make -- --platform=linux --arch=x64` 走通，`out/make/deb/x64/wubidicteditor_1.3.4_amd64.deb` 产出
- [x] `sudo dpkg -i` 装包成功；`/usr/bin/wubidicteditor` 启动无报错
- [x] 默认 CSS zoom=1.2，4K 屏下视觉字号与标题栏一致
- [x] `WUBI_ZOOM_FACTOR=N` 可覆盖默认值，1.2 / 1.5 / 2 三个档位均生效
- [x] `node -c main.js` 语法 OK；`yarn test`（若有）不需参与（修复与单测无关）

## 实施摘要

两条独立的修复链：

1. **打包卡"Packaging for x64 on linux"** —— `@electron/packager@18.4.4` 调 `extract-zip@2.0.1`，后者在 Node v22+ 上解 28.x 的 zip 走到第一个 entry 就退出，packager 没有进度也没有错误提示。改 `unzip.js` 为 `spawn('unzip')`。`scripts/fix-extract-zip.js` idempotent，挂在 `postinstall` 自动应用。

2. **Deepin 4K 屏下应用内容字号小** —— Treeland/XWayland 下 XWayland 报 size=2880×1800（OS 133% 缩放后 logical），Chromium 内部 dpr=1，物理 buffer 只占 4K 屏 43%。`BrowserWindow.setSize` / `setZoomFactor` 在 XWayland 下不可靠地改变 layout viewport（已诊断验证：getZoomFactor=1.333 但 `innerWidth` 仍=1250）。最稳的修复：`ozone-platform=x11` + `force-device-scale-factor=1` 锁住 dpr，did-finish-load 后 `webContents.insertCSS('html, body { zoom: 1.2 !important }')`。默认 1.2（4K 屏实测合适），可被 `WUBI_ZOOM_FACTOR` 覆盖。

## 背景

### 症状 1：打包卡死

```
$ npm run make -- --platform=linux --arch=x64
✔ Preparing native dependencies
✔ Finalizing package
✔ Packaging for x64 on linux   ← 之后就卡住，无输出
```

### 症状 2：deb 安装后启动/字号异常

- 默认安装启动后窗口内容看起来"放大 2 倍"（窗口占屏 ~87%）
- 加 `force-device-scale-factor=1` + `disable-gpu` → 应用能跑但内容字号"小一半"
- 加 `setZoomFactor(N)` → `getZoomFactor` / `window.devicePixelRatio` 都正确接受，但视觉无变化
- 改用 `ozone-platform=x11` 绕开 Treeland native Wayland 路径 → 字号小但稳定不 FATAL
- 最终用 CSS `zoom` 属性（web 标准，`webContents.insertCSS` 注入）→ 字号视觉生效

### 根因

`extract-zip@2.0.1` 依赖的 Node stream API 在 v22+ 后 backpressure 处理变更，导致解大 zip 时第一个 entry 完成后异常退出。

Treeland + Electron 28 有两个互相纠缠的问题：

1. Treeland native Wayland 协议下，Chromium Ozone 报 `devicePixelRatio=2`，但 Electron 的 `screen.scaleFactor` 报 1，导致 BrowserWindow 物理 buffer 与 CSS layout 出现 2× 偏差
2. Treeland 的 EGL 栈与 Electron 28 GPU 进程频繁 FATAL（`gl_surface_presentation_helper.cc`、`gpu_data_manager_impl_private.cc`）

`BrowserWindow.setSize` / `webContents.setZoomFactor` 在 XWayland + force-scale=1 组合下不被 Chromium 真正应用到 layout viewport（已通过 `executeJavaScript` 读 `window.innerWidth` 验证 = 1250，期望 1666）。

## 目标

让 Deepin 25 + Treeland + 4K 屏用户能：

1. 顺利打包 deb（不卡、不需要手动 patch `node_modules`）
2. 安装后正常启动、字号与 OS 缩放一致

## 改动清单

### 1. `scripts/fix-extract-zip.js`（新增）

把 `@electron/packager/dist/unzip.js` 替换为 `spawn('unzip')` 实现。脚本幂等：通过 `PATCH_MARK` 字符串检测是否已 patch，已 patch 直接跳过。

### 2. `package.json`

- 新增 `"fix:extract-zip"` 脚本（手动跑）
- 新增 `"postinstall"` 自动跑 `fix:extract-zip.js`

### 3. `main.js`

- `process.platform === 'linux'` 时 `app.commandLine.appendSwitch('ozone-platform', 'x11')` + `'force-device-scale-factor', '1'`
- `createMainWindow` 内 `did-finish-load` 事件里 `mainWindow.webContents.insertCSS(...)` 注入 CSS zoom
- 默认 zoom=1.2，`process.env.WUBI_ZOOM_FACTOR` 可覆盖
- 仅 Linux 生效，macOS / Windows 打包产物不受影响

### 4. `docs/Usage/PACKAGING_GUIDE.md` / `CHANGELOG.md`（更新）

补充 Deepin 4K 屏缩放说明 + changelog 条目。

## 风险与边界

- **`ozone-platform=x11` 仅在 Linux 路径**：`if (process.platform === 'linux')` 保护，macOS / Windows 走默认 Ozone，不影响其它平台
- **`unzip` shell 调用替代**：`unzip` 是 POSIX 标准工具，Deepin / Ubuntu / Manjaro 默认安装；macOS / Windows 上 `unzip` 也存在（macOS 自带，Windows 走 `tar -xf` 不需要）—— 但 patch 只对 Linux 生效（@electron/packager 仅在 Linux 平台调 extract）
- **`force-device-scale-factor=1` 与 zoom 组合**：CSS `zoom` 是 web 标准层缩放，与 devicePixelRatio 正交；Chromium 28 在 force-scale=1 下 CSS zoom 仍然生效（已验证）
- **`postinstall` 失败不阻断 install。`scripts/fix-extract-zip.js` 在 node_modules 缺失时静默退出（exit 0），不会让 `npm install` 失败
- **Debian / Manjaro 其它发行版**：在普通 X11 / GNOME 上 `ozone-platform=x11` 是 fallback 行为，无副作用；用户可根据自己的屏物理分辨率调 `WUBI_ZOOM_FACTOR`

## 备选方案（已 Rejected）

- **升级 `@electron-forge/*` 到 v8** — 涉及 Electron 版本跳变、forge API 不兼容，工作量远超本次修复范围，留待后续规划
- **降 Node 到 v20 LTS** — 用户已升级到 Node v26.8.1 是合理选择（性能更好），不应为了打包工具卡旧版本
- **改用 `electron-builder`** — 配置改动巨大、与现有 `forge.config.js` / `scripts/pack-*.sh` 不兼容，仅在打包兼容性长期无法解决时再考虑

## 测试建议

```bash
# 1. 清环境后重装
rm -rf node_modules package-lock.json
npm install                  # postinstall 应自动跑 fix-extract-zip.js

# 2. 打包
npm run make -- --platform=linux --arch=x64
# 应在 ~20s 内完成，看到 "✔ Making a deb distributable for linux/x64"

# 3. 安装 + 启动
sudo dpkg -i out/make/deb/x64/wubidicteditor_1.3.4_amd64.deb
/usr/bin/wubidicteditor

# 4. 调整 zoom
pkill -9 -f WubiDictEditor
WUBI_ZOOM_FACTOR=1.5 /usr/bin/wubidicteditor   # 试不同档位
```