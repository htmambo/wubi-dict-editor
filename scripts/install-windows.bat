@echo off
REM Windows 端到端安装入口
REM 1. 调用 pack-windows.bat 打包
REM 2. 自动定位 Setup.exe（动态读取版本号）
setlocal
cd /d "%~dp0\.."

call scripts\pack-windows.bat
if errorlevel 1 exit /b 1

REM 动态匹配 Setup.exe：glob 展开第一个匹配项
set SETUP_DIR=out\make\squirrel.windows\x64
set SETUP_EXE=
for %%f in ("%SETUP_DIR%\WubiDictEditor-* Setup.exe") do (
  if not defined SETUP_EXE set "SETUP_EXE=%%f"
)

if defined SETUP_EXE (
  echo 启动安装程序：%SETUP_EXE%
  start "" "%SETUP_EXE%"
) else (
  echo 未找到 Setup.exe：%SETUP_DIR%\WubiDictEditor-* Setup.exe
  exit /b 1
)
endlocal