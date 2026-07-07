@echo off
chcp 65001 >nul 2>&1
REM ============================================================
REM 懒人客服 (ChatGPT-On-CS) 启动脚本
REM 使用方法：双击运行或在命令行中执行
REM ============================================================

cd /d "%~dp0"

REM 清除可能导致 Electron 崩溃的环境变量
set ELECTRON_RUN_AS_NODE=
set NODE_OPTIONS=

REM 开发模式：允许单实例锁失败时继续运行（沙箱环境需要）
set ALLOW_MULTI_INSTANCE=1

REM 重定向 userData 和数据库目录到项目内（避免沙箱权限问题）
set ELECTRON_USER_DATA_DIR=%~dp0.tmp-userdata
set DB_DIR=%~dp0.tmp-userdata

REM === 关键修复：sqlite3 napi-v8 兼容性 ===
REM Electron 26 使用 N-API v8，但 sqlite3@5 只提供到 v6 的预编译二进制
REM 需要将二进制复制到 napi-v8 路径让 node-pre-gyp 能找到
if exist "node_modules\sqlite3\lib\binding\napi-v6-win32-unknown-x64\node_sqlite3.node" (
    if not exist "node_modules\sqlite3\lib\binding\napi-v8-win32-unknown-x64\" mkdir "node_modules\sqlite3\lib\binding\napi-v8-win32-unknown-x64"
    copy /y "node_modules\sqlite3\lib\binding\napi-v6-win32-unknown-x64\node_sqlite3.node" "node_modules\sqlite3\lib\binding\napi-v8-win32-unknown-x64\node_sqlite3.node" >nul 2>&1
)

echo.
echo ============================================
echo   懒人客服 (ChatGPT-On-CS)
echo   正在启动...
echo ============================================
echo.

npx electron release/app/

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [错误] 启动失败！请检查上方错误信息。
    echo 常见原因：
    echo   1. sqlite3 二进制文件缺失 → 运行: npm install sqlite3
    echo   2. 端口被占用 → 关闭其他实例后重试
    echo   3. 残留锁文件 → 删除 AppData\Roaming\chatgpt-on-cs\lockfile
)

pause
