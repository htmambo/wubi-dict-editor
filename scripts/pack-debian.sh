#!/usr/bin/env bash
# Debian / Deepin 打包脚本（需在 Debian/Ubuntu/Deepin 系统上运行）
#
# 前置依赖：node >= 18, npm, dpkg, fakeroot
#   sudo apt install -y dpkg fakeroot
#
# 产物：out/make/deb/<arch>/WubiDictEditor.deb
set -euo pipefail

# 平台保护
if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "❌ pack-debian.sh 不支持 macOS，请使用 scripts/pack-mac.sh"
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
echo ">>> 打包 Debian/Deepin (${ARCH}) ..."

# 必备工具检查
for bin in node npm dpkg fakeroot; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "❌ 缺少依赖：$bin"
    if [[ "$bin" == "dpkg" || "$bin" == "fakeroot" ]]; then
      echo "   请执行：sudo apt install -y dpkg fakeroot"
    fi
    exit 1
  fi
done

# electron-forge maker-deb 是否安装
if [[ ! -d node_modules/@electron-forge/maker-deb ]]; then
  echo "❌ 缺少 @electron-forge/maker-deb，请先运行 npm install"
  exit 1
fi

# 走 electron-forge make；forge.config.js 已启用 maker-deb
npm run make -- --platform=linux --arch="${ARCH}"

DEB_PATH="${ROOT}/out/make/deb/${ARCH}/WubiDictEditor.deb"
if [[ ! -f "$DEB_PATH" ]]; then
  echo "❌ 未找到 .deb 产物：${DEB_PATH}"
  echo "   已生成的产物："
  find out/make -name "*.deb" -o -name "*.zip" 2>/dev/null | sed 's/^/     /'
  exit 1
fi

echo ""
echo ">>> 产物: ${DEB_PATH}"
echo ">>> 大小: $(du -h "$DEB_PATH" | cut -f1)"
echo ""
echo "Deepin / Debian 安装命令："
echo "  sudo apt install -y ${DEB_PATH}"
echo "  # 或者："
echo "  sudo dpkg -i ${DEB_PATH} && sudo apt -f install"
echo ""
echo "卸载：sudo apt remove wubi-dict-editor"