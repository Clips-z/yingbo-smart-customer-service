@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

if not exist ".venv-wechat\Scripts\python.exe" (
  echo 微信自动回复运行环境不存在。
  pause
  exit /b 1
)

echo 正在启动微信 3.9 自动回复连接...
node scripts\start-wechat-sidecar.js --backend wechat39

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo 启动失败，请查看 .tmp-userdata\logs\wechat-sidecar-launch.log
  pause
)
