#!/usr/bin/env bash
# Manjaro / Arch 打包脚本
#
# 流程：
#   1. 用 electron-forge package 生成 unpacked 应用
#   2. 用 makepkg + PKGBUILD 把 unpacked 应用打成 .pkg.tar.zst
#
# 前置依赖：node >= 18, npm, pacman, makepkg, base-devel
#   sudo pacman -S --needed base-devel pacman
#
# 注意：makepkg 禁止以 root 运行，请在普通用户下执行。
# 产物：wubi-dict-editor-<ver>-1-x86_64.pkg.tar.zst
set -euo pipefail

# 平台保护：macOS 上不应运行此脚本
if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "❌ pack-manjaro.sh 不支持 macOS，请使用 scripts/pack-mac.sh"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

ARCH="${1:-x64}"
echo ">>> 打包 Manjaro/Arch (${ARCH}) ..."

# makepkg 禁止 root
if [[ $EUID -eq 0 ]]; then
  echo "❌ makepkg 禁止以 root 运行，请切换普通用户"
  exit 1
fi

# 必备工具检查
for bin in node npm makepkg; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "❌ 缺少依赖：$bin"
    if [[ "$bin" == "makepkg" ]]; then
      echo "   请执行：sudo pacman -S --needed base-devel pacman"
    fi
    exit 1
  fi
done

# 读取 package.json 的版本号作为 PKGBUILD 的 pkgver
PKG_VER="$(node -p "require('./package.json').version")"
echo ">>> 版本：${PKG_VER}"

OUT_DIR="out/WubiDictEditor-linux-${ARCH}"

# 1. 先用 electron-forge package 生成 unpacked 应用
# 注意：只清理当前 arch 的子目录，保留其他平台的产物
echo ">>> 阶段 1/3：electron-forge package"
rm -rf "${OUT_DIR}" out/make/arch
npm run package -- --platform=linux --arch="${ARCH}"

if [[ ! -d "${OUT_DIR}" ]]; then
  echo "❌ 未找到 unpacked 应用：${OUT_DIR}"
  exit 1
fi

# 2. 调用 makepkg 在临时目录构建
BUILD_DIR="$(mktemp -d)"
# trap 必须放在 BUILD_DIR 赋值之后，避免 set -u 下未定义变量展开
trap 'rm -rf "${BUILD_DIR}"' EXIT

# 动态生成 PKGBUILD（pkgver 取自 package.json）
sed "s/^pkgver=.*/pkgver=${PKG_VER}/" scripts/PKGBUILD > "${BUILD_DIR}/PKGBUILD"

# PKGBUILD 的 source 指向 WubiDictEditor-linux-x64.tar.gz，
# 必须先把 unpacked 应用打包成同名 tar.gz 放到 BUILD_DIR 根目录
echo ">>> 阶段 2/3：打包 unpacked 应用为 tar.gz"
tar -czf "${BUILD_DIR}/${OUT_DIR##*/}.tar.gz" -C out "${OUT_DIR##*/}"

echo ">>> 阶段 3/3：makepkg (in ${BUILD_DIR})"
(cd "$BUILD_DIR" && makepkg -sf --noconfirm)

# 复制产物到 out/
mkdir -p out/make/arch
cp "${BUILD_DIR}"/*.pkg.tar.* out/make/arch/

PKG_FILE="$(ls out/make/arch/wubi-dict-editor-*.pkg.tar.* | head -1 | xargs -n1 basename)"

echo ""
echo ">>> 产物: out/make/arch/${PKG_FILE}"
echo ""
echo "安装命令："
echo "  sudo pacman -U out/make/arch/${PKG_FILE}"
echo ""
echo "卸载：sudo pacman -Rns wubi-dict-editor"