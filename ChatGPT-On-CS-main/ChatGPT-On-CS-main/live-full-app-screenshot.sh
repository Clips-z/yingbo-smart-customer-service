#!/bin/bash
# 定时截取完整 Electron 应用主窗口并更新预览图

APP_DIR="/workspace/yingbo-smart-customer-service/ChatGPT-On-CS-main/ChatGPT-On-CS-main"
TMP="/tmp/full-app-live.png"
INTERVAL=4

# 主窗口宽度
WIN_WIDTH=528

while true; do
  # 获取当前最新的 Xvfb display（最后一个）
  XVFB_LINE=$(pgrep -a Xvfb | tail -1)
  if [ -z "$XVFB_LINE" ]; then
    sleep "$INTERVAL"
    continue
  fi

  DISPLAY_NUM=$(echo "$XVFB_LINE" | awk '{print $3}')
  AUTH_FILE=$(echo "$XVFB_LINE" | awk '{print $10}')

  DISPLAY="$DISPLAY_NUM" XAUTHORITY="$AUTH_FILE" import -window root "$TMP" 2>/dev/null || {
    sleep "$INTERVAL"
    continue
  }

  python3.11 -c "
from PIL import Image
img = Image.open('$TMP')
w, h = img.size
left = (w - $WIN_WIDTH) // 2
left = max(0, left)
cropped = img.crop((left, 0, min(left + $WIN_WIDTH, w), min(800, h)))
cropped.save('$APP_DIR/ui-preview.png')
" 2>/dev/null

  sleep "$INTERVAL"
done
