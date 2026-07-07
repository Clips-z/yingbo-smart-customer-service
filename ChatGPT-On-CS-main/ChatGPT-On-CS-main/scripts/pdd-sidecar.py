"""
拼多多商家工作台 - OCR 截屏采集 Sidecar
使用 PrintWindow + RapidOCR 方案，参考企微 sidecar 实现。
"""
import argparse
import json
import os
import sys
import time
import threading
from pathlib import Path
from datetime import datetime

# ========== 命令行参数 ==========
parser = argparse.ArgumentParser(description="拼多多商家工作台消息采集")
parser.add_argument("--backend", default="pdd", help="后端模式")
parser.add_argument("--duration", default="12h", help="运行时长")
parser.add_argument("--api-port", type=int, default=5555, help="API 端口")
args = parser.parse_args()

API_BASE = f"http://127.0.0.1:{args.api_port}"
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
    """发送 JSON POST 请求并解析响应"""
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        print(f"[WARN] HTTP 请求失败: {url} - {e}")
        return None


def send_health(state="running", error=None):
    """向 Node 后端上报健康状态"""
    payload = {"state": state}
    if error:
        payload["error"] = error
    post_json(f"{API_BASE}/api/v1/compat/pdd/health", payload)


def get_reply(friend, content):
    """向 Node 后端获取 AI 回复"""
    payload = {
        "platformId": "win_pdd",
        "platformName": "拼多多",
        "instanceId": "pdd-default",
        "sender": friend,
        "content": content,
        "ctx": {"CTX_USERNAME": friend, "CTX_PLATFORM": "拼多多", "CTX_APP_ID": "win_pdd"},
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
def find_pdd_window():
    """查找拼多多商家工作台窗口"""
    def callback(hwnd, windows):
        if win32gui.IsWindowVisible(hwnd):
            title = win32gui.GetWindowText(hwnd)
            class_name = win32gui.GetClassName(hwnd)
            # 拼多多商家工作台的窗口特征
            if ("拼多多" in title or "pdd" in class_name.lower() or "pinduoduo" in class_name.lower()):
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
    """通过 PrintWindow 截取窗口（后台截图，不干扰用户操作）"""
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

        # PW_RENDERFULLCONTENT = 2，尝试获取完整内容
        result = win32gui.PrintWindow(hwnd, save_dc.GetSafeHdc(), 2)
        if result != 1:
            # 回退到 PW_CLIENTONLY = 1
            win32gui.PrintWindow(hwnd, save_dc.GetSafeHdc(), 1)

        bmp_info = bitmap.GetInfo()
        bmp_bits = bitmap.GetBitmapBits(True)
        img = Image.frombuffer("RGB", (bmp_info["bmWidth"], bmp_info["bmHeight"]), bmp_bits, "raw", "BGRX", 0, 1)

        # 清理资源
        win32gui.DeleteObject(bitmap.GetHandle())
        save_dc.DeleteDC()
        mfc_dc.DeleteDC()
        win32gui.ReleaseDC(hwnd, hwnd_dc)

        return img
    except Exception as e:
        print(f"[WARN] 截图失败: {e}")
        return None


def ocr_text(img, region=None):
    """对图片（或区域）进行 OCR 识别，返回识别到的文本列表"""
    if region:
        img = img.crop(region)
    result, _ = ocr(img)
    if not result:
        return []
    return [(item[1], item[2]) for item in result]  # [(text, confidence), ...]


# ========== 布局解析 ==========
class PddLayoutParser:
    """
    拼多多商家工作台布局常量（基于窗口比例）
    需要根据实际窗口调整这些比例值
    """
    # 会话列表区域（左侧）
    CONV_LIST_LEFT_RATIO = 0.0
    CONV_LIST_RIGHT_RATIO = 0.25
    CONV_LIST_TOP_RATIO = 0.08
    CONV_LIST_BOTTOM_RATIO = 0.92

    # 聊天区域（右侧）
    CHAT_LEFT_RATIO = 0.26
    CHAT_RIGHT_RATIO = 1.0
    CHAT_TOP_RATIO = 0.08
    CHAT_BOTTOM_RATIO = 0.82

    # 输入框区域
    INPUT_TOP_RATIO = 0.83
    INPUT_BOTTOM_RATIO = 0.96

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
    """
    从 OCR 结果中提取消息。
    拼多多商家工作台的聊天消息格式通常为：
    [时间] 买家昵称：消息内容
    或
    买家昵称
    消息内容
    """
    messages = []
    current_sender = None
    current_content = []

    for text, conf in ocr_results:
        text = text.strip()
        if not text:
            continue

        # 检测是否是发送者行（含冒号、时间戳等特征）
        if "：" in text or ":" in text:
            if current_sender and current_content:
                messages.append({
                    "sender": current_sender,
                    "content": " ".join(current_content),
                })
            # 解析发送者
            parts = text.split("：") if "：" in text else text.split(":")
            current_sender = parts[0].strip()
            if len(parts) > 1:
                current_content = [parts[1].strip()]
            else:
                current_content = []
        else:
            if current_sender:
                current_content.append(text)

    # 最后一条消息
    if current_sender and current_content:
        messages.append({
            "sender": current_sender,
            "content": " ".join(current_content),
        })

    return messages


# ========== 消息去重 ==========
class MessageDeduplicator:
    """基于内容和发送者的消息去重"""
    def __init__(self, max_size=500):
        self.seen = set()
        self.max_size = max_size

    def is_new(self, sender, content):
        key = f"{sender}|||{content[:100]}"
        if key in self.seen:
            return False
        self.seen.add(key)
        if len(self.seen) > self.max_size:
            # 保留最近的一半
            items = list(self.seen)
            self.seen = set(items[-self.max_size // 2:])
        return True


# ========== 命令监听（辅助回复） ==========
def watch_command_file():
    """监听命令文件，处理辅助回复定位请求"""
    root = os.getcwd()
    command_file = os.path.join(root, ".tmp-userdata", "pdd-sidecar-command.json")
    result_file = os.path.join(root, ".tmp-userdata", "pdd-sidecar-command-result.json")

    while True:
        if os.path.exists(command_file):
            try:
                with open(command_file, "r", encoding="utf-8") as f:
                    cmd = json.load(f)
                os.remove(command_file)

                # 执行定位填入操作
                # TODO: 实现拼多多商家工作台的定位填入逻辑
                ok = False
                error = "拼多多辅助回复定位功能开发中"

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
def parse_duration(duration_str):
    """解析时长字符串，如 '12h', '30m', '600s'"""
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


def main():
    print(f"[INFO] 拼多多采集 Sidecar 启动，端口: {args.api_port}")

    # 启动命令监听线程（辅助回复）
    cmd_thread = threading.Thread(target=watch_command_file, daemon=True)
    cmd_thread.start()

    dedup = MessageDeduplicator()
    start_time = time.time()
    last_health_time = 0
    scan_interval = 3  # 扫描间隔（秒）

    while True:
        # 检查运行时长
        if DURATION_SEC and (time.time() - start_time) > DURATION_SEC:
            print("[INFO] 运行时长已到，退出")
            break

        try:
            # 查找拼多多窗口
            windows = find_pdd_window()
            if not windows:
                time.sleep(scan_interval)
                continue

            hwnd, title, class_name, rect = windows[0]
            width = rect[2] - rect[0]
            height = rect[3] - rect[1]
            layout = PddLayoutParser(width, height)

            # 截图
            img = capture_window(hwnd)
            if not img:
                time.sleep(scan_interval)
                continue

            # OCR 识别聊天区域
            chat_region = layout.chat_region()
            chat_results = ocr_text(img, chat_region)

            # 提取消息
            messages = extract_messages(chat_results)

            # 处理新消息
            for msg in messages:
                if not msg["content"]:
                    continue
                if not dedup.is_new(msg["sender"], msg["content"]):
                    continue

                print(f"[INFO] 新消息 - {msg['sender']}: {msg['content'][:50]}...")

                # 获取 AI 回复
                reply = get_reply(msg["sender"], msg["content"])
                if not reply:
                    continue

                # 无人值守模式自动发送
                if reply.get("mode") == "unattended" and reply.get("safeToAutoSend"):
                    print(f"[INFO] 无人值守发送回复: {reply['content'][:50]}...")
                    # TODO: 实现自动发送逻辑

            # 健康上报（每 5 秒）
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
