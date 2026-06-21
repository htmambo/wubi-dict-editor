# 打包与分发指南

本文档说明各平台的打包方式、产物结构与安装命令。

## 统一产物目录结构

所有平台的产物统一放在 `out/` 下，按 **系统/类型/架构** 三级目录：

```
out/
├── macos/
│   ├── arm64/
│   │   ├── WubiDictEditor.dmg
│   │   └── WubiDictEditor-darwin-arm64-*.zip
│   └── x64/
│       ├── WubiDictEditor.dmg
│       └── WubiDictEditor-darwin-x64-*.zip
├── windows/
│   ├── x64/
│   │   ├── WubiDictEditor-* Setup.exe
│   │   └── WubiDictEditor-win32-x64.zip
│   └── arm64/
│       └── ...
├── linux-deb/                  # Debian / Deepin / Ubuntu
│   ├── x64/
│   │   └── WubiDictEditor.deb
│   └── arm64/
│       └── WubiDictEditor.deb
├── linux-arch/                 # Manjaro / Arch / Endeavour
│   ├── x64/
│   │   └── wubi-dict-editor-*-x86_64.pkg.tar.zst
│   └── ...
└── linux-zip/                  # 通用 Linux 绿色版（可选，未来扩展）
    └── x64/
        └── WubiDictEditor-linux-x64.zip
```

**目录命名规则**：
- `<系统>`：`macos` / `windows` / `linux-deb` / `linux-arch` / `linux-zip`
- `<架构>`：`x64` / `arm64` / `x86_64`

> 旧的 `out/make/deb/...`、`out/make/zip/...`、`out/make/arch/` 路径已废弃。

## 各平台打包

### macOS（需在 Mac 上运行）

```bash
npm run pack:mac -- arm64   # Apple Silicon
npm run pack:mac -- x64     # Intel
```

前置：Xcode CommandLine Tools。
产物：`out/macos/<arch>/WubiDictEditor.dmg` + `.zip`。
首次打开遇 Gatekeeper 拦截：`xattr -cr /Applications/WubiDictEditor.app`。

### Debian / Deepin / Ubuntu

```bash
sudo apt install -y dpkg fakeroot
npm run pack:deepin
```

产物：`out/linux-deb/x64/WubiDictEditor.deb`。
安装：`sudo apt install -y ./out/linux-deb/x64/WubiDictEditor.deb`。
卸载：`sudo apt remove wubi-dict-editor`。

### Manjaro / Arch

```bash
sudo pacman -S --needed base-devel pacman imagemagick
npm run pack:manjaro
```

**注意**：makepkg 禁止 root 运行。CI 容器可设置 `ALLOW_MAKEPKG_AS_ROOT=1` 跳过。

产物：`out/linux-arch/x64/wubi-dict-editor-<ver>-1-x86_64.pkg.tar.zst`。
安装：`sudo pacman -U out/linux-arch/x64/wubi-dict-editor-*.pkg.tar.zst`。
卸载：`sudo pacman -Rns wubi-dict-editor`。

**关键依赖**：`imagemagick` 用于从 `appIcon.ico` 生成多尺寸 PNG（16/32/48/64/128/256）。
打包脚本不会重打包 `app.asar`（避免破坏原有 unpack 配置），
而是在 makepkg 的 BUILD_DIR 中生成 PNG，让 PKGBUILD 直接装到
`/usr/share/icons/hicolor/<size>x<size>/apps/wubi-dict-editor.png`，
桌面环境（GNOME/KDE/XFCE）按 `Icon=wubi-dict-editor` 自动按 DPI 选择合适尺寸。

**chrome-sandbox**：electron-forge 打包的 `chrome-sandbox` 默认 `0755` 非 SUID root，
Linux 上启用 sandbox 会直接 Abort。PKGBUILD 删除随包 `chrome-sandbox`，
并在 `.desktop` 的 `Exec` 中显式加 `--no-sandbox`（单用户桌面应用可接受）。
不再依赖系统 `electron` 包的 SUID sandbox（实际不会自动回退）。

### Linux 自动检测

```bash
npm run pack:linux
```

脚本读 `/etc/os-release` 的 `ID`/`ID_LIKE`，自动分发到 pack-manjaro.sh 或 pack-debian.sh。

### Windows（需在 Windows 上运行）

```bat
npm run pack:win
:: 或端到端（打包+启动安装）
scripts\install-windows.bat
```

前置：Node.js ≥ 18、Python。
产物：
- `out\windows\x64\WubiDictEditor-<ver> Setup.exe`（NSIS）
- `out\windows\x64\WubiDictEditor-win32-x64.zip`（绿色版）

## 版本号同步

`package.json` 的 `version` 是唯一来源：
- `PKGBUILD` 的 `pkgver` 由 `pack-manjaro.sh` 通过 `sed` 动态注入
- Setup.exe 的版本号由 `@electron-forge/maker-squirrel` 自动读取
- `.deb` 版本号由 maker-deb 自动生成

更新版本只需修改 `package.json`。

## CI 集成建议

- **macOS / Windows**：GitHub Actions 提供原生 runner。
- **Linux**：
  - Debian：`ubuntu-latest` runner（自带 dpkg/fakeroot）
  - Arch：`archlinux:latest` Docker 镜像，普通用户运行 makepkg（或 `ALLOW_MAKEPKG_AS_ROOT=1`）

## 常见问题

**Q: makepkg 报 "Cannot make for deb"**
A: 当前在 Arch 系上，调用 `npm run pack:linux` 自动选择 pack-manjaro.sh；不要在 Arch 上直接 `electron-forge make`。

**Q: 应用启动后 Worker 不工作**
A: 检查 `out/WubiDictEditor-linux-x64/resources/app.asar.unpacked/js/` 是否存在两个 worker 文件。缺失则检查 `forge.config.js` 的 `asar.unpack` glob 配置。

**Q: 产物路径与文档不一致**
A: 检查 `scripts/pack-*.sh` 中 `TARGET_DIR` 是否正确。pack-mac/debian/manjaro 都会自动把 forge 默认输出移动到 `out/<系统>/<架构>/` 下。

**Q: root 用户跑 pack-manjaro.sh 失败**
A: makepkg 禁止 root。CI 容器加 `ALLOW_MAKEPKG_AS_ROOT=1` 跳过；本地请切换普通用户。