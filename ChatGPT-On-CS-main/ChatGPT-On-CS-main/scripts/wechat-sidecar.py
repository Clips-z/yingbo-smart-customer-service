import argparse
import json
import logging
import os
import re
import site
import sys
import time
import unicodedata
from contextlib import contextmanager
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
WECHAT_PACKAGES = ROOT / "tools" / "wechat-py311"
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
site.addsitedir(str(WECHAT_PACKAGES))

import pyautogui

STARTUP_LOG = ROOT / ".tmp-userdata" / "logs" / "electron-startup.log"
SIDECAR_LOG = ROOT / ".tmp-userdata" / "logs" / "wechat-sidecar.log"
COMMAND_FILE = ROOT / ".tmp-userdata" / "wechat-sidecar-command.json"
COMMAND_RESULT_FILE = ROOT / ".tmp-userdata" / "wechat-sidecar-command-result.json"
VENDOR_DIR = ROOT / "scripts" / "vendor"
WECHAT39_CANDIDATES = (
    ROOT.parents[1] / "runtime" / "WeChat-3.9.11.25" / "WeChat.exe",
    ROOT.parent / "runtime" / "WeChat-3.9.11.25" / "WeChat.exe",
)


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


def post_json(url: str, payload: dict, timeout: int = 90) -> dict:
    request = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def ensure_weixin_window(timeout: int = 15) -> None:
    import psutil
    import win32gui

    def find_window() -> int:
        return win32gui.FindWindow("Qt51514QWindowIcon", "微信") or win32gui.FindWindow(
            "Qt51514QWindowIcon", "Weixin"
        )

    if find_window():
        return

    executable = None
    for process in psutil.process_iter(["name", "exe"]):
        if (process.info.get("name") or "").lower() == "weixin.exe":
            executable = process.info.get("exe")
            if executable:
                break
    if not executable:
        raise RuntimeError("Weixin.exe is not running")

    os.startfile(executable)
    deadline = time.time() + timeout
    while time.time() < deadline:
        if find_window():
            return
        time.sleep(0.5)
    raise RuntimeError("Weixin main window did not become available")


def parse_duration(value: str) -> float:
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(s|min|h)\s*", value)
    if not match:
        raise ValueError(f"Invalid duration: {value}")
    number = float(match.group(1))
    return number * {"s": 1, "min": 60, "h": 3600}[match.group(2)]


def normalize_contact_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value or "")
    return re.sub(r"[\s\u200b\ufe0f]+", "", normalized)


def ensure_wechat39_window() -> None:
    import psutil

    wechat_process_names = {"wechat.exe", "weixin.exe"}
    running = any(
        (process.info.get("name") or "").lower() in wechat_process_names
        for process in psutil.process_iter(["name"])
    )
    if not running:
        executable = next((path for path in WECHAT39_CANDIDATES if path.exists()), None)
        if executable is None:
            searched = ", ".join(str(path) for path in WECHAT39_CANDIDATES)
            raise RuntimeError(f"Customer WeChat not found. Searched: {searched}")
        os.startfile(executable)
        time.sleep(5)


def detect_backend() -> str:
    """Prefer the legacy 3.9 UIA backend when its real main window exists."""
    import psutil
    import win32gui

    if win32gui.FindWindow("WeChatMainWndForPC", None):
        return "wechat39"
    running = {
        (process.info.get("name") or "").lower()
        for process in psutil.process_iter(["name"])
    }
    if "wechat.exe" in running:
        return "wechat39"
    if "weixin.exe" in running:
        return "weixin4"
    # Keep the error specific to the modern backend when neither client runs.
    return "weixin4"


class ReplyBridge:
    def __init__(self, api_port: int, instance_id: str, dry_run: bool = False) -> None:
        self.url = f"http://127.0.0.1:{api_port}/api/v1/message/simulate"
        self.delivery_url = (
            f"http://127.0.0.1:{api_port}/api/v1/compat/wechat/suggestions/delivery"
        )
        self.health_url = f"http://127.0.0.1:{api_port}/api/v1/compat/wechat/health"
        self.context_url = f"http://127.0.0.1:{api_port}/api/v1/compat/wechat/context"
        self.instance_id = instance_id
        self.dry_run = dry_run

    def __call__(self, friend: str, content: str) -> dict | None:
        friend = friend.strip() or "微信用户"
        content = content.strip()
        if not content:
            logging.warning("Ignored empty message from %s", friend)
            return None
        if self.dry_run:
            logging.info("Dry run message from %s: %s", friend, content[:120])
            return None

        payload = {
            "platformId": "win_wechat",
            "platformName": "微信",
            "instanceId": self.instance_id,
            "sender": friend,
            "content": content,
            "ctx": {
                "CTX_USERNAME": friend,
                "CTX_PLATFORM": "微信",
                "CTX_HAS_NEW_MESSAGE": "true",
            },
        }

        try:
            result = post_json(self.url, payload)
            data = result.get("data", {})
            reply = data.get("reply", {})
            reply_type = reply.get("type")
            reply_content = str(reply.get("content") or "").strip()
            if reply_type == "NO_REPLY" or not reply_content:
                logging.info("No reply requested for %s", friend)
                return None
            mode = str(data.get("mode") or "hint")
            logging.info("Generated %s reply for %s: %s", mode, friend, reply_content[:120])
            return {
                "content": reply_content,
                "mode": mode,
                "suggestionId": data.get("suggestionId"),
                "safeToAutoSend": bool(reply.get("safeToAutoSend")),
            }
        except (HTTPError, URLError, TimeoutError, ValueError) as error:
            logging.exception("Local reply API failed for %s: %s", friend, error)
            return None

    def report_delivery(self, suggestion_id: int | None, status: str) -> None:
        if not suggestion_id:
            return
        try:
            post_json(
                self.delivery_url,
                {"id": suggestion_id, "status": status},
                timeout=5,
            )
        except (HTTPError, URLError, TimeoutError, ValueError) as error:
            logging.warning("Delivery acknowledgement failed: %s", error)

    def report_health(self, state: str = "running", error: str = "") -> None:
        try:
            post_json(
                self.health_url,
                {"state": state, "error": error[:500]},
                timeout=3,
            )
        except (HTTPError, URLError, TimeoutError, ValueError) as health_error:
            logging.warning("Health heartbeat failed: %s", health_error)

    def report_context(self, contact: str, messages: list[dict]) -> None:
        contact = str(contact or "").strip()
        if not contact:
            return
        recent = [item for item in messages[-3:] if str(item.get("content") or "").strip()]
        newest_incoming = next(
            (item["content"] for item in reversed(recent) if item.get("direction") == "incoming"),
            "",
        )
        try:
            post_json(
                self.context_url,
                {
                    "storeId": "win_wechat",
                    "accountId": self.instance_id,
                    "contactId": contact,
                    "chatFingerprint": f"win_wechat:{self.instance_id}:{contact}",
                    "recentMessages": recent,
                    "incomingMessageFingerprint": newest_incoming or None,
                    "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "confidence": 0.9,
                    "storeName": "微信",
                    "accountName": self.instance_id,
                },
                timeout=3,
            )
        except (HTTPError, URLError, TimeoutError, ValueError) as error:
            logging.debug("Context heartbeat failed: %s", error)


def run_weixin4(
    duration: str,
    max_pages: int,
    instance_id: str,
    api_port: int | None,
    dry_run: bool,
) -> None:
    import importlib.util

    ensure_weixin_window()
    module_path = ROOT / "scripts" / "wecom-sidecar.py"
    spec = importlib.util.spec_from_file_location("wecom_ocr_sidecar", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Weixin OCR sidecar module not found: {module_path}")
    wecom_ocr = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(wecom_ocr)

    wecom_ocr.SIDECAR_LOG = SIDECAR_LOG
    wecom_ocr.COMMAND_FILE = COMMAND_FILE
    wecom_ocr.COMMAND_RESULT_FILE = COMMAND_RESULT_FILE
    wecom_ocr.SCREENSHOT_DIR = ROOT / ".tmp-userdata" / "logs" / "wechat-screenshots"
    wecom_ocr.WECOM_WINDOW_CLASSES = ("Qt51514QWindowIcon", "WeChatMainWndForPC")
    wecom_ocr.WECOM_PROCESS_NAMES = ("weixin.exe", "wechat.exe")
    wecom_ocr.WECOM_WINDOW_TITLES = ("微信", "Weixin")
    wecom_ocr.PLATFORM_ID = "win_wechat"
    wecom_ocr.PLATFORM_NAME = "微信"
    wecom_ocr.COMPAT_KEY = "wechat"
    wecom_ocr.WINDOW_DISPLAY_NAME = "微信窗口"
    wecom_ocr.REQUIRE_UNREAD_TO_PROCESS = True
    wecom_ocr.PROCESS_CURRENT_CHAT_WITHOUT_UNREAD = True

    def _assume_message_module(_self, _img):
        return "消息"

    wecom_ocr.WeComLayoutParser.detect_current_module = _assume_message_module
    original_should_process = wecom_ocr.should_process_message

    def _should_process_wechat_message(conv: dict, my_name: str = ""):
        name = str(conv.get("name", "")).strip()
        preview = str(conv.get("preview", "")).strip()
        text = " ".join(
            [
                name,
                preview,
                *[str(item) for item in conv.get("raw_texts", [])],
            ]
        )
        blocked_keywords = (
            "通知",
            "公众号",
            "服务号",
            "订阅号",
            "服务通知",
            "微信公众平台",
            "微信团队",
            "视频号",
            "小程序",
            "小助手",
            "微信支付",
            "文件传输助手",
            "群发助手",
            "大家庭",
            "家族",
            "俱乐部",
            "战队",
            "淘宝",
            "闪购",
            "外卖",
            "省钱",
            "必领",
            "优惠",
            "政务",
            "市民中心",
            "基金",
            "收益",
            "机票",
            "KTV",
            "追剧",
            "活动",
            "招聘",
            "工作推",
            "直聘",
            "新闻",
            "热点",
            "推送",
        )
        if any(keyword in text for keyword in blocked_keywords):
            return False, "微信服务/公众号会话"
        normalized_name = normalize_contact_name(name)
        if len(normalized_name) > 12:
            return False, "微信会话名称过长，疑似服务号/群/营销会话"
        if re.search(r"[!！?？,，.。:：;；【】\[\]（）()《》<>]", name):
            return False, "微信会话名称含营销/系统标点"
        if re.match(r"^(昨天|前天|星期[一二三四五六日天]|周[一二三四五六日天]|\d{1,2}:\d{2})", preview):
            return False, "微信预览像时间/历史消息"
        if len(normalize_contact_name(preview)) < 2:
            return False, "微信预览过短"
        return original_should_process(conv, my_name)

    wecom_ocr.should_process_message = _should_process_wechat_message
    logging.info(
        "Weixin OCR sidecar started: duration=%s maxPages=%s dryRun=%s",
        duration,
        max_pages,
        dry_run,
    )
    wecom_ocr.run_wecom(
        duration,
        instance_id,
        api_port,
        dry_run,
        debounce_seconds=2.0,
        my_name="",
    )


def run_wechat39(
    duration: str,
    instance_id: str,
    api_port: int | None,
    dry_run: bool,
    debounce_seconds: float,
) -> None:
    sys.path.insert(0, str(VENDOR_DIR))
    from pywechat.Uielements import Main_window, SideBar
    from pywechat.WeChatTools import Tools
    from pywechat.WinSettings import SystemSettings
    from pywinauto import Desktop
    import win32api
    import win32con
    import win32gui

    def get_window():
        handle = win32gui.FindWindow("WeChatMainWndForPC", None)
        if not handle:
            raise RuntimeError("WeChat main window was not found")
        return Desktop(backend="uia").window(handle=handle)

    def post_control_click(control) -> None:
        rect = control.rectangle()
        screen_point = (
            (rect.left + rect.right) // 2,
            (rect.top + rect.bottom) // 2,
        )
        client_x, client_y = win32gui.ScreenToClient(window.handle, screen_point)
        lparam = win32api.MAKELONG(client_x, client_y)
        win32api.PostMessage(window.handle, win32con.WM_MOUSEMOVE, 0, lparam)
        win32api.PostMessage(
            window.handle, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, lparam
        )
        win32api.PostMessage(window.handle, win32con.WM_LBUTTONUP, 0, lparam)

    def select_contact(target: str):
        target_key = normalize_contact_name(target)
        conversation = window.child_window(**main_ui.ConversationList)
        exact = next(
            (
                item
                for item in conversation.children(control_type="ListItem")
                if normalize_contact_name(item.window_text()) == target_key
                or any(
                    normalize_contact_name(node.window_text()) == target_key
                    for node in item.descendants(control_type="Text")
                )
            ),
            None,
        )
        if exact is not None:
            post_control_click(exact)
            time.sleep(0.4)
            return verify_current_chat(target)
        raise RuntimeError(
            f"联系人“{target}”不在当前微信会话列表中，已停止操作"
        )

    def find_chat_input():
        refresh_controls()
        candidates = []
        for edit in window.descendants(control_type="Edit"):
            rect = edit.rectangle()
            if edit.window_text() == "搜索":
                continue
            if rect.width() >= 200 and rect.height() >= 40:
                candidates.append(edit)
        if len(candidates) != 1:
            raise RuntimeError(
                f"微信输入框定位失败：匹配到 {len(candidates)} 个候选控件"
            )
        return candidates[0]

    def find_send_button():
        buttons = [
            button
            for button in window.descendants(control_type="Button")
            if button.window_text() in ("发送(S)", "发送")
        ]
        if len(buttons) != 1:
            raise RuntimeError(
                f"微信发送按钮定位失败：匹配到 {len(buttons)} 个候选控件"
            )
        return buttons[0]

    @contextmanager
    def prevent_wechat_activation():
        """Keep UIA operations from stealing foreground or moving the cursor."""
        handle = window.handle
        foreground = win32gui.GetForegroundWindow()
        cursor = pyautogui.position()
        ex_style = win32gui.GetWindowLong(handle, win32con.GWL_EXSTYLE)
        flags = (
            win32con.SWP_NOMOVE
            | win32con.SWP_NOSIZE
            | win32con.SWP_NOZORDER
            | win32con.SWP_NOACTIVATE
            | win32con.SWP_FRAMECHANGED
        )
        try:
            win32gui.SetWindowLong(
                handle,
                win32con.GWL_EXSTYLE,
                ex_style | win32con.WS_EX_NOACTIVATE,
            )
            win32gui.SetWindowPos(handle, 0, 0, 0, 0, 0, flags)
            yield
        finally:
            if win32gui.IsWindow(handle):
                win32gui.SetWindowLong(handle, win32con.GWL_EXSTYLE, ex_style)
                win32gui.SetWindowPos(handle, 0, 0, 0, 0, 0, flags)
            try:
                pyautogui.moveTo(cursor.x, cursor.y, _pause=False)
            except Exception:
                pass
            if (
                foreground
                and foreground != handle
                and win32gui.IsWindow(foreground)
                and win32gui.GetForegroundWindow() != foreground
            ):
                try:
                    win32gui.SetForegroundWindow(foreground)
                except Exception:
                    pass

    def post_unicode_text(text: str) -> None:
        # WM_CHAR accepts UTF-16 code units; split non-BMP emoji into surrogates.
        encoded = text.encode("utf-16-le")
        for offset in range(0, len(encoded), 2):
            code_unit = int.from_bytes(encoded[offset : offset + 2], "little")
            win32api.PostMessage(window.handle, win32con.WM_CHAR, code_unit, 0)

    def clear_reply_text(edit) -> None:
        # The custom WeChat editor ignores ValuePattern and WM_CHAR backspace,
        # but handles background VK_BACK key messages.
        current = edit.get_value()
        for _ in range(max(len(current.encode("utf-16-le")) // 2 + 4, 8)):
            win32api.PostMessage(
                window.handle, win32con.WM_KEYDOWN, win32con.VK_BACK, 0
            )
            win32api.PostMessage(
                window.handle, win32con.WM_KEYUP, win32con.VK_BACK, 0
            )

    def set_reply_text(text: str):
        edit = find_chat_input()
        if edit.get_value():
            raise RuntimeError("微信输入框存在人工草稿，已停止自动发送")
        post_control_click(edit)
        post_unicode_text(text)
        time.sleep(0.2)
        actual = edit.get_value()
        if actual != text:
            clear_reply_text(edit)
            raise RuntimeError("微信回复填入校验失败，已停止发送")
        return edit

    def fill_contact(target: str, text: str) -> None:
        refresh_controls()
        with prevent_wechat_activation():
            select_contact(target)
            verify_current_chat(target)
            set_reply_text(text)

    def focus_contact(target: str) -> None:
        refresh_controls()
        select_contact(target)
        verify_current_chat(target)
        window.restore()
        window.set_focus()
        edit = find_chat_input()
        edit.click_input()
        time.sleep(0.2)

    def process_command() -> None:
        if not COMMAND_FILE.exists():
            return
        try:
            command = json.loads(COMMAND_FILE.read_text(encoding="utf-8"))
            COMMAND_FILE.unlink(missing_ok=True)
            request_id = str(command.get("requestId") or "")
            target = str(command.get("sender") or "").strip()
            text = str(command.get("content") or "").strip()
            focus_only = bool(command.get("focusOnly"))
            if target:
                if focus_only:
                    focus_contact(target)
                    logging.info("Focused WeChat contact input: %s", target)
                else:
                    fill_contact(target, text)
                    logging.info("Focused WeChat contact and filled reply: %s", target)
            COMMAND_RESULT_FILE.write_text(
                json.dumps({"requestId": request_id, "ok": True}),
                encoding="utf-8",
            )
        except Exception as error:
            logging.exception("Failed to process WeChat workbench command")
            COMMAND_RESULT_FILE.write_text(
                json.dumps(
                    {
                        "requestId": locals().get("request_id", ""),
                        "ok": False,
                        "error": str(error),
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

    def send_reply(target: str, text: str) -> None:
        verify_current_chat(target)
        edit = set_reply_text(text)
        post_control_click(find_send_button())
        deadline = time.time() + 4.0
        while time.time() < deadline:
            time.sleep(0.2)
            refresh_controls()
            if find_chat_input().get_value() == "":
                latest, _ = Tools.pull_latest_message(chat_list)
                if normalize_contact_name(latest) == normalize_contact_name(text):
                    logging.info("Verified unattended reply sent for %s", target)
                    return
        # Never report a successful delivery without both UI confirmations.
        if edit.get_value() == text:
            clear_reply_text(edit)
        raise RuntimeError("微信发送后校验失败，未确认消息进入聊天记录")

    from _retry_utils import wait_for_window

    ensure_wechat39_window()
    window = wait_for_window(get_window, window_name="微信窗口", max_wait=60, interval=2)
    sidebar = SideBar()
    main_ui = Main_window()
    conversation_list = window.child_window(**main_ui.ConversationList)
    chat_list = window.child_window(**main_ui.FriendChatList)
    current_chat = window.child_window(**main_ui.CurrentChatWindow)

    def refresh_controls() -> None:
        nonlocal window, conversation_list, chat_list, current_chat
        handle = win32gui.FindWindow("WeChatMainWndForPC", None)
        if not handle:
            raise RuntimeError("微信窗口不存在，请确认微信已登录")
        if not win32gui.IsWindow(window.handle) or window.handle != handle:
            window = Desktop(backend="uia").window(handle=handle)
        conversation_list = window.child_window(**main_ui.ConversationList)
        chat_list = window.child_window(**main_ui.FriendChatList)
        current_chat = window.child_window(**main_ui.CurrentChatWindow)

    def bring_wechat_to_front():
        refresh_controls()
        handle = window.handle
        state = {
            "minimized": bool(win32gui.IsIconic(handle)),
            "foreground": win32gui.GetForegroundWindow(),
            "cursor": pyautogui.position(),
        }
        win32gui.ShowWindow(handle, win32con.SW_RESTORE)
        time.sleep(0.2)
        try:
            win32gui.SetForegroundWindow(handle)
        except Exception:
            window.set_focus()
        return state

    def restore_desktop_state(state) -> None:
        try:
            pyautogui.moveTo(state["cursor"].x, state["cursor"].y, _pause=False)
        except Exception:
            pass
        previous = state.get("foreground")
        if previous and previous != window.handle and win32gui.IsWindow(previous):
            try:
                win32gui.SetForegroundWindow(previous)
            except Exception:
                pass
        if state.get("minimized"):
            win32gui.ShowWindow(window.handle, win32con.SW_MINIMIZE)

    def verify_current_chat(target: str):
        target_key = normalize_contact_name(target)
        for _ in range(10):
            refresh_controls()
            if current_chat.exists() and normalize_contact_name(
                current_chat.window_text()
            ) == target_key:
                return current_chat
            time.sleep(0.1)
        actual = current_chat.window_text() if current_chat.exists() else "未打开聊天"
        raise RuntimeError(
            f"联系人切换核对失败：目标是“{target}”，当前是“{actual}”，已停止操作"
        )

    port = api_port or discover_api_port()
    bridge = ReplyBridge(port, instance_id, dry_run=dry_run)
    deadline = time.time() + parse_duration(duration)
    seen: dict[tuple[str, str], float] = {}
    contact_history: dict[str, list[dict]] = {}
    last_health_at = 0.0
    system_conversation_keywords = (
        "腾讯新闻",
        "微信团队",
        "微信支付",
        "微信运动",
        "服务通知",
        "订阅号",
        "公众号",
        "文件传输助手",
    )
    logging.info(
        "WeChat 3.9 sidecar started: api=%s duration=%s dryRun=%s",
        port,
        duration,
        dry_run,
    )

    SystemSettings.open_listening_mode()
    bridge.report_health("running")
    try:
        while time.time() < deadline:
            now = time.time()
            if now - last_health_at >= 5:
                bridge.report_health("running")
                last_health_at = now
            seen = {
                fingerprint: seen_at
                for fingerprint, seen_at in seen.items()
                if now - seen_at < 300
            }
            refresh_controls()
            process_command()
            if current_chat.exists():
                selected = current_chat.window_text().strip()
                if selected and not any(keyword in selected for keyword in system_conversation_keywords):
                    latest, sender = Tools.pull_latest_message(chat_list)
                    if latest:
                        direction = (
                            "incoming"
                            if not sender or normalize_contact_name(sender) == normalize_contact_name(selected)
                            else "outgoing"
                        )
                        item = {"direction": direction, "content": latest}
                        history = contact_history.setdefault(selected, [])
                        if not history or history[-1] != item:
                            history.append(item)
                            del history[:-3]
                    bridge.report_context(selected, contact_history.get(selected, []))
            unread_items = [
                item
                for item in conversation_list.children()
                if "条新消息" in item.window_text()
            ]
            for item in unread_items:
                text_nodes = item.descendants(control_type="Text")
                friend = text_nodes[0].window_text() if text_nodes else item.window_text()
                if any(keyword in friend for keyword in system_conversation_keywords):
                    logging.info("Ignored WeChat system conversation: %s", friend)
                    continue
                decision = None
                try:
                    with prevent_wechat_activation():
                        post_control_click(item)
                        verified_chat = verify_current_chat(friend)
                        # Give customers a brief typing window so fragmented messages produce one reply.
                        time.sleep(max(debounce_seconds, 0.5))
                        refresh_controls()
                        verify_current_chat(friend)
                        content, sender = Tools.pull_latest_message(chat_list)
                        fingerprint = (friend, content)
                        if not content or now - seen.get(fingerprint, 0) < 30:
                            continue
                        if sender and normalize_contact_name(sender) != normalize_contact_name(friend):
                            logging.info("Ignored non-customer message in %s", friend)
                            continue
                        item = {"direction": "incoming", "content": content}
                        history = contact_history.setdefault(friend, [])
                        if not history or history[-1] != item:
                            history.append(item)
                            del history[:-3]
                        bridge.report_context(friend, history)
                        seen[fingerprint] = now
                        decision = bridge(friend, content)
                        if not decision:
                            continue
                        if decision["mode"] != "unattended":
                            logging.info("Reply retained in %s mode for %s", decision["mode"], friend)
                            continue
                        if not decision["safeToAutoSend"]:
                            logging.warning(
                                "Unsafe fallback reply retained for manual confirmation: %s",
                                friend,
                            )
                            continue
                        verify_current_chat(friend)
                        send_reply(friend, decision["content"])
                        bridge.report_delivery(decision.get("suggestionId"), "sent")
                except Exception as error:
                    if decision and decision.get("mode") == "unattended":
                        bridge.report_delivery(decision.get("suggestionId"), "failed")
                    bridge.report_health("running", str(error))
                    logging.exception("WeChat conversation verification failed: %s", friend)
            time.sleep(0.8)
    finally:
        SystemSettings.close_listening_mode()
        bridge.report_health("stopped")
    logging.info("WeChat 3.9 sidecar finished")


def main() -> int:
    parser = argparse.ArgumentParser(description="Weixin 4.x auto-reply sidecar")
    parser.add_argument("--duration", default="12h")
    parser.add_argument("--max-pages", type=int, default=0)
    parser.add_argument("--instance-id", default="12")
    parser.add_argument("--api-port", type=int)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--debounce-seconds", type=float, default=2.0)
    parser.add_argument(
        "--backend",
        choices=("auto", "wechat39", "weixin4"),
        default="auto",
    )
    args = parser.parse_args()

    configure_logging()
    try:
        backend = detect_backend() if args.backend == "auto" else args.backend
        logging.info("Selected WeChat backend: %s", backend)
        if backend == "wechat39":
            run_wechat39(
                args.duration,
                args.instance_id,
                args.api_port,
                args.dry_run,
                args.debounce_seconds,
            )
        else:
            run_weixin4(
                args.duration,
                args.max_pages,
                args.instance_id,
                args.api_port,
                args.dry_run,
            )
        return 0
    except KeyboardInterrupt:
        logging.info("Sidecar stopped")
        return 0
    except Exception:
        logging.exception("Sidecar crashed")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
