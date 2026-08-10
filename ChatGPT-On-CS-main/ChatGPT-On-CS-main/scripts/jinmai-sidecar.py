# -*- coding: utf-8 -*-
"""
京麦(JinMai) 自动回复 Sidecar — OCR 后台截屏版

基于企微 wecom-sidecar 的架构，适配京麦工作台的 UI 布局。
使用 PrintWindow 后台截图 + RapidOCR 识别，不操控鼠标。

启动方式（由 Electron 后端自动调用）：
  python jinmai-sidecar.py --backend jinmai --duration 12h --api-port XXXX
"""

import argparse
import ctypes
from ctypes import wintypes
import json
import logging
import os
import re
import sys
import time
import unicodedata
from pathlib import Path

# ---- 路径常量 ----
ROOT = Path(__file__).resolve().parents[1]
STARTUP_LOG = ROOT / ".tmp-userdata" / "logs" / "electron-startup.log"
SIDECAR_LOG = ROOT / ".tmp-userdata" / "logs" / "jinmai-sidecar.log"
COMMAND_FILE = ROOT / ".tmp-userdata" / "jinmai-sidecar-command.json"
COMMAND_RESULT_FILE = ROOT / ".tmp-userdata" / "jinmai-sidecar-command-result.json"

DEFAULT_INSTANCE_ID = "jinmai-default"
JINMAI_UI_NAMES = {
    "联系人",
    "列表分组开启",
    "列表分组关闭",
    "正在接待",
    "全部买家",
    "其他消息",
}


def configure_logging() -> None:
    SIDECAR_LOG.parent.mkdir(parents=True, exist_ok=True)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(SIDECAR_LOG, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )


def discover_api_port() -> int:
    if not STARTUP_LOG.exists():
        raise RuntimeError(f"Startup log not found: {STARTUP_LOG}")
    text = STARTUP_LOG.read_text(encoding="utf-8", errors="replace")
    ports = re.findall(r"Server is running on http://localhost:(\d+)", text)
    if not ports:
        raise RuntimeError("No local API port found in startup log")
    return int(ports[-1])


# ============================================================
# Windows API 工具函数
# ============================================================

user32 = ctypes.windll.user32


def find_jinmai_window_handle() -> int | None:
    """查找京麦主窗口句柄"""
    # 尝试多个可能的窗口类名和标题
    candidates = [
        ("Qt5QWindowIcon", "京麦"),
        ("Qt5QWindowIcon", "JinMai"),
        ("Qt5QWindowIcon", "京东商家工作台"),
        ("Chrome_WidgetWin_1", "京麦"),  # Electron 版本
        ("Chrome_WidgetWin_1", "京东"),   # Electron 版本
        ("QWidget", "京麦"),
        (None, "京麦工作台"),
        (None, "京东工作台"),
    ]
    for cls_name, title in candidates:
        h = user32.FindWindowW(cls_name or None, title)
        if h:
            return h

    # 宽泛搜索：兼容新版京麦“咚咚融合工作台”等动态账号标题。
    results = []

    def enum_cb(hwnd, _lparam):
        length = user32.GetWindowTextLengthW(hwnd)
        if length > 0:
            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buf, length + 1)
            title_str = buf.value
            if any(
                kw in title_str.lower()
                for kw in ["京麦", "jinmai", "京东工作台", "咚咚", "融合工作台"]
            ):
                results.append(hwnd)
        return True  # 继续枚举

    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    user32.EnumWindows(WNDENUMPROC(enum_cb), None)

    if results:
        # 返回最可能的主窗口（最大的那个）
        best = max(results, key=lambda h: _get_window_area(h))
        return best

    return None


def _get_window_area(handle) -> int:
    rect = wintypes.RECT()
    user32.GetWindowRect(handle, ctypes.byref(rect))
    return (rect.right - rect.left) * (rect.bottom - rect.top)


def get_window_rect(handle) -> tuple:
    rect = wintypes.RECT()
    user32.GetWindowRect(handle, ctypes.byref(rect))
    return (rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top)


def capture_window(handle) -> "Image.Image|None":
    """后台截图（不需要窗口在前台）"""
    try:
        from PIL import ImageGrab
    except ImportError:
        return None

    try:
        import win32gui
        import win32ui
        import win32con

        rect = get_window_rect(handle)
        w, h = rect[2], rect[3]
        if w < 100 or h < 100:
            return None

        hwndDC = win32gui.GetDC(handle)
        mfcDC = win32ui.CreateDCFromHandle(hwndDC)
        saveDC = mfcDC.CreateCompatibleDC()

        saveBitMap = win32ui.CreateBitmap()
        saveBitMap.CreateCompatibleBitmap(mfcDC, w, h)
        saveDC.SelectObject(saveBitMap)

        # PW_RENDERFULLCONTENT = 2 — 捕获非客户端区域和DWM合成内容
        result = win32gui.PrintWindow(handle, saveDC.GetSafeHdc(), 2)

        bmp_info = saveBitMap.GetInfo()
        bmp_data = saveBitMap.GetBitmapBits(True)
        img = Image.frombuffer(
            'RGB', (bmp_info['bmWidth'], bmp_info['bmHeight']),
            bmp_data, 'raw', 'BGRX', 0, 1,
        )

        # 清理 GDI 对象
        win32gui.DeleteObject(saveBitMap.GetHandle())
        saveDC.DeleteDC()
        mfcDC.DeleteDC()
        win32gui.ReleaseDC(handle, hwndDC)

        if result:
            return img
        else:
            return None
    except Exception:
        # 降级：尝试全屏截图然后裁剪
        try:
            import win32gui
            rect = get_window_rect(handle)
            screenshot = ImageGrab.grab(bbox=rect)
            return screenshot
        except Exception:
            return None


def post_click_background(handle, x, y):
    """PostMessage 后台点击（不移动鼠标）"""
    lparam = (y << 16) | (x & 0xFFFF)
    user32.PostMessageW(handle, 0x0201, 1, lparam)  # WM_LBUTTONDOWN
    time.sleep(0.05)
    user32.PostMessageW(handle, 0x0202, 0, lparam)  # WM_LBUTTONUP


def bring_to_front(handle):
    """将窗口带到前台"""
    try:
        import win32gui
        import win32con
        win32gui.ShowWindow(handle, win32con.SW_RESTORE)
        win32gui.SetForegroundWindow(handle)
    except Exception:
        pass


def save_desktop_state():
    """保存当前桌面状态（鼠标位置 + 前台窗口），用于操作后恢复"""
    try:
        import pyautogui
        cursor_pos = pyautogui.position()
    except Exception:
        cursor_pos = (0, 0)

    fg_hwnd = user32.GetForegroundWindow()
    fg_rect = ctypes.wintypes.RECT()
    user32.GetWindowRect(fg_hwnd, ctypes.byref(fg_rect))

    return {
        "cursor": cursor_pos,
        "fg_hwnd": fg_hwnd,
        "fg_rect": (fg_rect.left, fg_rect.top, fg_rect.right, fg_rect.bottom),
    }


def restore_desktop_state(state):
    """恢复桌面状态"""
    try:
        import win32gui
        import win32con
        # 恢复前台窗口
        if state.get("fg_hwnd") and state["fg_hwnd"]:
            try:
                win32gui.ShowWindow(state["fg_hwnd"], win32con.SW_RESTORE)
                win32gui.SetForegroundWindow(state["fg_hwnd"])
            except Exception:
                pass
    except Exception:
        pass
    # 恢复鼠标位置
    try:
        import pyautogui
        x, y = state.get("cursor", (0, 0))
        if x > 0 and y > 0:
            pyautogui.moveTo(x, y, duration=0)
    except Exception:
        pass


def copy_text_to_clipboard(text):
    """复制文本到剪贴板"""
    import subprocess
    p = subprocess.Popen(
        ['clip'], stdin=subprocess.PIPE, env=os.environ,
        creationflags=subprocess.CREATE_NO_WINDOW,
        close_fds=True,
    )
    p.communicate(input=(text or "").encode("utf-16"))


# ============================================================
# OCR 引擎
# ============================================================

class OcrEngine:
    def __init__(self):
        self._engine = None
        self._init_error = None

    def init(self) -> bool:
        if self._engine is not None:
            return True
        try:
            from rapidocr_onnxruntime import RapidOCR
            self._engine = RapidOCR()
            return True
        except ImportError:
            self._init_error = "rapidocr-onnxruntime 未安装"
            return False
        except Exception as e:
            self._init_error = str(e)
            return False

    def available(self) -> bool:
        return self.init()

    def recognize(self, image) -> list[dict]:
        """返回 [{text, score, x, y, w, h}]"""
        if not self.available():
            return []
        try:
            result = self._engine(image)
            if not result or len(result) < 1:
                return []
            ocr_results = result[0]  # [(box, text, score), ...]
            output = []
            for item in ocr_results:
                if len(item) >= 3:
                    box, text, score = item[0], item[1], item[2]
                    if isinstance(text, bytes):
                        text = text.decode("utf-8", errors="ignore")
                    if score and float(score) < 0.4:  # 置信度过滤
                        continue
                    x1 = min(p[0] for p in box)
                    y1 = min(p[1] for p in box)
                    x2 = max(p[0] for p in box)
                    y2 = max(p[1] for p in box)
                    output.append({
                        "text": str(text).strip(),
                        "score": float(score) if score else 0,
                        "x": int(x1),
                        "y": int(y1),
                        "w": int(x2 - x1),
                        "h": int(y2 - y1),
                    })
            return output
        except Exception as e:
            logging.warning("OCR error: %s", e)
            return []


# ============================================================
# 布局解析器 — 适配京麦 UI
# ============================================================

class JinMaiLayoutParser:
    """京麦工作台布局解析器"""

    # 布局比例（相对于窗口尺寸）
    NAV_WIDTH_RATIO = 0.08          # 左侧导航栏宽度占比
    CONV_LIST_WIDTH_RATIO = 0.25    # 会话列表宽度占比
    HEADER_HEIGHT_PX = 50           # 顶部标题栏高度
    INPUT_HEIGHT_PX = 60            # 底部输入框区域高度

    # 时间格式
    TIME_PATTERN = re.compile(
        r'^(\d{1,2}:\d{2}|\d{1,2}/\d{1,2}|刚刚|\d+\s*分钟前|\d+\s*小时前|昨天|前天)$'
    )
    UNREAD_PATTERN = re.compile(r'^\[(\d+)条?\]')
    UNREAD_BADGE_PATTERN = re.compile(r'^(\d+)\s*$')

    def __init__(self, ocr: OcrEngine):
        self.ocr = ocr
        self.window_rect = (0, 0, 0, 0)
        self._screenshot_count = 0

    def capture_and_parse(self, handle: int) -> dict:
        img = capture_window(handle)
        if img is None:
            return {"ok": False, "error": "截图失败"}

        w, h = img.size
        win_x, win_y = get_window_rect(handle)[:2]
        self.window_rect = (win_x, win_y, w, h)

        nav_w = int(w * self.NAV_WIDTH_RATIO)
        conv_w = int(w * self.CONV_LIST_WIDTH_RATIO)

        result = {
            "ok": True,
            "window_size": (w, h),
            "window_pos": (win_x, win_y),
            "nav_width": nav_w,
            "conv_list_x": nav_w,
            "conv_list_width": conv_w,
            "chat_area_x": nav_w + conv_w,
            "chat_area_width": w - nav_w - conv_w,
            "header_height": self.HEADER_HEIGHT_PX,
            "input_height": self.INPUT_HEIGHT_PX,
            "conversations": [],
            "chat_messages": [],
        }

        # OCR 截取会话列表区域
        conv_region = img.crop((nav_w, self.HEADER_HEIGHT_PX, nav_w + conv_w, h - self.INPUT_HEIGHT_PX))
        result["conversations"] = self._parse_conversation_list(conv_region, nav_w, self.HEADER_HEIGHT_PX, win_x, win_y)

        # OCR 截取聊天区域
        chat_region = img.crop((nav_w + conv_w, self.HEADER_HEIGHT_PX, w, h - self.INPUT_HEIGHT_PX))
        result["chat_messages"] = self._parse_chat_messages(chat_region)

        self._screenshot_count += 1
        return result

    def _group_lines_by_y(self, lines, gap_y=20) -> list[dict]:
        """按 Y 坐标分组相邻的 OCR 行"""
        if not lines:
            return []

        sorted_lines = sorted(lines, key=lambda l: l["y"])
        groups = []
        current_group = [sorted_lines[0]]
        current_bottom = sorted_lines[0]["y"] + sorted_lines[0]["h"]

        for line in sorted_lines[1:]:
            if line["y"] <= current_bottom + gap_y:
                current_group.append(line)
                current_bottom = max(current_bottom, line["y"] + line["h"])
            else:
                groups.append(current_group)
                current_group = [line]
                current_bottom = line["y"] + line["h"]
        groups.append(current_group)

        items = []
        for group in groups:
            min_y = min(l["y"] for l in group)
            max_y = max(l["y"] + l["h"] for l in group)
            min_x = min(l["x"] for l in group)
            max_x = max(l["x"] + l["w"] for l in group)
            items.append({
                "lines": group,
                "x": min_x, "y": min_y,
                "w": max(max_x - min_x, 10),
                "h": max(max_y - min_y, 8),
            })
        return items

    def _parse_conversation_list(self, img, offset_x, offset_y, win_x, win_y) -> list[dict]:
        """解析会话列表"""
        conversations = []
        if not self.ocr.available():
            return conversations

        lines = self.ocr.recognize(img)
        if not lines:
            return conversations

        items = self._group_lines_by_y(lines, gap_y=22)

        for item in items:
            texts = [l["text"] for l in item["lines"]]
            full_text = " ".join(texts).strip()

            if len(full_text) < 2:
                continue
            if self.TIME_PATTERN.match(full_text):
                continue

            name = ""
            preview = ""
            timestamp = ""
            unread_count = 0

            for t in texts:
                t = t.strip()
                if self.TIME_PATTERN.match(t):
                    timestamp = t
                elif self.UNREAD_PATTERN.search(t):
                    m = self.UNREAD_PATTERN.search(t)
                    unread_count = int(m.group(1))
                    remaining = self.UNREAD_PATTERN.sub("", t).strip()
                    if remaining and not preview:
                        preview = remaining
                elif self.UNREAD_BADGE_PATTERN.match(t) and not name:
                    m2 = self.UNREAD_BADGE_PATTERN.match(t)
                    if m2:
                        unread_count = int(m2.group(1))
                elif len(t) >= 3 and not name:
                    name = t
                elif t and not preview:
                    preview = t

            # 过滤：名称太短或像系统项
            if len(name) < 2:
                continue
            skip_names = {"消息", "全部消息", "待回复", "已回复", "系统通知",
                          "订单", "商品", "客户", "数据", "营销"}
            if name in skip_names:
                continue

            center_y = item["y"] + item["h"] // 2
            screen_click_x = win_x + offset_x + item["x"] + item["w"] // 2
            screen_click_y = win_y + offset_y + center_y

            conversations.append({
                "name": name,
                "preview": preview,
                "time": timestamp,
                "unread": unread_count,
                "click_x": screen_click_x,
                "click_y": screen_click_y,
                "raw_texts": texts,
                "y_center": center_y,
            })

        return conversations

    def _parse_chat_messages(self, img) -> list[str]:
        """解析聊天区域的最新消息"""
        if not self.ocr.available():
            return []

        lines = self.ocr.recognize(img)
        if not lines:
            return []

        # 只取下半部分（最新消息通常在底部）
        h = img.size[1]
        recent_lines = [l for l in lines if l["y"] > h * 0.35]

        messages = []
        for line in sorted(recent_lines, key=lambda l: l["y"], reverse=True):
            text = line["text"].strip()
            if len(text) >= 3 and not self.TIME_PATTERN.match(text):
                messages.append(text)
                if len(messages) >= 5:
                    break

        return messages


# ============================================================
# 回复桥接
# ============================================================

class ReplyBridge:
    def __init__(self, api_port: int, instance_id: str, dry_run: bool = False):
        from urllib.request import Request, urlopen

        self.Request = Request
        self.urlopen = urlopen
        self.api_port = api_port
        self.instance_id = instance_id
        self.dry_run = dry_run
        self.url = f"http://127.0.0.1:{api_port}/api/v1/message/simulate"
        self.delivery_url = (
            f"http://127.0.0.1:{api_port}/api/v1/compat/jinmai/suggestions/delivery"
        )

    def __call__(self, sender: str, content: str) -> dict | None:
        sender = sender.strip() or "京麦用户"
        content = content.strip()
        if not content:
            return None
        if self.dry_run:
            logging.info("Dry run message from %s: %s", sender, content[:120])
            return None

        payload = json.dumps({
            "platformId": "win_jinmai",
            "platformName": "京麦",
            "instanceId": self.instance_id,
            "sender": sender,
            "content": content,
            "ctx": {
                "CTX_USERNAME": sender,
                "CTX_PLATFORM": "京麦",
                "CTX_HAS_NEW_MESSAGE": "true",
            },
        }, ensure_ascii=False).encode("utf-8")

        req = self.Request(self.url, data=payload, headers={
            "Content-Type": "application/json; charset=utf-8",
        }, method="POST")

        try:
            resp = self.urlopen(req, timeout=90)
            data = json.loads(resp.read().decode("utf-8")).get("data", {})
            reply = data.get("reply", {})
            reply_text = reply.get("text", "")
            if reply_text:
                self._deliver(sender, content, reply_text, data)
            return data
        except Exception as e:
            logging.warning("API call failed for %s: %s", sender, e)
            return None

    def _deliver(self, sender, msg, reply_text, api_data):
        payload = json.dumps({
            "sender": sender,
            "content": msg,
            "replyText": reply_text,
            "platformId": "win_jinmai",
            "instanceId": self.instance_id,
        }, ensure_ascii=False).encode("utf-8")

        req = self.Request(self.delivery_url, data=payload, headers={
            "Content-Type": "application/json; charset=utf-8",
        }, method="POST")
        try:
            self.urlopen(req, timeout=30)
        except Exception as e:
            logging.warning("Delivery failed: %s", e)

    def report_health(self, state, error=None):
        """健康上报 — 通知后端当前 sidecar 状态"""
        health_url = f"http://127.0.0.1:{self.api_port}/api/v1/compat/jinmai/health"
        payload = json.dumps({"state": state, "error": error or "", "ts": time.time()}).encode()
        try:
            req = self.Request(health_url, data=payload, method="POST")
            req.add_header("Content-Type", "application/json")
            self.urlopen(req, timeout=10)
        except Exception as e:
            logging.debug("Health report failed: %s", e)


# ============================================================
# 主逻辑
# ============================================================

def find_latest_customer_msg(chat_msgs, current_name) -> str | None:
    """从聊天区OCR结果中找到最新的客户消息"""
    if not chat_msgs:
        return None
    # 过滤掉系统文本和时间
    for msg in reversed(chat_msgs):
        if len(msg) >= 3 and not re.match(r'^(\d{1,2}:|\d{1,2}/)', msg):
            return msg
    return None


def _handle_message(name, msg_content, bridge, handle, parser, debounce_seconds, click_x=None, click_y=None):
    """处理单条消息：调用 API 获取 AI 回复"""
    mode = os.environ.get("JINMAI_REPLY_MODE", "hint").lower()
    logging.info("New message from %s (private): %s", name, msg_content[:80])
    try:
        result = bridge(name, msg_content)
        if result is None:
            return

        reply_text = ""
        data_reply = result.get("reply", {})
        if isinstance(data_reply, dict):
            reply_text = data_reply.get("text", "") or data_reply.get("reply", "")

        if reply_text:
            if mode == "hint":
                logging.info("Reply [hint] for %s: %s", name, reply_text[:80])
                logging.info("Hint mode: suggestion created for %s", name)
            elif mode == "assist":
                logging.info("Reply [assist] for %s: %s", name, reply_text[:80])
                logging.info("Assist mode: suggestion pending for %s", name)
            elif mode == "unattended":
                logging.info("Reply [unattended] for %s: %s", name, reply_text[:80])
                # TODO: unattended 模式下自动填入并发送
    except Exception as e:
        logging.error("Failed to handle message from %s: %s", name, e)


def process_command(parser, handle):
    """处理来自工作台的定位填入命令（辅助回复模式）"""
    if not COMMAND_FILE.exists():
        return
    try:
        command = json.loads(COMMAND_FILE.read_text(encoding="utf-8"))
        COMMAND_FILE.unlink(missing_ok=True)
        request_id = str(command.get("requestId") or "")
        target = str(command.get("sender") or "").strip()
        text = str(command.get("content") or "").strip()
        focus_only = bool(command.get("focusOnly"))

        if target and (text or focus_only):
            handle = find_jinmai_window_handle()
            if handle:
                layout = parser.capture_and_parse(handle)
                conv = find_conv_by_name(layout.get("conversations", []), target)
                if conv:
                    desktop_state = None if focus_only else save_desktop_state()
                    bring_to_front(handle)
                    time.sleep(0.2)
                    post_click_background(handle, conv["click_x"], conv["click_y"])
                    time.sleep(0.6)
                    import pyautogui
                    x, y, width, height = get_window_rect(handle)
                    pyautogui.click(
                        x + int(width * 0.65),
                        y + height - 45,
                        _pause=False,
                    )
                    time.sleep(0.2)
                    if focus_only:
                        COMMAND_RESULT_FILE.write_text(
                            json.dumps({"requestId": request_id, "ok": True}),
                            encoding="utf-8",
                        )
                        logging.info("Focused input for: %s", target)
                        return
                    try:
                        copy_text_to_clipboard(text)
                        time.sleep(0.1)
                        pyautogui.hotkey("ctrl", "a", _pause=False)
                        time.sleep(0.05)
                        pyautogui.hotkey("ctrl", "v", _pause=False)
                        COMMAND_RESULT_FILE.write_text(
                            json.dumps({"requestId": request_id, "ok": True}),
                            encoding="utf-8",
                        )
                        logging.info("Filled reply for: %s", target)
                        return
                    finally:
                        if desktop_state is not None:
                            restore_desktop_state(desktop_state)

        COMMAND_RESULT_FILE.write_text(
            json.dumps({"requestId": request_id, "ok": False, "error": "未找到联系人"}),
            encoding="utf-8",
        )
    except Exception as error:
        logging.exception("Command process failed")
        COMMAND_RESULT_FILE.write_text(
            json.dumps(
                {"requestId": locals().get("request_id", ""), "ok": False, "error": str(error)},
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )


def find_conv_by_name(conversations, name):
    key = unicodedata.normalize("NFKC", name or "").replace(" ", "")
    for conv in conversations:
        if unicodedata.normalize("NFKC", conv.get("name", "")).replace(" ", "") == key:
            return conv
        for t in conv.get("raw_texts", []):
            if unicodedata.normalize("NFKC", t).replace(" ", "") == key:
                return conv
    for conv in conversations:
        if key in unicodedata.normalize("NFKC", conv.get("name", "")).replace(" ", ""):
            return conv
    return None


def parse_duration(value: str) -> float:
    match = re.fullmatch(r"\s*(\d+(?:.\d+)?)\s*(s|min|h)\s*", value)
    if not match:
        raise ValueError(f"Invalid duration: {value}")
    number = float(match.group(1))
    return number * {"s": 1, "min": 60, "h": 3600}[match.group(2)]


def run_jinmai(duration, instance_id, api_port, dry_run, debounce_seconds):
    """京麦自动回复主循环"""
    def wait_for_window(finder, *args, **kwargs):
        timeout = float(kwargs.get("timeout", kwargs.get("timeout_seconds", 30.0)))
        interval = float(kwargs.get("interval", kwargs.get("poll_interval", 0.5)))
        deadline = time.monotonic() + timeout
        while True:
            found = finder()
            if found:
                return found
            if time.monotonic() >= deadline:
                return None
            time.sleep(interval)

    handle = wait_for_window(
        find_jinmai_window_handle,
        window_name="京麦窗口",
        max_wait=60,
        interval=2,
    )

    rect = get_window_rect(handle)
    logging.info("JinMai window: handle=%d size=%dx%d pos=(%d,%d)",
                 handle, rect[2], rect[3], rect[0], rect[1])

    port = api_port or discover_api_port()
    bridge = ReplyBridge(port, instance_id, dry_run=dry_run)
    ocr = OcrEngine()
    parser = JinMaiLayoutParser(ocr)
    deadline = time.time() + parse_duration(duration)

    seen = {}  # 去重表
    last_health_at = 0.0
    conversation_baselines = {}
    conversation_baselines_initialized = False
    current_chat_baseline = None

    logging.info("JinMai OCR sidecar started: port=%s ocr=%s dryRun=%s",
                 port, ocr.available(), dry_run)

    try:
        while time.time() < deadline:
            try:
                now = time.time()

                if now - last_health_at >= 10:
                    last_health_at = now

                seen = {k: v for k, v in seen.items() if now - v < 300}

                handle = find_jinmai_window_handle()
                if not handle:
                    time.sleep(3.0)
                    continue

                # 处理命令文件
                process_command(parser, handle)

                # 截图 + OCR 解析
                layout = parser.capture_and_parse(handle)
                if not layout.get("ok"):
                    time.sleep(2.0)
                    continue

                convs = layout["conversations"]

                # 过滤有效会话
                filtered = [
                    c for c in convs
                    if c.get("name")
                    and c.get("name") not in JINMAI_UI_NAMES
                    and not str(c.get("preview", "")).startswith("正在接待")
                ]

                changed_convs = []
                for conv in filtered:
                    name = str(conv.get("name", "")).strip()
                    preview = str(conv.get("preview", "")).strip()
                    state = (preview, int(conv.get("unread", 0)))
                    previous = conversation_baselines.get(name)
                    conversation_baselines[name] = state
                    if previous is None:
                        continue
                    if preview != previous[0] or previous[1] <= 0 < state[1]:
                        changed_convs.append(conv)

                if not conversation_baselines_initialized:
                    conversation_baselines_initialized = True
                    logging.info(
                        "Conversation baseline initialized: %d conversations; existing messages ignored",
                        len(conversation_baselines),
                    )
                    time.sleep(2.0)
                    continue

                # 检测有未读消息的会话
                unread_convs = [
                    c for c in changed_convs
                    if c.get("unread", 0) > 0
                    and now - seen.get(("__unread__", c.get("name", "")), 0) >= 180
                ]

                # 检测预览变化的新消息
                new_message_convs = []
                DRAFT_PREFIXES = ("[草稿]", "[已发送]", "[发送失败]", "[Draft]")
                for conv in changed_convs:
                    name = conv.get("name", "")
                    preview = conv.get("preview", "")
                    if not preview:
                        continue
                    if any(preview.startswith(dp) for dp in DRAFT_PREFIXES):
                        continue
                    fingerprint = (name, preview)
                    if now - seen.get(fingerprint, 0) < 180:
                        continue
                    new_message_convs.append(conv)

                target_convs = []
                seen_names = set()
                for conv in unread_convs + new_message_convs:
                    n = conv.get("name", "")
                    if n and n not in seen_names:
                        target_convs.append(conv)
                        seen_names.add(n)

                if not target_convs:
                    # 无新消息时检查当前打开会话
                    chat_msgs = layout.get("chat_messages", [])
                    if chat_msgs:
                        latest_msg = find_latest_customer_msg(chat_msgs, "")
                        if latest_msg and len(latest_msg) >= 3:
                            if current_chat_baseline is None:
                                current_chat_baseline = latest_msg
                                logging.info("Current chat baseline initialized")
                                time.sleep(2.0)
                                continue
                            if latest_msg == current_chat_baseline:
                                time.sleep(2.0)
                                continue
                            current_chat_baseline = latest_msg
                            fp = ("__current__", latest_msg)
                            if now - seen.get(fp, 0) >= 180:
                                seen[fp] = now
                                _handle_message("京麦客户", latest_msg, bridge, handle, parser, debounce_seconds)
                    time.sleep(2.0)
                    continue

                for conv in target_convs[:5]:
                    name = conv.get("name", "")
                    preview = conv.get("preview", "")

                    msg_content = re.sub(r'^\[\d+条?\]', "", preview).strip()
                    if not msg_content or len(msg_content) < 2:
                        continue
                    if len(msg_content) < 4:
                        if not re.search(r'[\u4e00-\u9fff]{2,}', msg_content):
                            continue

                    msg_fp = (name, msg_content)
                    if now - seen.get(msg_fp, 0) < 180:
                        continue
                    seen[msg_fp] = now
                    seen[("__unread__", name)] = now

                    logging.info("New message from %s (unread=%d): %s",
                                 name, conv.get("unread", 0), msg_content[:60])

                    _handle_message(
                        name, msg_content, bridge, handle, parser,
                        debounce_seconds,
                        conv.get("click_x"), conv.get("click_y"),
                    )

                time.sleep(1.5)
            except Exception as loop_err:
                logging.warning("Loop iteration error: %s", loop_err)
                time.sleep(3.0)
    except KeyboardInterrupt:
        logging.info("Stopped by user")


def main() -> int:
    parser = argparse.ArgumentParser(description="JinMai OCR auto-reply sidecar")
    parser.add_argument("--duration", default="12h")
    parser.add_argument("--instance-id", default=DEFAULT_INSTANCE_ID)
    parser.add_argument("--api-port", type=int)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--backend", choices=("jinmai",), default="jinmai")
    args = parser.parse_args()

    configure_logging()
    try:
        run_jinmai(args.duration, args.instance_id, args.api_port,
                   args.dry_run, 2.0)
        return 0
    except KeyboardInterrupt:
        return 0
    except SystemExit:
        raise
    except Exception:
        logging.exception("Crashed")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
