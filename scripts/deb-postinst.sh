#!/bin/sh
# deb postinst 脚本
# 由 electron-forge maker-deb 在打包时通过 options.scripts.postinst 注入 DEBIAN/postinst
#
# 目的：安装时刷新图标与 .desktop 缓存，避免新装的 .desktop / 图标
# 在桌面环境（GNOME / KDE / XFCE …）里看不到或显示为空白。
#
# 所有命令都用 command -v 探测；缺失则跳过（不同发行版工具位置略有差异）。
# 命令全部用 || true 兜底，单个失败不影响整体安装。
set -e

case "$1" in
    configure|triggered)
        # 0) .desktop 字段里 Icon= WubiDictEditor / StartupWMClass= WubiDictEditor，
        #    但 deb 装到 hicolor 的是 wubidicteditor.png（electron-installer-debian
        #    强制把 name lowercase 后做 appIdentifier / PNG 文件名）。
        #    把 wubidicteditor.png 复制为 WubiDictEditor.png，让 Icon= 能命中。
        for size in 16 32 48 64 128 256; do
            src="/usr/share/icons/hicolor/${size}x${size}/apps/wubidicteditor.png"
            dst="/usr/share/icons/hicolor/${size}x${size}/apps/WubiDictEditor.png"
            if [ -f "$src" ] && [ ! -e "$dst" ]; then
                cp -f "$src" "$dst" 2>/dev/null || true
            fi
        done

        # 1) 重建 hicolor 图标主题缓存
        #    路径可能不存在（极简容器）所以先 test -d
        if command -v gtk-update-icon-cache >/dev/null 2>&1; then
            if [ -d /usr/share/icons/hicolor ]; then
                gtk-update-icon-cache -f -t /usr/share/icons/hicolor >/dev/null 2>&1 || true
            fi
        fi

        # 2) 重建 .desktop 数据库
        if command -v update-desktop-database >/dev/null 2>&1; then
            if [ -d /usr/share/applications ]; then
                update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
            fi
        fi
        ;;
esac

#DEBHELPER#

exit 0
