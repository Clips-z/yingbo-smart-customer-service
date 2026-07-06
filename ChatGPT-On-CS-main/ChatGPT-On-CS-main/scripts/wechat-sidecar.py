import argparse
import json
import logging
import os
import pyautogui
import re
import sys
import time
import unicodedata
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
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

    running = any(
        (process.info.get("name") or "").lower() == "wechat.exe"
        for process in psutil.process_iter(["name"])
    )
    if not running:
        executable = next((path for path in WECHAT39_CANDIDATES if path.exists()), None)
        if executable is None:
            searched = ", ".join(str(path) for path in WECHAT39_CANDIDATES)
            raise RuntimeError(f"Customer WeChat not found. Searched: {searched}")
        os.startfile(executable)
        time.sleep(5)


class ReplyBridge:
    def __init__(self, api_port: int, instance_id: str, dry_run: bool = False) -> None:
        self.url = f"http://127.0.0.1:{api_port}/api/v1/message/simulate"
        self.delivery_url = (
            f"http://127.0.0.1:{api_port}/api/v1/compat/wechat/suggestions/delivery"
        )
        self.health_url = f"http://127.0.0.1:{api_port}/api/v1/compat/wechat/health"
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


def run_weixin4(
    duration: str,
    max_pages: int,
    instance_id: str,
    api_port: int | None,
    dry_run: bool,
) -> None:
    from pyweixin import AutoReply, Navigator

    ensure_weixin_window()
    window = Navigator.open_weixin(is_maximize=False)
    logging.info(
        "Weixin window ready: title=%s class=%s",
        window.window_text(),
        window.class_name(),
    )

    port = api_port or discover_api_port()
    bridge = ReplyBridge(port, instance_id, dry_run=dry_run)

    def reply_when_unattended(friend: str, content: str) -> str:
        decision = bridge(friend, content)
        if (
            not decision
            or decision["mode"] != "unattended"
            or not decision["safeToAutoSend"]
        ):
            return ""
        return decision["content"]

    logging.info(
        "Sidecar started: api=http://127.0.0.1:%s duration=%s maxPages=%s dryRun=%s",
        port,
        duration,
        max_pages,
        dry_run,
    )
    details = AutoReply.auto_reply_messages(
        callback=reply_when_unattended,
        duration=duration,
        chatOnly=True,
        maxPages=max_pages,
        is_maximize=False,
        close_weixin=False,
    )
    logging.info("Sidecar finished: %s", details)


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
    import win32con
    import win32gui

    def get_window():
        handle = win32gui.FindWindow("WeChatMainWndForPC", None)
        if not handle:
            raise RuntimeError("WeChat main window was not found")
        return Desktop(backend="uia").window(handle=handle)

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
            exact.click_input()
            time.sleep(0.4)
            return verify_current_chat(target)
        raise RuntimeError(
            f"联系人“{target}”不在当前微信会话列表中，已停止操作"
        )

    def fill_contact(target: str, text: str) -> None:
        refresh_controls()
        bring_wechat_to_front()
        edit = select_contact(target)
        edit.set_focus()
        SystemSettings.copy_text_to_clipboard(text)
        pyautogui.hotkey("ctrl", "a", _pause=False)
        pyautogui.hotkey("ctrl", "v", _pause=False)

    def process_command() -> None:
        if not COMMAND_FILE.exists():
            return
        try:
            command = json.loads(COMMAND_FILE.read_text(encoding="utf-8"))
            COMMAND_FILE.unlink(missing_ok=True)
            request_id = str(command.get("requestId") or "")
            target = str(command.get("sender") or "").strip()
            text = str(command.get("content") or "").strip()
            if target:
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

    def send_reply(edit, text: str) -> None:
        edit.set_focus()
        SystemSettings.copy_text_to_clipboard(text)
        pyautogui.hotkey("ctrl", "a", _pause=False)
        pyautogui.hotkey("ctrl", "v", _pause=False)
        pyautogui.hotkey("alt", "s", _pause=False)

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
    last_health_at = 0.0
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
            unread_items = [
                item
                for item in conversation_list.children()
                if "条新消息" in item.window_text()
            ]
            for item in unread_items:
                text_nodes = item.descendants(control_type="Text")
                friend = text_nodes[0].window_text() if text_nodes else item.window_text()
                desktop_state = bring_wechat_to_front()
                decision = None
                try:
                    item.click_input()
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
                    send_reply(verified_chat, decision["content"])
                    bridge.report_delivery(decision.get("suggestionId"), "sent")
                except Exception as error:
                    if decision and decision.get("mode") == "unattended":
                        bridge.report_delivery(decision.get("suggestionId"), "failed")
                    bridge.report_health("running", str(error))
                    logging.exception("WeChat conversation verification failed: %s", friend)
                finally:
                    restore_desktop_state(desktop_state)
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
        choices=("wechat39", "weixin4"),
        default="wechat39",
    )
    args = parser.parse_args()

    configure_logging()
    try:
        if args.backend == "wechat39":
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
