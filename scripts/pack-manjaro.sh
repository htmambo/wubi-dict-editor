#!/usr/bin/env bash
# Manjaro / Arch 打包脚本
#
# 流程：
#   1. 用 electron-forge package 生成 unpacked 应用
#   2. 用 makepkg + PKGBUILD 把 unpacked 应用打成 .pkg.tar.zst
#
# 前置依赖：node >= 18, npm, pacman, makepkg, base-devel, imagemagick
#   sudo pacman -S --needed base-devel pacman imagemagick
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

# makepkg 禁止 root 运行（CI 容器除外）
if [[ $EUID -eq 0 ]]; then
  if [[ -z "${ALLOW_MAKEPKG_AS_ROOT:-}" ]]; then
    echo "❌ makepkg 禁止以 root 运行"
    echo "   CI 容器可设置 ALLOW_MAKEPKG_AS_ROOT=1 跳过检查"
    exit 1
  fi
  echo "⚠️  WARNING: running makepkg as root (ALLOW_MAKEPKG_AS_ROOT is set)"
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
rm -rf "${OUT_DIR}" "out/linux-arch/${ARCH}"
npm run package -- --platform=linux --arch="${ARCH}"

if [[ ! -d "${OUT_DIR}" ]]; then
  echo "❌ 未找到 unpacked 应用：${OUT_DIR}"
  exit 1
fi

# 2. 调用 makepkg 在临时目录构建
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "${BUILD_DIR}"' EXIT

# 1.5 生成多尺寸 PNG 图标到 BUILD_DIR（PKGBUILD 的 source 引用这些文件）
# 仓库源图标仅含 .ico / .icns，Linux 桌面环境只认 PNG，
# 因此这里用 ImageMagick 从 .ico 提取并生成常用尺寸。
# 不解包/重打包 app.asar（破坏原有 unpack 配置的风险），图标只放 BUILD_DIR 供 PKGBUILD 装入 /usr/share/icons。
ICO_SRC="${ROOT}/assets/img/appIcon/appIcon.ico"
ICON_SIZES=(16 32 48 64 128 256)
echo ">>> 阶段 1.5：从 appIcon.ico 生成多尺寸 PNG 到 BUILD_DIR"
if command -v magick >/dev/null 2>&1; then
  MAGICK_CMD=(magick)
elif command -v convert >/dev/null 2>&1; then
  MAGICK_CMD=(convert)
else
  echo "❌ 未找到 ImageMagick（magick / convert），无法生成 PNG 图标"
  echo "   请执行：sudo pacman -S --needed imagemagick"
  exit 1
fi
for size in "${ICON_SIZES[@]}"; do
  "${MAGICK_CMD[@]}" "${ICO_SRC}[0]" -resize "${size}x${size}" -alpha on -background none \
      "${BUILD_DIR}/appIcon-${size}.png"
  [[ -s "${BUILD_DIR}/appIcon-${size}.png" ]] || { echo "❌ PNG ${size}x${size} 生成失败"; exit 1; }
done

# 动态生成 PKGBUILD（pkgver 取自 package.json）
sed "s/^pkgver=.*/pkgver=${PKG_VER}/" scripts/PKGBUILD > "${BUILD_DIR}/PKGBUILD"

# PKGBUILD 的 source 指向 WubiDictEditor-linux-x64.tar.gz，
# 必须先把 unpacked 应用打包成同名 tar.gz 放到 BUILD_DIR 根目录
echo ">>> 阶段 2/3：打包 unpacked 应用为 tar.gz"
tar -czf "${BUILD_DIR}/${OUT_DIR##*/}.tar.gz" -C out "${OUT_DIR##*/}"

echo ">>> 阶段 3/3：makepkg (in ${BUILD_DIR})"
(cd "$BUILD_DIR" && makepkg -sf --noconfirm)

# 统一移动产物到 out/linux-arch/<arch>/
TARGET_DIR="${ROOT}/out/linux-arch/${ARCH}"
mkdir -p "${TARGET_DIR}"
echo ">>> 移动产物到 ${TARGET_DIR}"
cp "${BUILD_DIR}"/*.pkg.tar.* "${TARGET_DIR}/"

PKG_FILE="$(ls ${TARGET_DIR}/wubi-dict-editor-*.pkg.tar.* | head -1 | xargs -n1 basename)"

echo ""
echo ">>> 产物: ${TARGET_DIR}/${PKG_FILE}"
echo ""
echo "安装命令："
echo "  sudo pacman -U ${TARGET_DIR}/${PKG_FILE}"
echo ""
echo "卸载：sudo pacman -Rns wubi-dict-editor"