"""
抖音电商工作台 - OCR 截屏采集 Sidecar
使用 PrintWindow + RapidOCR 方案，参考企微 sidecar 实现。
"""
import argparse
import json
import os
import sys
import time
import threading
from pathlib import Path

# ========== 命令行参数 ==========
parser = argparse.ArgumentParser(description="抖音电商工作台消息采集")
parser.add_argument("--backend", default="douyin", help="后端模式")
parser.add_argument("--duration", default="12h", help="运行时长")
parser.add_argument("--api-port", type=int, default=5555, help="API 端口")
args = parser.parse_args()

API_BASE = f"http://127.0.0.1:{args.api_port}"


def parse_duration(duration_str):
    import re
    match = re.match(r"(\d+)([hms])", duration_str)
    if not match:
        return None
    num = int(match.group(1))
    unit = match.group(2)
    if unit == "h":
        return num * 3600
    elif unit == "m":
        return num * 60
    return num


DURATION_SEC = parse_duration(args.duration) if args.duration != "forever" else None

# ========== 依赖检测 ==========
try:
    import win32gui
    import win32ui
    import win32con
    import win32api
    from PIL import Image
except ImportError as e:
    print(f"[ERROR] 缺少 Windows API 依赖: {e}", file=sys.stderr)
    print("[ERROR] 请运行 初始化环境.bat 安装依赖", file=sys.stderr)
    sys.exit(1)

try:
    from rapidocr_onnxruntime import RapidOCR
    ocr = RapidOCR()
except ImportError:
    print("[ERROR] 缺少 RapidOCR，请运行: pip install rapidocr-onnxruntime", file=sys.stderr)
    sys.exit(1)

# ========== HTTP 通信 ==========
import urllib.request
import urllib.error


def post_json(url, payload, timeout=15):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        print(f"[WARN] HTTP 请求失败: {url} - {e}")
        return None


def send_health(state="running", error=None):
    payload = {"state": state}
    if error:
        payload["error"] = error
    post_json(f"{API_BASE}/api/v1/compat/douyin/health", payload)


def get_reply(friend, content):
    payload = {
        "platformId": "win_douyin",
        "platformName": "抖音电商",
        "instanceId": "douyin-default",
        "sender": friend,
        "content": content,
        "ctx": {"CTX_USERNAME": friend, "CTX_PLATFORM": "抖音电商", "CTX_APP_ID": "win_douyin"},
    }
    result = post_json(f"{API_BASE}/api/v1/message/simulate", payload)
    if not result:
        return None
    data = result.get("data", {})
    return {
        "content": data.get("content", ""),
        "mode": data.get("mode", "hint"),
        "suggestionId": data.get("suggestionId"),
        "safeToAutoSend": data.get("safeToAutoSend", False),
    }


# ========== 窗口查找 ==========
def find_douyin_window():
    """查找抖音电商工作台窗口"""
    def callback(hwnd, windows):
        if win32gui.IsWindowVisible(hwnd):
            title = win32gui.GetWindowText(hwnd)
            class_name = win32gui.GetClassName(hwnd)
            # 抖音电商飞鸽工作台的窗口特征
            keywords = ["飞鸽", "抖音", "抖店", "jinritemai", "douyin", "bytedance"]
            if any(kw in title.lower() or kw in class_name.lower() for kw in keywords):
                rect = win32gui.GetWindowRect(hwnd)
                w, h = rect[2] - rect[0], rect[3] - rect[1]
                if w > 400 and h > 300:
                    windows.append((hwnd, title, class_name, rect))
        return True

    windows = []
    win32gui.EnumWindows(callback, windows)
    return windows


# ========== 截图与 OCR ==========
def capture_window(hwnd):
    try:
        rect = win32gui.GetWindowRect(hwnd)
        left, top, right, bottom = rect
        width = right - left
        height = bottom - top

        hwnd_dc = win32gui.GetWindowDC(hwnd)
        mfc_dc = win32ui.CreateDCFromHandle(hwnd_dc)
        save_dc = mfc_dc.CreateCompatibleDC()

        bitmap = win32ui.CreateBitmap()
        bitmap.CreateCompatibleBitmap(mfc_dc, width, height)
        save_dc.SelectObject(bitmap)

        result = win32gui.PrintWindow(hwnd, save_dc.GetSafeHdc(), 2)
        if result != 1:
            win32gui.PrintWindow(hwnd, save_dc.GetSafeHdc(), 1)

        bmp_info = bitmap.GetInfo()
        bmp_bits = bitmap.GetBitmapBits(True)
        img = Image.frombuffer("RGB", (bmp_info["bmWidth"], bmp_info["bmHeight"]), bmp_bits, "raw", "BGRX", 0, 1)

        win32gui.DeleteObject(bitmap.GetHandle())
        save_dc.DeleteDC()
        mfc_dc.DeleteDC()
        win32gui.ReleaseDC(hwnd, hwnd_dc)

        return img
    except Exception as e:
        print(f"[WARN] 截图失败: {e}")
        return None


def ocr_text(img, region=None):
    if region:
        img = img.crop(region)
    result, _ = ocr(img)
    if not result:
        return []
    return [(item[1], item[2]) for item in result]


# ========== 布局解析 ==========
class DouyinLayoutParser:
    """
    抖音电商飞鸽工作台布局常量
    需要根据实际窗口调整比例值
    """
    CONV_LIST_LEFT_RATIO = 0.0
    CONV_LIST_RIGHT_RATIO = 0.22
    CONV_LIST_TOP_RATIO = 0.06
    CONV_LIST_BOTTOM_RATIO = 0.94

    CHAT_LEFT_RATIO = 0.23
    CHAT_RIGHT_RATIO = 1.0
    CHAT_TOP_RATIO = 0.06
    CHAT_BOTTOM_RATIO = 0.80

    INPUT_TOP_RATIO = 0.81
    INPUT_BOTTOM_RATIO = 0.95

    def __init__(self, width, height):
        self.w = width
        self.h = height

    def conv_list_region(self):
        return (
            int(self.w * self.CONV_LIST_LEFT_RATIO),
            int(self.h * self.CONV_LIST_TOP_RATIO),
            int(self.w * self.CONV_LIST_RIGHT_RATIO),
            int(self.h * self.CONV_LIST_BOTTOM_RATIO),
        )

    def chat_region(self):
        return (
            int(self.w * self.CHAT_LEFT_RATIO),
            int(self.h * self.CHAT_TOP_RATIO),
            int(self.w * self.CHAT_RIGHT_RATIO),
            int(self.h * self.CHAT_BOTTOM_RATIO),
        )

    def input_region(self):
        return (
            int(self.w * self.CHAT_LEFT_RATIO),
            int(self.h * self.INPUT_TOP_RATIO),
            int(self.w * self.CHAT_RIGHT_RATIO),
            int(self.h * self.INPUT_BOTTOM_RATIO),
        )


# ========== 消息解析 ==========
def extract_messages(ocr_results):
    """从 OCR 结果中提取消息"""
    messages = []
    current_sender = None
    current_content = []

    for text, conf in ocr_results:
        text = text.strip()
        if not text:
            continue

        if "：" in text or ":" in text:
            if current_sender and current_content:
                messages.append({
                    "sender": current_sender,
                    "content": " ".join(current_content),
                })
            parts = text.split("：") if "：" in text else text.split(":")
            current_sender = parts[0].strip()
            current_content = [parts[1].strip()] if len(parts) > 1 else []
        else:
            if current_sender:
                current_content.append(text)

    if current_sender and current_content:
        messages.append({
            "sender": current_sender,
            "content": " ".join(current_content),
        })

    return messages


# ========== 消息去重 ==========
class MessageDeduplicator:
    def __init__(self, max_size=500):
        self.seen = set()
        self.max_size = max_size

    def is_new(self, sender, content):
        key = f"{sender}|||{content[:100]}"
        if key in self.seen:
            return False
        self.seen.add(key)
        if len(self.seen) > self.max_size:
            items = list(self.seen)
            self.seen = set(items[-self.max_size // 2:])
        return True


# ========== 命令监听 ==========
def watch_command_file():
    root = os.getcwd()
    command_file = os.path.join(root, ".tmp-userdata", "douyin-sidecar-command.json")
    result_file = os.path.join(root, ".tmp-userdata", "douyin-sidecar-command-result.json")

    while True:
        if os.path.exists(command_file):
            try:
                with open(command_file, "r", encoding="utf-8") as f:
                    cmd = json.load(f)
                os.remove(command_file)

                # TODO: 实现抖音飞鸽工作台的定位填入逻辑
                ok = False
                error = "抖音辅助回复定位功能开发中"

                result = {
                    "requestId": cmd.get("requestId"),
                    "ok": ok,
                    "error": error if not ok else None,
                }
                with open(result_file, "w", encoding="utf-8") as f:
                    json.dump(result, f, ensure_ascii=False)
            except Exception as e:
                print(f"[WARN] 命令处理失败: {e}")
        time.sleep(0.5)


# ========== 主循环 ==========
def main():
    print(f"[INFO] 抖音电商采集 Sidecar 启动，端口: {args.api_port}")

    cmd_thread = threading.Thread(target=watch_command_file, daemon=True)
    cmd_thread.start()

    dedup = MessageDeduplicator()
    start_time = time.time()
    last_health_time = 0
    scan_interval = 3

    while True:
        if DURATION_SEC and (time.time() - start_time) > DURATION_SEC:
            print("[INFO] 运行时长已到，退出")
            break

        try:
            windows = find_douyin_window()
            if not windows:
                time.sleep(scan_interval)
                continue

            hwnd, title, class_name, rect = windows[0]
            width = rect[2] - rect[0]
            height = rect[3] - rect[1]
            layout = DouyinLayoutParser(width, height)

            img = capture_window(hwnd)
            if not img:
                time.sleep(scan_interval)
                continue

            chat_region = layout.chat_region()
            chat_results = ocr_text(img, chat_region)
            messages = extract_messages(chat_results)

            for msg in messages:
                if not msg["content"]:
                    continue
                if not dedup.is_new(msg["sender"], msg["content"]):
                    continue

                print(f"[INFO] 新消息 - {msg['sender']}: {msg['content'][:50]}...")

                reply = get_reply(msg["sender"], msg["content"])
                if not reply:
                    continue

                if reply.get("mode") == "unattended" and reply.get("safeToAutoSend"):
                    print(f"[INFO] 无人值守发送回复: {reply['content'][:50]}...")

            now = time.time()
            if now - last_health_time > 5:
                send_health("running")
                last_health_time = now

        except Exception as e:
            print(f"[ERROR] 主循环异常: {e}", file=sys.stderr)
            send_health("degraded", str(e)[:500])

        time.sleep(scan_interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("[INFO] 收到退出信号")
    except Exception as e:
        print(f"[CRITICAL] 未捕获异常: {e}", file=sys.stderr)
        sys.exit(1)
