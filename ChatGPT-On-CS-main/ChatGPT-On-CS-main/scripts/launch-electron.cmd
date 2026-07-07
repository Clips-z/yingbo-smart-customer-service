@echo off
REM 后台启动 Electron，输出重定向到 startup.log（供自动化测试）
cd /d "%~dp0\.."
set "ELECTRON_RUN_AS_NODE="
set "NODE_OPTIONS="
set "ALLOW_MULTI_INSTANCE=1"
set "ELECTRON_USER_DATA_DIR=%CD%\.tmp-userdata"
set "DB_DIR=%CD%\.tmp-userdata"
if not exist ".tmp-userdata" mkdir ".tmp-userdata"
npx electron release/app/
