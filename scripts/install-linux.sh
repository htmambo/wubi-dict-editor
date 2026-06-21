#!/usr/bin/env bash
# 通用 Linux 安装入口
# 自动检测发行版与包管理器，调用对应脚本
set -euo pipefail

# 平台保护
if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "❌ install-linux.sh 不支持 macOS，请使用 scripts/pack-mac.sh"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS_DIR="${ROOT}/scripts"

# 优先读取 /etc/os-release 的 ID（更准确），兜底使用包管理器探测
detect_family() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    source /etc/os-release
    case "${ID:-}${ID_LIKE:-}" in
      *arch*|*manjaro*|*endeavour*) echo arch ;;
      *debian*|*ubuntu*|*deepin*) echo debian ;;
    esac
  fi
  # 兜底：包管理器存在性
  if command -v pacman >/dev/null 2>&1; then
    echo arch
  elif command -v dpkg >/dev/null 2>&1; then
    echo debian
  fi
}

FAMILY="$(detect_family || true)"
case "${FAMILY:-}" in
  arch)
    echo "检测到 Arch 系发行版（manjaro/arch/endeavour）"
    exec "${SCRIPTS_DIR}/pack-manjaro.sh" "$@"
    ;;
  debian)
    echo "检测到 Debian 系发行版（deepin/debian/ubuntu）"
    exec "${SCRIPTS_DIR}/pack-debian.sh" "$@"
    ;;
  *)
    echo "未识别的 Linux 发行版（无 /etc/os-release 或包管理器）"
    echo "请手动选择："
    echo "  bash scripts/pack-debian.sh   # Debian 系"
    echo "  bash scripts/pack-manjaro.sh  # Arch 系"
    exit 1
    ;;
esac