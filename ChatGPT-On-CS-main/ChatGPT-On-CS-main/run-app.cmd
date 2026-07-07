@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

set ELECTRON_RUN_AS_NODE=
set NODE_OPTIONS=
set ALLOW_MULTI_INSTANCE=1
set ELECTRON_USER_DATA_DIR=%~dp0.tmp-userdata
set DB_DIR=%~dp0.tmp-userdata
set QIANNIU_COMPAT_ENABLED=1
set QIANNIU_COMPAT_AUTO_SEND=0
set QIANNIU_COMPAT_NON_INTRUSIVE=1

if exist "node_modules\sqlite3\lib\binding\napi-v6-win32-unknown-x64\node_sqlite3.node" (
  if not exist "node_modules\sqlite3\lib\binding\napi-v8-win32-unknown-x64\" mkdir "node_modules\sqlite3\lib\binding\napi-v8-win32-unknown-x64"
  copy /y "node_modules\sqlite3\lib\binding\napi-v6-win32-unknown-x64\node_sqlite3.node" "node_modules\sqlite3\lib\binding\napi-v8-win32-unknown-x64\node_sqlite3.node" >nul 2>&1
)

echo Starting Yingbo Intelligent Customer Service...
node "%~dp0scripts\launch-electron-detached.js"

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Startup failed. Please keep this window open and check the error above.
  pause
)
