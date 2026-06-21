# 打包与分发指南

本文档说明各平台的打包方式与产物。

## 平台支持矩阵

| 平台 | 打包脚本 | 产物格式 | 安装命令 |
|---|---|---|---|
| macOS | `scripts/pack-mac.sh` | DMG + ZIP | 拖入 Applications |
| Debian / Deepin / Ubuntu | `scripts/pack-debian.sh` | `.deb` | `sudo apt install -y ./xxx.deb` |
| Manjaro / Arch / Endeavour | `scripts/pack-manjaro.sh` | `.pkg.tar.zst` | `sudo pacman -U xxx.pkg.tar.zst` |
| Linux 通用 | `scripts/install-linux.sh` | 自动分发 | 同上 |
| Windows | `scripts/pack-windows.bat` | NSIS Setup.exe + ZIP | 双击安装 |

## 各平台打包

### macOS（需在 Mac 上运行）

```bash
# arm64 (Apple Silicon)
npm run pack:mac -- arm64

# x64 (Intel)
npm run pack:mac -- x64
```

前置：Xcode CommandLine Tools。
产物：`out/make/WubiDictEditor.dmg` / `out/make/zip/darwin/...zip`。
首次打开如遇 Gatekeeper 拦截：右键 → 打开，或 `xattr -cr /Applications/WubiDictEditor.app`。

### Debian / Deepin / Ubuntu（需 dpkg + fakeroot）

```bash
sudo apt install -y dpkg fakeroot
npm run pack:deepin
# 或：npm run pack:debian
```

产物：`out/make/deb/x64/WubiDictEditor.deb`。
安装：`sudo apt install -y ./out/make/deb/x64/WubiDictEditor.deb`。
卸载：`sudo apt remove wubi-dict-editor`。

### Manjaro / Arch（需 makepkg + base-devel）

```bash
# 不要用 root 用户
sudo pacman -S --needed base-devel pacman
npm run pack:manjaro
```

产物：`out/make/arch/wubi-dict-editor-<ver>-1-x86_64.pkg.tar.zst`。
安装：`sudo pacman -U out/make/arch/wubi-dict-editor-*.pkg.tar.zst`。
卸载：`sudo pacman -Rns wubi-dict-editor`。

### Linux 自动检测

```bash
npm run pack:linux
```

脚本读取 `/etc/os-release` 自动分发到 `pack-manjaro.sh` 或 `pack-debian.sh`。

### Windows（需在 Windows 上运行）

```bat
:: CMD 或 PowerShell
npm run pack:win
:: 或端到端（打包后自动启动 Setup.exe）
scripts\install-windows.bat
```

前置：Node.js ≥ 18、Python（用于 electron-rebuild）。
产物：
- `out\make\squirrel.windows\x64\WubiDictEditor-<ver> Setup.exe`（NSIS 安装包）
- `out\make\zip\win32\x64\WubiDictEditor-win32-x64.zip`（绿色版）

## 版本号同步

`package.json` 的 `version` 是唯一来源：
- `PKGBUILD` 的 `pkgver` 由 `pack-manjaro.sh` 在运行时通过 `sed` 动态注入
- Setup.exe 的版本号由 `@electron-forge/maker-squirrel` 自动读取
- `.deb` 版本号由 maker-deb 自动生成

更新版本只需修改 `package.json`，无需手动改其他文件。

## CI 集成建议

- **macOS / Windows**：GitHub Actions 提供原生 runner，无需额外配置。
- **Linux**：
  - Debian：可使用 `ubuntu-latest` runner，已自带 dpkg/fakeroot
  - Arch：使用 `archlinux:latest` Docker 镜像，普通用户运行 makepkg
- macOS 签名需要 Apple Developer ID；Windows 签名需要代码签名证书。

## 常见问题

**Q: makepkg 报 "Cannot make for deb"**
A: 当前在 Manjaro 等 Arch 系，调用 `npm run pack:linux` 自动选择 pack-manjaro.sh；不要在 Arch 上跑 `electron-forge make`（会触发 maker-deb 缺失）。

**Q: 启动后 Worker 不工作**
A: 检查 `out/WubiDictEditor-linux-x64/resources/app.asar.unpacked/js/` 是否存在两个 worker 文件。如果不在，说明 `forge.config.js` 的 `asar.unpack` glob 配置错误。

**Q: 安装包版本号与代码不匹配**
A: 检查 `package.json` 的 `version` 是否更新；`pack-manjaro.sh` 会从 `package.json` 注入 `pkgver`。