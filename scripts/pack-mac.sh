#!/usr/bin/env bash
# macOS 打包脚本（需在 Mac 上运行）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# 默认按当前机器自动判断架构（Apple Silicon → arm64，Intel → x64），
# 也允许显式传参：bash scripts/pack-mac.sh arm64 | x64
detect_arch() {
  case "$(uname -m)" in
    arm64|aarch64) echo arm64 ;;
    x86_64)        echo x64  ;;
    *)             echo arm64 ;;  # 兜底：未知架构时跟随 macOS 当前主流
  esac
}

ARCH="${1:-$(detect_arch)}"
echo ">>> 打包 macOS (${ARCH}) [主机架构: $(uname -m)] ..."

npm run make -- --platform=darwin --arch="${ARCH}"

# 统一移动产物到 out/macos/<arch>/
TARGET_DIR="${ROOT}/out/macos/${ARCH}"
mkdir -p "${TARGET_DIR}"
echo ">>> 移动产物到 ${TARGET_DIR}"
find out/make -type f \( -name "*.dmg" -o -name "*.zip" \) -exec mv {} "${TARGET_DIR}/" \; 2>/dev/null || true
ls -lh "${TARGET_DIR}"

echo ""
echo ">>> 产物目录: ${TARGET_DIR}"
echo ""
echo "推荐分发 zip（用户解压后运行 WubiDictEditor.app）"
echo "若用户无法打开，告知执行:"
echo "  xattr -cr \"/path/to/WubiDictEditor.app\""
