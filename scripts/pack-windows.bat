@echo off
REM Windows 打包脚本（需在 Windows 上运行）
REM
REM 前置：Node.js >= 18, npm, Python（用于 electron-rebuild）
REM
REM 产物（统一目录）：
REM   out\windows\%ARCH%\WubiDictEditor-<ver> Setup.exe
REM   out\windows\%ARCH%\WubiDictEditor-win32-x64.zip

setlocal
cd /d "%~dp0\.."

REM 读取 .env（如果存在）
if exist .env (
  for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
    set "%%a=%%b"
  )
)

set ARCH=x64
if not "%~1"=="" set ARCH=%~1

echo === 打包 Windows (%ARCH%) ===
call npm run make -- --platform=win32 --arch=%ARCH%
if errorlevel 1 exit /b 1

REM 统一移动产物到 out\windows\%ARCH%\
set "TARGET_DIR=out\windows\%ARCH%"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
echo === 移动产物到 %TARGET_DIR% ===
move /Y "out\make\squirrel.windows\x64\WubiDictEditor-* Setup.exe" "%TARGET_DIR%\" >nul 2>&1
move /Y "out\make\zip\win32\x64\WubiDictEditor-win32-x64.zip" "%TARGET_DIR%\" >nul 2>&1

echo.
echo === 产物 ===
for %%f in ("%TARGET_DIR%\WubiDictEditor-* Setup.exe") do echo 安装包: %%f
if exist "%TARGET_DIR%\WubiDictEditor-win32-x64.zip" echo 绿色版: %TARGET_DIR%\WubiDictEditor-win32-x64.zip
echo.
echo 用户安装：双击 Setup.exe，按 Squirrel 流程安装
echo 卸载：从控制面板"程序和功能"卸载
endlocal