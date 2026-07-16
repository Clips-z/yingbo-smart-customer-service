#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
企业微信(WeCom/WXWork) 自动回复 Sidecar — OCR 后台截屏版

企业微信使用自绘渲染引擎（CEF/DirectX），UIA 控件树为空，
pywinauto 无法操作。本脚本采用「后台截图 + OCR + PostMessage后台点击」方案，
不操控鼠标、不影响用户操作：

1. PrintWindow API 后台截取企微窗口图像（不需要窗口在前台）
2. RapidOCR 识别文字 → 解析会话列表、聊天内容
3. PostMessage 后台点击切换会话（不移动鼠标）
4. 仅在无人值守模式发送回复时，才短暂前台操作（保存/恢复桌面状态）

用法:
  python wecom-sidecar.py --api-port <port> --duration 12h --backend wecom [--dry-run]
"""

import argparse
import json
import logging
import os
import re
import site
import sys
import time
import unicodedata
import threading
from contextlib import redirect_stdout
from pathlib import Path
from ctypes import windll
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
site.addsitedir(str(ROOT / "tools" / "wechat-py311"))
site.addsitedir(str(ROOT / "tools" / "rapidocr-py311"))

import numpy as np
import win32api
import win32gui
import win32ui
import win32con
from PIL import Image, ImageGrab

# 尝试导入 RapidOCR
try:
    from rapidocr_onnxruntime import RapidOCR
    HAS_OCR = True
except ImportError:
    HAS_OCR = False
    logging.warning("RapidOCR 未安装，将使用简化模式")

# 尝试导入 pyautogui（仅发送回复时需要）
try:
    import pyautogui
    HAS_PYAUTOGUI = True
except ImportError:
    HAS_PYAUTOGUI = False

# ============================================================
# 路径常量
# ============================================================
STARTUP_LOG = ROOT / ".tmp-userdata" / "logs" / "electron-startup.log"
SIDECAR_LOG = ROOT / ".tmp-userdata" / "logs" / "wecom-sidecar.log"
COMMAND_FILE = ROOT / ".tmp-userdata" / "wecom-sidecar-command.json"
COMMAND_RESULT_FILE = ROOT / ".tmp-userdata" / "wecom-sidecar-command-result.json"
SCREENSHOT_DIR = ROOT / ".tmp-userdata" / "logs" / "wecom-screenshots"

WECOM_WINDOW_CLASSES = ("WeWorkWindow", "WeWorkMainWndForPC")
WECOM_PROCESS_NAMES = ("wxwork.exe", "wecom.exe")
WECOM_WINDOW_TITLES = ()
PLATFORM_ID = "win_wecom"
PLATFORM_NAME = "企微"
COMPAT_KEY = "wecom"
WINDOW_DISPLAY_NAME = "企业微信窗口"
# The currently selected conversation is marked read by WeCom even while its
# window is minimized.  Preview changes therefore have to remain eligible when
# unread == 0; persisted baselines and outgoing-prefix checks prevent replay.
REQUIRE_UNREAD_TO_PROCESS = False
PROCESS_CURRENT_CHAT_WITHOUT_UNREAD = True
DEFAULT_INSTANCE_ID = "12"

# ============================================================
# 布局常量
# ============================================================
# Enterprise WeChat 4.x uses a two-column left rail.  The module rail is
# roughly 14% wide and the conversation list roughly 30% wide at the
# supported 1146x770 layout.  The old 9% boundary cut through the module
# names and made the collector report an empty conversation baseline.
NAV_WIDTH_RATIO = 0.14
CONV_LIST_WIDTH_RATIO = 0.30
HEADER_HEIGHT_PX = 75
INPUT_HEIGHT_PX = 90
TIME_PATTERN = re.compile(r"^\d{1,2}:\d{2}$")
UNREAD_PATTERN = re.compile(r"\[(\d+)条\]")
UNREAD_BADGE_PATTERN = re.compile(r"^\[(\d+)\]$")  # 红点数字

# ---- 消息过滤：只处理私聊或@我的消息 ----
# 群聊特征：名称含 &、【】、群、组、团队 等
GROUP_INDICATOR_PATTERN = re.compile(
    r"[&+＋【】]|群|团队|team|组|项目组|部门|工作群|通知群|交流群|讨论群|沟通群|大家庭|家族|俱乐部|战队",
    re.IGNORECASE,
)
# @我 的检测模式：企微中有人@我时会显示这些文字
AT_ME_PATTERNS = [
    re.compile(r"有人@我"),
    re.compile(r"\[有人@我\]"),
    re.compile(r"@我\b"),
    re.compile(r"@all", re.IGNORECASE),
]

# ---- 非联系人 / UI 元素 / 系统项 排除规则 ----
# 导航栏和功能入口（这些不是聊天对象）
NAVIGATION_ITEMS = {
    "消息", "邮件", "文档", "日程", "通讯录", "工作台",
    "收件箱", "草稿箱", "已发送", "已删除", "垃圾邮件",
    "我的文件夹", "星标邮件", "标签", "发件箱",
    "视频会议", "日历", "收藏", "电脑", "手机", "微信",
    "文件", "帮助与反馈", "设置", "添加",
    "待办", "会议", "智能文档", "智能总结", "高效功能",
    "分组", "未读", "单聊", "群聊", "内部聊天", "外部聊天",
    "标记", "全部", "收藏", "稍后办", "已办",
}
# 纯数字或极短文本（OCR 噪声）
NOISE_PATTERNS = [
    re.compile(r"^\d{1,2}$"),           # 纯数字（1-2位，可能是未读数）
    re.compile(r"^\d{1,2}:\d{2}$"),     # 时间格式已在其他地方过滤，双重保险
    re.compile(r"^[\s\-_~!@#$%^*+=\\|<>/?`.;:,\(\)\[\]{}\"']+$"),  # 纯符号
    re.compile(r"^[a-zA-Z]$"),           # 单个字母
]
# 邮件相关关键词（标题/内容中出现即判定为邮件页内容）
EMAIL_KEYWORDS = {
    "邮件", "邮箱", "mail", "抄送", "密送", "附件", "主题",
    "收件人", "发件人", "收件箱", "草稿箱", "已发送", "已删除",
    "垃圾邮件", "星标邮件", "新建邮件", "回复全部", "转发到聊天",
    "转发", "我的文件夹", "智能翻译",
}
# 邮件地址模式 — 任何含 @domain 的文本都是邮件
EMAIL_ADDR_PATTERN = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
)
# 已知的非联系人组织名/服务名（出现在企微邮件中的常见发件人）
KNOWN_ORG_NAMES = {
    "openai", "chatgpt", "fastgpt", "nvidia", "microsoft", "google",
    "apple", "amazon", "meta", "telegram", "discord", "slack",
    "notion", "figma", "github", "gitlab", "docker", "vercel",
    "stripe", "paypal", "alipay", "wechat", "pay", "zoom",
    "teams", "azure", "aws", "cloudflare", "digitalocean",
    "redis", "mongodb", "postgresql", "mysql", "nginx",
    "python", "nodejs", "typescript", "javascript", "java", "golang",
    "linux", "windows", "ubuntu", "centos", "debian",
    "docker", "kubernetes", "jenkins", "graphql", "redis",
    # 中文常见邮件来源
    "中国移动", "中国联通", "中国电信", "支付宝", "淘宝", "天猫",
    "京东", "拼多多", "美团", "滴滴", "饿了么", "百度", "字节跳动",
    "腾讯", "阿里云", "华为云", "钉钉通知", "企业微信团队",
    "数电发票", "山姆会员", "微软奖励", "sys-mail",
}
# 邮件页面特有的 UI 文本特征（出现多个时高概率是邮件页）
EMAIL_PAGE_SIGNATURES = [
    re.compile(r"收件箱\s*\(\d+\)"),          # 收件箱(163)
    re.compile(r"全部\s*[▽▼]"),               # 全部 ▼ (下拉)
    re.compile(r"新建邮件"),                    # 新建邮件按钮
    re.compile(r"回复.*全部|转发"),             # 回复/转发工具栏
    re.compile(r"邮件可翻|智能翻译"),           # 邮件操作区
    re.compile(r"\d+/\d+/\d+.*[+\-]\d+:\d+"),  # 邮件时间格式: 7/4/周六 14:16
]
# 系统消息特征
SYSTEM_MSG_PATTERNS = [
    re.compile(r"^(您已|你已|已撤回|系统|欢迎加入|邀请.*加入|.*退出了?群)"),
    re.compile(r"(消息被|已被|撤回了?)"),
]

# ---- 系统通知/审批/应用通知 模式 — 不是客户聊天！----
# 这些是企微中常见的系统通知、审批流、应用推送等非聊天内容
SYSTEM_NOTIFICATION_PATTERNS = [
    # 审批类：「XXX等N人申请开通/邀请/审批」
    re.compile(r"\S+\s*等\s*\d+\s*人?(申请|邀请|开通|审批|发起|提交)"),
    re.compile(r"^(申请|邀请|审批|通过|拒绝|撤回|撤销|已同意|已拒绝)"),
    # 通知类：退回、拦截、提醒、告警
    re.compile(r"(退回|拦截|已通知|请注意|请查收|请处理|麻烦注意|已登记)"),
    # 应用功能通知：管理企业、对外收款、发票、报销等
    re.compile(r"(管理企业|对外收款|开通.*权限|数电发票|发票.*开具|报销)"),
    # 群数据统计/机器人通知
    re.compile(r"(直放|昨日|群聊数据统计|数据统计|活跃度|打卡|日报)"),
    re.compile(r"(以上问题|以下内容)"),
]
# 系统通知关键词（名称或预览中出现即高度可疑）
NOTIFICATION_KEYWORDS = {
    "申请", "开通", "审批", "邀请", "退回", "拦截",
    "对外收款", "管理企业", "数电发票", "发票开具", "报销",
    "已登记", "已核实", "请注意台", "请及时反馈",
    "数据统计", "活跃度", "日报", "周报", "打卡",
}
# 物流/快递相关关键词（快递通知不是客户咨询）
LOGISTICS_KEYWORDS = {
    "快递", "物流", "中通", "圆通", "申通", "韵达", "顺丰",
    "邮政", "京东物流", "菜鸟", "百世", "极兔", "德邦",
    "运单号", "追踪", "派送", "签收", "揽件", "运输",
    "退回寄件", "拦截件", "发货信息", "查询一下发货",
    "徽商云创",  # 中通快递的某个业务系统名
}
# 手机号/运单号模式 — 出现纯数字长串(10位+)通常是电话或运单号
PHONE_NUMBER_PATTERN = re.compile(r"\d{10,}")
# 快捷短语/自动回复模板（不是真实消息）
AUTO_REPLY_PATTERNS = [
    re.compile(r"^ZZ"),  # ZZ开头是快捷回复标签
    re.compile(r"^\[自动.+\]$"),
]


def looks_like_contact_name(name: str, context_texts: list[str] | None = None) -> bool:
    """
    判断一个名称看起来是否像真实的联系人名字。
    排除 OCR 噪声、UI 元素、文件夹名、邮件发件人等。
    """
    if not name or len(name.strip()) < 2:
        return False
    name = name.strip()

    # 明确的导航/系统项
    if name in NAVIGATION_ITEMS:
        return False

    # 噪声模式
    for p in NOISE_PATTERNS:
        if p.match(name):
            return False

    # 邮件相关
    lower = name.lower()
    if any(kw in lower or kw in name for kw in EMAIL_KEYWORDS):
        return False

    # 系统消息特征
    for p in SYSTEM_MSG_PATTERNS:
        if p.search(name):
            return False

    # 系统通知/审批通知特征（新增）
    for p in SYSTEM_NOTIFICATION_PATTERNS:
        if p.search(name):
            logging.debug("Name matches system notification pattern '%s': %s", p.pattern, name[:40])
            return False
    # 通知关键词
    if any(kw in name for kw in NOTIFICATION_KEYWORDS):
        logging.debug("Name contains notification keyword: %s", name[:40])
        return False
    # 物流/快递相关
    if any(kw in name for kw in LOGISTICS_KEYWORDS):
        logging.debug("Name contains logistics keyword: %s", name[:40])
        return False
    # 含长串数字（手机号/运单号）→ 不是人名
    if PHONE_NUMBER_PATTERN.search(name):
        logging.debug("Name contains phone/tracking number: %s", name[:40])
        return False

    # 纯数字 + 可能的单位（如 "15条"）不是人名
    if re.match(r"^\d+\s*(条|个|封|页|项)$", name):
        return False

    # === 新增：已知组织名/服务名（邮件常见发件人） ===
    if lower in KNOWN_ORG_NAMES:
        return False
    # 部分匹配：名称是某个已知组织名的子集或超集
    for org in KNOWN_ORG_NAMES:
        if len(org) > 4 and (org in lower or lower in org):
            return False

    # === 新增：包含邮件地址 ===
    if EMAIL_ADDR_PATTERN.search(name):
        return False

    # 如果提供了上下文文本，检查上下文中是否有邮件特征
    if context_texts:
        ctx_combined = " ".join(context_texts).lower()
        # 上下文含邮箱地址 → 整行都是邮件内容
        if EMAIL_ADDR_PATTERN.search(ctx_combined):
            return False
        # 上下文含多个邮件页签名 → 大概率在邮件页
        email_sig_count = sum(1 for p in EMAIL_PAGE_SIGNATURES if p.search(ctx_combined))
        if email_sig_count >= 2:
            return False
        # 上下文含系统通知关键词/物流关键词 → 不是正常联系人
        ctx_full = " ".join(context_texts)
        for p in SYSTEM_NOTIFICATION_PATTERNS:
            if p.search(ctx_full):
                return False
        if any(kw in ctx_full for kw in NOTIFICATION_KEYWORDS):
            return False
        if any(kw in ctx_full for kw in LOGISTICS_KEYWORDS):
            return False
        if PHONE_NUMBER_PATTERN.search(ctx_full):
            return False

    # 中文名通常至少 2 个字符，且包含汉字或常见名字格式
    has_chinese = bool(re.search(r"[\u4e00-\u9fff]", name))
    has_letter = bool(re.search(r"[a-zA-Z]", name))

    # 至少要有中文或合理的英文长度
    if not has_chinese and len(name) < 3:
        return False

    # 过滤掉单个汉字加标点（如 "第"、"在"）
    if has_chinese and len(name) <= 1:
        return False

    # 英文名但全是首字母大写的大公司风格（如 "OpenAI", "NVIDIA", "FastGPT"）
    if not has_chinese and has_letter:
        # 检测驼峰/全大写 + 无空格 的公司名模式
        if re.match(r"^[A-Z][a-z]+[A-Z]", name) or re.match(r"^[A-Z]{2,}$", name):
            # 短的公司名模式（2-10字符，无空格，大写开头）
            if 2 <= len(name) <= 12 and " " not in name:
                # 额外检查：如果不含常见中文人名用字，大概率是组织名
                if not re.search(r"[aeiouyAEIOUY]{1,2}[nsrtdlm]", name[-3:]):
                    pass  # 不确定，放行
                # 更激进：无中文环境下，纯英文短名称且看起来像产品名
                if re.match(r"^[A-Z][A-Za-z]{2,10}$", name) and name[0].isupper():
                    # 检查是否像真实英文名（常见英文名词库）
                    COMMON_ENGLISH_NAMES = {
                        "alice", "bob", "charlie", "david", "emma", "frank",
                        "grace", "henry", "ivy", "jack", "kate", "leo",
                        "mary", "nick", "olivia", "peter", "queen", "rose",
                        "sam", "tom", "victor", "wang", "li", "zhang",
                        "chen", "liu", "zhao", "huang", "sun", "john",
                        "james", "mike", "alex", "ben", "dan", "joe",
                        "ryan", "scott", "tony", "ann", "eve", "jan",
                    }
                    if lower not in COMMON_ENGLISH_NAMES:
                        logging.debug("Name looks like org/product, not person: %s", name)
                        return False

    return True


def configure_logging() -> None:
    SIDECAR_LOG.parent.mkdir(parents=True, exist_ok=True)
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
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


def parse_duration(value: str) -> float:
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(s|min|h)\s*", value)
    if not match:
        raise ValueError(f"Invalid duration: {value}")
    number = float(match.group(1))
    return number * {"s": 1, "min": 60, "h": 3600}[match.group(2)]


def normalize_contact_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value or "")
    return re.sub(r"[\s\u200b\ufe0f]+", "", normalized)


# ============================================================
# 窗口操作 — 后台截屏 + PostMessage 后台点击
# ============================================================
def find_wecom_window_handle() -> int:
    """查找企业微信主窗口句柄"""
    candidates: list[tuple[int, int]] = []
    titles = {title.lower() for title in WECOM_WINDOW_TITLES}
    process_names = {name.lower() for name in WECOM_PROCESS_NAMES}

    def _collect(hwnd: int, _: object) -> None:
        if not win32gui.IsWindow(hwnd):
            return
        cls = win32gui.GetClassName(hwnd)
        if cls not in WECOM_WINDOW_CLASSES:
            return
        title = win32gui.GetWindowText(hwnd).lower()
        if titles and title not in titles:
            return
        try:
            import psutil
            import win32process

            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            process_name = psutil.Process(pid).name().lower()
        except Exception:
            process_name = ""
        if process_names and process_name not in process_names:
            return
        # Weixin 4.x keeps several tiny hidden Qt helper windows. Never call
        # ShowWindow/SW_RESTORE for them: doing so creates the blank green
        # mini-window users can see even though the window is rejected later.
        try:
            _, _, original_width, original_height = get_window_rect(hwnd)
        except Exception:
            return
        if original_width < 400 or original_height < 300:
            return
        usable = ensure_usable_window(hwnd)
        if not usable:
            return
        _, _, width, height = get_window_rect(usable)
        if width < 400 or height < 300:
            return
        candidates.append((width * height, usable))

    try:
        win32gui.EnumWindows(_collect, None)
    except Exception:
        candidates = []

    if candidates:
        return max(candidates)[1]

    for cls in WECOM_WINDOW_CLASSES:
        handle = win32gui.FindWindow(cls, None)
        if handle:
            if win32gui.IsWindow(handle):
                try:
                    _, _, width, height = get_window_rect(handle)
                except Exception:
                    continue
                if width < 400 or height < 300:
                    continue
                usable = ensure_usable_window(handle)
                if usable:
                    return usable
    return 0


def get_window_rect(handle: int) -> tuple:
    """获取窗口矩形 (x, y, width, height)"""
    rect = win32gui.GetWindowRect(handle)
    x, y, x2, y2 = rect
    return x, y, x2 - x, y2 - y


def ensure_usable_window(handle: int) -> int:
    """恢复并确认窗口尺寸足够 OCR 采集。"""
    if not handle or not win32gui.IsWindow(handle):
        return 0

    try:
        x, y, width, height = get_window_rect(handle)
    except Exception:
        return 0

    # Visibility is capture state, not a reason to show the client while the
    # polling loop is merely locating it. Showing here caused Weixin helpers to
    # leak onto the desktop as small green windows.
    if False and not win32gui.IsWindowVisible(handle):
        try:
            win32gui.ShowWindow(handle, win32con.SW_SHOW)
            time.sleep(0.3)
        except Exception:
            return 0

    if not win32gui.IsIconic(handle) and (x <= -10000 or y <= -10000 or width < 400 or height < 300):
        try:
            win32gui.ShowWindow(handle, win32con.SW_RESTORE)
            time.sleep(0.5)
        except Exception:
            return 0

    try:
        x, y, width, height = get_window_rect(handle)
    except Exception:
        return 0

    if not win32gui.IsWindow(handle) or width < 400 or height < 300:
        return 0
    return handle


def capture_window(handle: int) -> Image.Image | None:
    """后台截取指定窗口的屏幕内容（不需要窗口在前台）"""
    try:
        x, y, w, h = get_window_rect(handle)
        if w < 100 or h < 100:
            return None
        hwndDC = win32gui.GetWindowDC(handle)
        mfcDC = win32ui.CreateDCFromHandle(hwndDC)
        saveDC = mfcDC.CreateCompatibleDC()
        bitmap = win32ui.CreateBitmap()
        bitmap.CreateCompatibleBitmap(mfcDC, w, h)
        saveDC.SelectObject(bitmap)
        # PW_RENDERFULLCONTENT = 2, 可捕获被遮挡的窗口
        result = windll.user32.PrintWindow(handle, saveDC.GetSafeHdc(), 2)
        if not result:
            windll.user32.BitBlt(
                saveDC.GetSafeHdc(), 0, 0, w, h, hwndDC, 0, 0, win32con.SRCCOPY
            )
        bmpstr = bitmap.GetBitmapBits(True)
        img = Image.frombuffer("RGB", (w, h), bmpstr, "raw", "BGRX", 0, 1)
        mfcDC.DeleteDC()
        saveDC.DeleteDC()
        win32gui.ReleaseDC(handle, hwndDC)
        win32gui.DeleteObject(bitmap.GetHandle())

        # CEF/GPU 窗口有时会让 PrintWindow 成功返回但图像实际为空白。
        # 仅在确认空白时短暂置前做屏幕区域抓取，随后恢复原前台窗口。
        if float(np.asarray(img.convert("L")).std()) < 3.0:
            previous = win32gui.GetForegroundWindow()
            try:
                win32gui.ShowWindow(handle, win32con.SW_RESTORE)
                win32gui.SetForegroundWindow(handle)
                time.sleep(0.2)
                img = ImageGrab.grab(
                    bbox=(x, y, x + w, y + h),
                    all_screens=True,
                ).convert("RGB")
            finally:
                if previous and previous != handle and win32gui.IsWindow(previous):
                    try:
                        win32gui.SetForegroundWindow(previous)
                    except Exception:
                        pass
        return img
    except Exception as e:
        logging.warning("Capture window failed: %s", e)
        return None


def _capture_has_content(img: Image.Image | None) -> bool:
    """Reject blank GPU/CEF frames before OCR can consume them."""
    if img is None or img.width < 100 or img.height < 100:
        return False
    gray = np.asarray(img.convert("L"))
    return float(gray.std()) >= 3.0 and int(gray.max()) - int(gray.min()) >= 12


def _capture_print_window(handle: int) -> Image.Image | None:
    """Read the HWND surface, never pixels belonging to an occluding app."""
    hwnd_dc = mfc_dc = save_dc = bitmap = None
    try:
        _, _, width, height = get_window_rect(handle)
        if width < 100 or height < 100:
            return None
        hwnd_dc = win32gui.GetWindowDC(handle)
        mfc_dc = win32ui.CreateDCFromHandle(hwnd_dc)
        save_dc = mfc_dc.CreateCompatibleDC()
        bitmap = win32ui.CreateBitmap()
        bitmap.CreateCompatibleBitmap(mfc_dc, width, height)
        save_dc.SelectObject(bitmap)
        if not windll.user32.PrintWindow(handle, save_dc.GetSafeHdc(), 2):
            return None
        bits = bitmap.GetBitmapBits(True)
        return Image.frombuffer(
            "RGB", (width, height), bits, "raw", "BGRX", 0, 1
        ).copy()
    finally:
        if save_dc is not None:
            save_dc.DeleteDC()
        if mfc_dc is not None:
            mfc_dc.DeleteDC()
        if hwnd_dc:
            win32gui.ReleaseDC(handle, hwnd_dc)
        if bitmap is not None:
            win32gui.DeleteObject(bitmap.GetHandle())


def capture_window_hybrid(handle: int) -> Image.Image | None:
    """Capture covered/minimized clients without focus, cursor, or desktop theft."""
    placement = None
    was_minimized = False
    was_hidden = False
    foreground = 0
    try:
        foreground = win32gui.GetForegroundWindow()
        was_minimized = bool(win32gui.IsIconic(handle))
        was_hidden = not bool(win32gui.IsWindowVisible(handle))
        if was_minimized or was_hidden:
            placement = win32gui.GetWindowPlacement(handle)
            win32gui.ShowWindow(handle, win32con.SW_SHOWNOACTIVATE)
            win32gui.SetWindowPos(
                handle,
                win32con.HWND_BOTTOM,
                0,
                0,
                0,
                0,
                win32con.SWP_NOMOVE | win32con.SWP_NOSIZE | win32con.SWP_NOACTIVATE,
            )
            time.sleep(0.45)

        image = _capture_print_window(handle)
        if _capture_has_content(image):
            return image

        # A desktop-region fallback is safe only if the target already owns
        # foreground. Otherwise it would OCR whichever app covers that region.
        if foreground == handle and not was_minimized:
            x, y, width, height = get_window_rect(handle)
            visible = ImageGrab.grab(
                bbox=(x, y, x + width, y + height), all_screens=True
            ).convert("RGB")
            if _capture_has_content(visible):
                return visible
        logging.warning("Background capture returned an empty or unsafe frame")
        return None
    except Exception as error:
        logging.warning("Hybrid capture failed: %s", error)
        return None
    finally:
        if (was_minimized or was_hidden) and win32gui.IsWindow(handle):
            try:
                if placement is not None:
                    win32gui.SetWindowPlacement(handle, placement)
                if was_hidden:
                    win32gui.ShowWindow(handle, win32con.SW_HIDE)
                elif was_minimized:
                    win32gui.ShowWindow(handle, win32con.SW_MINIMIZE)
            except Exception as error:
                logging.warning("Could not restore minimized state: %s", error)
        if foreground and foreground != handle and win32gui.IsWindow(foreground):
            try:
                if win32gui.GetForegroundWindow() == handle:
                    win32gui.SetForegroundWindow(foreground)
            except Exception:
                pass


def post_click_background(handle: int, screen_x: int, screen_y: int) -> bool:
    """
    PostMessage 后台点击 — 不移动实际鼠标光标。
    screen_x/screen_y 是屏幕绝对坐标。
    """
    try:
        # 将屏幕坐标转换为客户区坐标
        client_x, client_y = win32gui.ScreenToClient(handle, (screen_x, screen_y))
        lparam = win32api.MAKELONG(client_x, client_y)

        win32api.PostMessage(handle, win32con.WM_MOUSEMOVE, 0, lparam)
        time.sleep(0.02)
        win32api.PostMessage(handle, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, lparam)
        time.sleep(0.05)
        win32api.PostMessage(handle, win32con.WM_LBUTTONUP, 0, lparam)
        return True
    except Exception as e:
        logging.debug("PostMessage click failed: %s", e)
        return False


def save_desktop_state() -> dict:
    """保存当前桌面状态（鼠标位置、前台窗口、剪贴板）"""
    state = {}
    try:
        if HAS_PYAUTOGUI:
            state["cursor"] = pyautogui.position()
    except Exception:
        pass
    try:
        state["foreground"] = win32gui.GetForegroundWindow()
    except Exception:
        pass
    try:
        import win32clipboard
        win32clipboard.OpenClipboard()
        try:
            if win32clipboard.IsClipboardFormatAvailable(win32clipboard.CF_UNICODETEXT):
                data = win32clipboard.GetClipboardData(win32clipboard.CF_UNICODETEXT)
                state["clipboard"] = data
        finally:
            win32clipboard.CloseClipboard()
    except Exception:
        pass
    return state


def restore_desktop_state(state: dict) -> None:
    """恢复桌面状态"""
    try:
        if state.get("clipboard"):
            import win32clipboard
            win32clipboard.OpenClipboard()
            try:
                win32clipboard.EmptyClipboard()
                win32clipboard.SetClipboardText(
                    state["clipboard"], win32clipboard.CF_UNICODETEXT
                )
            finally:
                win32clipboard.CloseClipboard()
    except Exception:
        pass
    try:
        if state.get("cursor") and HAS_PYAUTOGUI:
            pyautogui.moveTo(state["cursor"].x, state["cursor"].y, _pause=False)
    except Exception:
        pass
    try:
        prev = state.get("foreground")
        if prev and win32gui.IsWindow(prev):
            win32gui.SetForegroundWindow(prev)
    except Exception:
        pass


def bring_to_front(handle: int) -> None:
    """将企微窗口置前（仅在发送回复时使用）"""
    try:
        win32gui.ShowWindow(handle, win32con.SW_RESTORE)
        time.sleep(0.15)
        try:
            win32gui.SetForegroundWindow(handle)
        except Exception:
            pass
    except Exception:
        pass


def copy_text_to_clipboard(text: str) -> None:
    """复制文本到剪贴板"""
    import win32clipboard
    win32clipboard.OpenClipboard()
    try:
        win32clipboard.EmptyClipboard()
        win32clipboard.SetClipboardText(text, win32clipboard.CF_UNICODETEXT)
    finally:
        win32clipboard.CloseClipboard()


# ============================================================
# OCR 引擎
# ============================================================
class OcrEngine:
    def __init__(self):
        self.engine = None
        if HAS_OCR:
            try:
                with redirect_stdout(sys.stderr):
                    self.engine = RapidOCR()
                logging.info("RapidOCR engine initialized")
            except Exception as e:
                logging.warning("RapidOCR init failed: %s", e)
                self.engine = None

    def available(self) -> bool:
        return self.engine is not None

    def recognize(self, image: Image.Image) -> list[dict]:
        if self.engine is None:
            return []
        try:
            arr = np.asarray(image.convert("RGB"))
            with redirect_stdout(sys.stderr):
                result = self.engine(arr)

            if isinstance(result, tuple):
                raw_results = result[0] if result and len(result) > 0 else []
            elif hasattr(result, "txts"):
                texts = list(result.txts) if result.txts is not None else []
                scores = list(result.scores) if result.scores is not None else []
                boxes = list(result.boxes) if result.boxes is not None else []
                raw_results = list(zip(boxes, texts, scores))
            else:
                raw_results = []
            if raw_results is None:
                return []

            lines = []
            for item in raw_results:
                if not isinstance(item, (list, tuple)) or len(item) < 3:
                    continue
                box, text, score = item[0], str(item[1]).strip(), float(item[2])
                if not text:
                    continue
                xs = [float(p[0]) for p in box]
                ys = [float(p[1]) for p in box]
                lines.append({
                    "text": text,
                    "score": round(score, 3),
                    "x": round(min(xs)),
                    "y": round(min(ys)),
                    "w": round(max(xs) - min(xs)),
                    "h": round(max(ys) - min(ys)),
                })
            return lines
        except Exception as e:
            logging.warning("OCR failed: %s", e)
            return []


# ============================================================
# 布局解析器
# ============================================================
class WeComLayoutParser:
    def __init__(self, ocr: OcrEngine):
        self.ocr = ocr
        self.window_rect = (0, 0, 0, 0)
        self._screenshot_count = 0
        self._current_module = ""  # 缓存当前检测到的模块

    def detect_current_module(self, img: Image.Image) -> str:
        """
        通过OCR检测左侧导航栏，判断当前在哪个模块。
        返回: "消息" | "邮件" | "文档" | "日程" | "通讯录" | "工作台" | "其他" | "未知"

        原理：企微导航栏中当前选中的模块会有不同的视觉特征（高亮背景），
        我们通过检测导航栏区域文本来判断。同时检测右侧内容区的特征来交叉验证。
        """
        w, h = img.size
        nav_w = int(w * NAV_WIDTH_RATIO)

        # === 策略1：OCR 导航栏区域 ===
        nav_img = img.crop((0, 0, nav_w, h))
        nav_lines = []
        if self.ocr.available():
            nav_lines = self.ocr.recognize(nav_img)

        nav_texts = [l["text"].strip() for l in nav_lines if l["text"].strip()]
        nav_combined = " ".join(nav_texts).lower()

        # 检测各模块关键词
        module_keywords = {
            "消息": ["消息", "单聊", "@我", "未读"],
            "邮件": ["邮件", "收件箱", "草稿箱", "已发送", "新建邮件",
                     "星标邮件", "垃圾邮件", "我的文件夹"],
            "文档": ["文档", "智能文档"],
            "日程": ["日程", "日历"],
            "通讯录": ["通讯录"],
            "工作台": ["工作台"],
        }

        best_module = "其他"
        best_score = 0
        for module, keywords in module_keywords.items():
            score = sum(1 for kw in keywords if kw.lower() in nav_combined or kw in nav_combined)
            # 特殊加权：如果核心关键词出现在导航栏
            core_kw = keywords[0]  # 第一个是核心词
            if core_kw in nav_texts:
                score += 3  # 核心词直接匹配加高分
            if score > best_score:
                best_score = score
                best_module = module

        # === 策略2：OCR 右侧头部区域（标题栏）做交叉验证 ===
        header_img = img.crop((nav_w, 0, w, HEADER_HEIGHT_PX))
        header_lines = []
        if self.ocr.available():
            header_lines = self.ocr.recognize(header_img)
        header_texts = [l["text"].strip() for l in header_lines if l["text"].strip()]
        header_combined = " ".join(header_texts)

        # 邮件页面的头部特征非常明显
        email_header_signals = 0
        for sig in EMAIL_PAGE_SIGNATURES:
            if sig.search(header_combined):
                email_header_signals += 1
        # 邮件地址是铁证
        if EMAIL_ADDR_PATTERN.search(header_combined):
            email_header_signals += 3
        if "收件箱" in header_combined or "新建邮件" in header_combined:
            email_header_signals += 2

        if email_header_signals >= 2:
            logging.debug(
                "Email page detected (header signals=%d): header=%s",
                email_header_signals, header_combined[:80],
            )
            return "邮件"

        # === 策略3：OCR 内容区前几行做最终验证 ===
        content_top_img = img.crop((
            nav_w + int(w * CONV_LIST_WIDTH_RATIO),
            HEADER_HEIGHT_PX,
            w,
            HEADER_HEIGHT_PX + 120,
        ))
        content_lines = []
        if self.ocr.available():
            content_lines = self.ocr.recognize(content_top_img)
        content_texts = [l["text"].strip() for l in content_lines if l["text"].strip()]
        content_combined = " ".join(content_texts)

        # 内容区有邮件地址 → 100% 是邮件页
        if EMAIL_ADDR_PATTERN.search(content_combined):
            return "邮件"
        # 内容区同时出现多个邮件特征
        content_email_signals = sum(
            1 for kw in EMAIL_KEYWORDS if kw in content_combined.lower()
        )
        if content_email_signals >= 2 and best_module == "邮件":
            return "邮件"

        self._current_module = best_module
        logging.debug("Detected module: %s (score=%d, nav=%s)", best_module, best_score, nav_combined[:60])
        return best_module

    def capture_and_parse(self, handle: int) -> dict:
        """截屏并解析整个企微窗口"""
        img = capture_window_hybrid(handle)
        if img is None:
            return {"ok": False, "error": "截图失败"}

        w, h = img.size
        win_x, win_y = get_window_rect(handle)[:2]
        self.window_rect = (win_x, win_y, w, h)

        nav_w = int(w * NAV_WIDTH_RATIO)
        conv_w = int(w * CONV_LIST_WIDTH_RATIO)

        # === 关键：检测当前所在模块 ===
        current_module = self.detect_current_module(img)

        result = {
            "ok": True,
            "window_size": (w, h),
            "window_pos": (win_x, win_y),
            "nav_width": nav_w,
            "conv_list_x": nav_w,
            "conv_list_width": conv_w,
            "chat_area_x": nav_w + conv_w,
            "chat_area_width": w - nav_w - conv_w,
            "header_height": HEADER_HEIGHT_PX,
            "input_height": INPUT_HEIGHT_PX,
            "current_module": current_module,  # 新增：当前模块
            "current_conversation": self._extract_current_chat_title(
                img, nav_w + conv_w
            ),
            "conversations": [],
            "chat_messages": [],
        }

        # 解析左侧会话列表
        conv_img = img.crop((nav_w, HEADER_HEIGHT_PX, nav_w + conv_w, h - INPUT_HEIGHT_PX))
        result["conversations"] = self._parse_conversation_list(
            conv_img, nav_w, HEADER_HEIGHT_PX, win_x, win_y
        )

        # 解析右侧聊天区域（当前选中的会话）
        chat_img = img.crop((nav_w + conv_w, HEADER_HEIGHT_PX, w, h - INPUT_HEIGHT_PX))
        result["chat_messages"] = self._parse_chat_area(
            chat_img, nav_w + conv_w, HEADER_HEIGHT_PX, win_x, win_y
        )

        # 调试截图（每 30 轮保存一次，减少磁盘 IO）
        self._screenshot_count += 1
        if self._screenshot_count % 30 == 0:
            try:
                ts = time.strftime("%H%M%S")
                img.save(str(SCREENSHOT_DIR / f"wecom-full-{ts}.png"))
            except Exception:
                pass

        return result

    def _extract_current_chat_title(self, img: Image.Image, chat_x: int) -> str:
        """Read the selected chat title even when its list item is off screen."""
        if not self.ocr.available() or chat_x >= img.width:
            return ""

        header = img.crop((chat_x, 0, img.width, HEADER_HEIGHT_PX))
        candidates = []
        for line in self.ocr.recognize(header):
            text = str(line.get("text") or "").strip()
            if len(text) < 2:
                continue
            # The selected chat title is the left-most label in the chat header.
            # Ignore timestamps and window/action labels near the right edge.
            if TIME_PATTERN.match(text) or text in ("搜索", "更多"):
                continue
            if line.get("x", 0) > header.width * 0.55:
                continue
            candidates.append(line)

        if not candidates:
            return ""
        return str(min(candidates, key=lambda item: item.get("x", 0))["text"]).strip()

    def _parse_conversation_list(
        self, img: Image.Image, offset_x: int, offset_y: int, win_x: int, win_y: int
    ) -> list[dict]:
        conversations = []
        if not self.ocr.available():
            return conversations

        lines = self.ocr.recognize(img)
        if not lines:
            return conversations

        items = self._group_lines_by_y(lines, gap_y=25)

        for item in items:
            texts = [l["text"] for l in item["lines"]]
            full_text = " ".join(texts)

            if len(full_text.strip()) < 2:
                continue
            if TIME_PATTERN.match(full_text.strip()):
                continue

            # === 两阶段解析：先收集所有候选文本，再智能判断名称和预览 ===
            parsed = self._extract_name_and_preview(texts)
            if parsed is None:
                continue

            name, tag, msg_preview, timestamp, unread_count = parsed

            # === 早期过滤：名称质量检查（含上下文邮件检测） ===
            if not looks_like_contact_name(name, context_texts=texts):
                if not tag:
                    continue

            # === 二次防护：检查所有原始文本中是否含邮件地址或强邮件特征 ===
            all_raw = " ".join(texts)
            if EMAIL_ADDR_PATTERN.search(all_raw):
                logging.debug("Skipping item with email address: %s", all_raw[:60])
                continue
            raw_email_sig_count = sum(1 for p in EMAIL_PAGE_SIGNATURES if p.search(all_raw))
            if raw_email_sig_count >= 2:
                logging.debug("Skipping item with email page signatures: %s", all_raw[:60])
                continue

            # 计算屏幕绝对坐标（用于 PostMessage 点击）
            center_y = item["y"] + item["h"] // 2
            screen_click_x = win_x + offset_x + item["x"] + item["w"] // 2
            screen_click_y = win_y + offset_y + center_y

            conversations.append({
                "name": name or full_text[:20],
                "tag": tag,
                "preview": msg_preview,
                "time": timestamp,
                "unread": unread_count,
                "click_x": screen_click_x,
                "click_y": screen_click_y,
                "raw_texts": texts,
                "y_center": center_y,
            })

        return conversations

    def _extract_name_and_preview(self, texts: list[str]) -> tuple | None:
        """
        从 OCR 文本行中智能提取：名称、标签、消息预览、时间、未读数。

        核心改进：
        - 不再用简单的顺序遍历赋值（旧逻辑会把短人名如 "Jie" 当成消息内容）
        - 用多特征评分区分「联系人名」和「聊天消息预览」
        - 消息预览优先取含 @提及 的文本、或最长的自然语言文本
        - 过短文本（<4字符）不作为消息内容
        """
        name = ""
        tag = ""
        timestamp = ""
        unread_count = 0

        # 第一轮：提取明确的标记（标签、时间、未读数）
        candidates = []  # 剩余候选文本（可能是 name 或 preview）
        for t in texts:
            t = t.strip()
            if not t:
                continue
            if "@微信" in t:
                extracted = t.replace("@微信", "").strip()
                if extracted:
                    name = extracted
                tag = "微信"
            elif "[外部]" in t:
                tag = "外部"
            elif TIME_PATTERN.match(t):
                timestamp = t
            else:
                m = UNREAD_PATTERN.search(t)
                if m:
                    unread_count = int(m.group(1))
                    remaining = UNREAD_PATTERN.sub("", t).strip()
                    if remaining:
                        candidates.append(remaining)
                elif UNREAD_BADGE_PATTERN.match(t):
                    m2 = UNREAD_BADGE_PATTERN.match(t)
                    if m2:
                        unread_count = int(m2.group(1))
                else:
                    candidates.append(t)

        if not candidates and not name:
            return None

        # === 第二轮：从 candidates 中识别 name 和 preview ===
        # 企微会话列表布局：名称在上，预览在下
        # 但OCR可能乱序，所以用特征评分

        # 找出最像"消息预览"的文本
        best_preview = ""
        best_preview_score = -1

        # 找出最像"联系人名称"的文本（在非预览中）
        best_name_candidate = ""

        for c in candidates:
            # 跳过纯噪声
            if len(c) < 2:
                continue

            # 计算该文本是"消息预览"的概率得分
            preview_score = 0
            name_score = 0

            # 特征1：含 @提及 → 高概率是消息预览（企微群聊消息常有 @名字）
            if re.search(r'@\S+', c):
                preview_score += 50
            # 特征2：含常见聊天词汇
            chat_words = ['好的', '收到', '谢谢', '可以', '知道', '了解', '请问',
                          '需要', '帮忙', '麻烦', '这个', '那个', '怎么',
                          '什么', '哪里', '多少', '是的', '不是', '好的',
                          '多谢', '感谢', '不好意思', '没问题', '稍等']
            for cw in chat_words:
                if cw in c:
                    preview_score += 10
            # 特征3：长度较长（消息预览通常比名称长）
            if len(c) >= 8:
                preview_score += 5
            elif len(c) >= 15:
                preview_score += 10
            # 特征4：含中文标点（句子特征）
            if re.search(r'[，。！？、：；""''（）【】]', c):
                preview_score += 15
            # 特征5：含 emoji
            if any(ord(ch) > 0x1F000 for ch in c):
                preview_score += 5
            # 特征6：过短的纯英文/数字 → 不像消息（可能是缩写名）
            if len(c) <= 3 and re.match(r'^[a-zA-Z\d]+$', c):
                preview_score -= 30  # 惩罚
            # 特征7：看起来像组织/公司名（以有限公司/公司/集团结尾）
            if c.endswith('有限') or c.endswith('公司') or c.endswith('集团') or c.endswith('科技'):
                name_score += 40
            # 特征8：看起来像部门/功能名
            func_words = {'客户群', '管理企业', '华北', '华南', '华东', '售后技术'}
            for fw in func_words:
                if fw in c:
                    name_score += 20

            # 特征9：【新增】系统通知风格 → 严重惩罚（不是消息预览）
            for np in SYSTEM_NOTIFICATION_PATTERNS:
                if np.search(c):
                    preview_score -= 100  # 直接淘汰
                    break
            if any(kw in c for kw in NOTIFICATION_KEYWORDS):
                preview_score -= 80
            if any(kw in c for kw in LOGISTICS_KEYWORDS):
                preview_score -= 80
            if PHONE_NUMBER_PATTERN.search(c):
                preview_score -= 60
            # "管理企业" 这类短功能名 → 不是消息
            if c in ('管理企业', 'ZTO中通徽商云创', '客户群'):
                preview_score -= 90

            if preview_score > best_preview_score:
                best_preview_score = preview_score
                best_preview = c

            if name_score > 20 and not best_name_candidate:
                best_name_candidate = c

        # 决策逻辑
        # 1) 如果已有 @微信 提取的 name，保持不变
        # 2) 否则用最佳 name candidate 或最长文本作为 name
        if not name:
            if best_name_candidate:
                name = best_name_candidate
            elif candidates:
                # 取最长文本作为 name（企微名称通常较长）
                name = max(candidates, key=len)

        # 3) 预览选择：
        #    - 最佳 preview 不能是 name 本身
        #    - 必须达到最低分（>0）或至少4字符
        #    - 如果最佳 preview 就是 name，尝试找次优
        if best_preview and best_preview != name and (best_preview_score > 0 or len(best_preview) >= 4):
            msg_preview = best_preview
        else:
            # 从剩余候选中找最好的预览
            remaining = [c for c in candidates if c != name]
            if remaining:
                # 取最长且>=4字符的
                long_ones = [c for c in remaining if len(c) >= 4]
                if long_ones:
                    msg_preview = max(long_ones, key=len)
                else:
                    # 所有候选都太短，标记为无有效预览
                    msg_preview = ""
            else:
                msg_preview = ""

        return (name, tag, msg_preview, timestamp, unread_count)

    def _parse_chat_area(
        self, img: Image.Image, offset_x: int, offset_y: int, win_x: int, win_y: int
    ) -> list[dict]:
        messages = []
        if not self.ocr.available():
            return messages

        lines = self.ocr.recognize(img)
        for line in lines:
            text = line["text"].strip()
            if not text or len(text) < 2:
                continue
            if TIME_PATTERN.match(text):
                continue
            # Toolbar/icon fragments occasionally become long gibberish at a
            # very low confidence and would otherwise look like the newest
            # incoming message.
            if float(line.get("score", 0)) < 0.75:
                continue
            if text in ("发送(S)", "快速会议"):
                continue
            messages.append({
                "text": text,
                "x": line["x"],
                "y": line["y"],
                "w": line["w"],
                "h": line["h"],
                "score": line.get("score", 0),
                # 微信/企微聊天气泡：客户消息靠左，己方消息靠右。
                # 使用文本框中心点做保守判断；中线右侧一律不自动处理。
                "is_incoming": (line["x"] + line["w"] / 2) < (img.width * 0.52),
            })
        return messages

    def _group_lines_by_y(self, lines: list[dict], gap_y: int = 25) -> list[dict]:
        if not lines:
            return []

        sorted_lines = sorted(lines, key=lambda l: l["y"])
        groups = []
        current_group = {
            "lines": [sorted_lines[0]],
            "y": sorted_lines[0]["y"],
            "h": sorted_lines[0]["h"],
            "x": sorted_lines[0]["x"],
            "w": sorted_lines[0]["w"],
        }

        for line in sorted_lines[1:]:
            if line["y"] - current_group["y"] <= gap_y:
                current_group["lines"].append(line)
                current_group["h"] = max(
                    current_group["y"] + current_group["h"],
                    line["y"] + line["h"],
                ) - current_group["y"]
                current_group["w"] = max(
                    current_group["x"] + current_group["w"],
                    line["x"] + line["w"],
                ) - current_group["x"]
            else:
                groups.append(current_group)
                current_group = {
                    "lines": [line],
                    "y": line["y"],
                    "h": line["h"],
                    "x": line["x"],
                    "w": line["w"],
                }
        groups.append(current_group)
        return groups


# ============================================================
# ReplyBridge — 与 Node.js 后端通信
# ============================================================
class ReplyBridge:
    def __init__(self, api_port: int, instance_id: str, dry_run: bool = False):
        self.url = f"http://127.0.0.1:{api_port}/api/v1/message/simulate"
        self.delivery_url = f"http://127.0.0.1:{api_port}/api/v1/compat/{COMPAT_KEY}/suggestions/delivery"
        self.health_url = f"http://127.0.0.1:{api_port}/api/v1/compat/{COMPAT_KEY}/health"
        self.context_url = f"http://127.0.0.1:{api_port}/api/v1/compat/{COMPAT_KEY}/context"
        self.instance_id = instance_id
        self.dry_run = dry_run

    def __call__(self, friend: str, content: str) -> dict | None:
        friend = friend.strip() or "企微用户"
        content = content.strip()
        if not content:
            return None
        if self.dry_run:
            logging.info("[DRY] %s: %s", friend, content[:120])
            return None

        payload = {
            "platformId": PLATFORM_ID,
            "platformName": PLATFORM_NAME,
            "instanceId": self.instance_id,
            "sender": friend,
            "content": content,
            "ctx": {
                "CTX_USERNAME": friend,
                "CTX_PLATFORM": PLATFORM_NAME,
                "CTX_HAS_NEW_MESSAGE": "true",
            },
        }
        try:
            result = post_json(self.url, payload)
            data = result.get("data", {})
            reply = data.get("reply", {})
            reply_content = str(reply.get("content") or "").strip()
            if reply.get("type") == "NO_REPLY" or not reply_content:
                return None
            mode = str(data.get("mode") or "hint")
            logging.info("Reply [%s] for %s: %s", mode, friend, reply_content[:120])
            return {
                "content": reply_content,
                "mode": mode,
                "suggestionId": data.get("suggestionId"),
                "safeToAutoSend": bool(reply.get("safeToAutoSend")),
            }
        except Exception as error:
            logging.exception("API failed for %s: %s", friend, error)
            return None

    def report_health(self, state: str = "running", error: str = "") -> None:
        try:
            post_json(self.health_url, {"state": state, "error": error[:500]}, timeout=3)
        except Exception:
            pass

    def report_delivery(self, suggestion_id: str | None, status: str) -> None:
        try:
            post_json(
                self.delivery_url,
                {"suggestionId": suggestion_id, "status": status},
                timeout=5,
            )
        except Exception:
            pass

    def report_context(self, contact: str, messages: list[dict], account_name: str = "") -> None:
        contact = str(contact or "").strip()
        if not contact:
            return
        recent = [
            {
                "direction": "incoming" if item.get("is_incoming") else "outgoing",
                "content": str(item.get("text") or "").strip()[:500],
            }
            for item in messages[-3:]
            if str(item.get("text") or "").strip()
        ]
        newest_incoming = next(
            (item["content"] for item in reversed(recent) if item["direction"] == "incoming"),
            "",
        )
        try:
            post_json(
                self.context_url,
                {
                    "storeId": PLATFORM_ID,
                    "accountId": self.instance_id,
                    "contactId": contact,
                    "chatFingerprint": f"{PLATFORM_ID}:{self.instance_id}:{contact}",
                    "recentMessages": recent,
                    "incomingMessageFingerprint": newest_incoming or None,
                    "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "confidence": 0.9 if recent else 0.75,
                    "storeName": PLATFORM_NAME,
                    "accountName": account_name or self.instance_id,
                },
                timeout=3,
            )
        except Exception as error:
            logging.debug("Context heartbeat failed: %s", error)


# ============================================================
# 消息过滤 — 只处理私聊或@我的消息
# ============================================================
def is_private_chat(conv: dict) -> bool:
    """
    判断是否为私聊会话。
    企微群聊名称通常含 &、【】、群、组 等特征；
    私聊则只是单纯的联系人名字。
    增强版：即使名称被OCR截断，也能通过其他特征判断。
    """
    name = conv.get("name", "")
    raw_texts = conv.get("raw_texts", [])
    preview = conv.get("preview", "")

    # 拼接所有文本用于检测
    all_text = name + " " + " ".join(raw_texts) + " " + preview

    # === 规则1：群聊特征检测（原始规则，最可靠） ===
    if GROUP_INDICATOR_PATTERN.search(all_text):
        return False

    # 额外群聊特征：名称中有多个 @ 或 () 包裹的内容
    if re.search(r"@.*@|（[^）]+）\s*（", all_text):
        return False

    # === 规则1.5：【新增】组织/公司/品牌名 → 判定为群聊或非私聊 ===
    # 这些是企微中常见的组织群、客户群、供应商群等
    org_group_patterns = [
        r"(中通|圆通|申通|韵达|顺丰|邮政|极兔|德邦)[快递物流]?",  # 物流公司
        r"徽商|云创|供应链",  # 供应链/平台类
        r"科技[^园]?$",  # 以"科技"结尾的短名称（如 ZTO中通徽商云创）
        r"\d+人群|\d+位外部",  # 含人数说明 → 群
        r"客户群|供应商|合作伙伴|渠道商|经销商",
        r"项目组|工作小组|讨论组|交流群|沟通群|服务群|支持群",
        r"【.*】",  # 【】括号包裹的通常是群标签
    ]
    for ogp in org_group_patterns:
        if re.search(ogp, all_text):
            logging.debug("Detected org/group by pattern '%s': %s", ogp, name[:40])
            return False

    # === 规则1.6：【新增】系统通知/物流通知风格 → 非聊天内容 ===
    for p in SYSTEM_NOTIFICATION_PATTERNS:
        if p.search(name) or p.search(preview):
            logging.debug("System notification pattern in name/preview: %s", name[:40])
            return False
    if any(kw in name or kw in preview for kw in NOTIFICATION_KEYWORDS):
        logging.debug("Notification keyword in name/preview: %s / %s", name[:30], preview[:30])
        return False
    if any(kw in all_text for kw in LOGISTICS_KEYWORDS):
        logging.debug("Logistics keyword detected: %s", name[:40])
        return False
    if PHONE_NUMBER_PATTERN.search(name):
        logging.debug("Phone/tracking number in name: %s", name[:40])
        return False

    # === 规则2：@微信 / [外部] 标签的私聊 ===
    if conv.get("tag") == "微信":
        return True
    if conv.get("tag") == "外部":
        # [外部]标签也可能是外部群聊，需要进一步判断
        pass  # 继续下面的检查

    # === 规则3：消息预览中含@他人（非@我）→ 几乎肯定是群聊 ===
    # 提取所有 @提及的名字（排除常见的系统词）
    at_mentions = re.findall(r'@(\S+)', all_text)
    non_self_mentions = [m for m in at_mentions if m not in ('我', 'all', 'all')]
    if len(non_self_mentions) >= 1:
        # 预览中有@别人的名字 → 群聊消息
        logging.debug(
            "Detected group chat by @mention: name=%s mentions=%s",
            name[:30], non_self_mentions,
        )
        return False

    # === 规则4：名称非常长且含公司/组织关键词 → 可能是截断的群名 ===
    long_name_indicators = [
        "有限公司", "集团", "科技园", "管理有限", "交流群",
        "沟通群", "工作群", "部门群", "项目组",
    ]
    has_long_indicator = any(ind in name for ind in long_name_indicators)
    if has_long_indicator and len(name) >= 8:
        logging.debug(
            "Detected probable group chat by long org name: %s (%d chars)",
            name[:40], len(name),
        )
        return False

    # === 规则5：raw_texts 中出现多个不同人名风格 ===
    # 如果文本中出现 "xxx: 消息" 格式，说明是群聊引用
    if re.search(r'\S{1,8}[\s:：]\S{4,}', all_text):
        # 有人名:消息 的模式 → 可能是群聊
        # 但要避免误判私聊中引用的情况
        if not conv.get("tag") or conv.get("tag") == "外部":
            # 外部长名+引用模式 → 更可能是群
            pass

    # === 规则6：名称质量太差 ===
    if not looks_like_contact_name(name, context_texts=raw_texts):
        return False

    # 没有群聊特征且名称像真实联系人 → 默认是私聊
    return True


def is_at_me(conv: dict, my_name: str = "") -> bool:
    """
    检测群聊消息是否@了我。
    企微中有人@我时，会话列表会显示 "[有人@我]" 或预览含 "@我"。
    """
    # 检查所有文本（名称 + 预览 + raw_texts）
    texts_to_check = [
        conv.get("name", ""),
        conv.get("preview", ""),
    ]
    texts_to_check.extend(conv.get("raw_texts", []))
    combined = " ".join(texts_to_check)

    # 1. 检测企微标准 @我 标记
    for pattern in AT_ME_PATTERNS:
        if pattern.search(combined):
            return True

    # 2. 如果配置了我的名字，检测 @我的名字
    if my_name:
        my_name_clean = my_name.strip()
        if my_name_clean and f"@{my_name_clean}" in combined:
            return True

    return False


def should_process_message(conv: dict, my_name: str = "") -> tuple[bool, str]:
    """
    判断是否应该处理该会话的消息。
    返回 (是否处理, 原因)。

    过滤层级（从粗到细）:
    0. 邮件地址/邮件页签名 — 铁证排除
    1. 名称质量检查 — 排除 UI 元素、噪声、系统项
    2. 导航栏/功能项排除 — 明确的非聊天对象
    3. 私聊/群聊判断 — 只处理私聊或@我的群聊
    """
    name = conv.get("name", "")
    raw_texts = conv.get("raw_texts", [])
    preview = conv.get("preview", "")

    if conv.get("unread", 0) > 20 and not is_at_me(conv, my_name):
        return False, "高未读会话疑似群/系统积压"

    # === 层级 0：铁证级邮件检测 ===
    all_text = name + " " + preview + " " + " ".join(raw_texts)
    # 含邮件地址 → 100% 是邮件内容
    if EMAIL_ADDR_PATTERN.search(all_text):
        return False, "含邮件地址"
    # 多个邮件页签名
    email_sig_count = sum(1 for p in EMAIL_PAGE_SIGNATURES if p.search(all_text))
    if email_sig_count >= 2:
        return False, f"邮件页特征({email_sig_count}个)"
    # 邮件关键词密度高（3个以上）
    email_kw_count = sum(1 for kw in EMAIL_KEYWORDS if kw in all_text.lower())
    if email_kw_count >= 3:
        return False, f"邮件关键词多({email_kw_count}个)"

    # === 层级 1：名称质量检查 ===
    if not looks_like_contact_name(name, context_texts=raw_texts):
        has_valid_name = any(looks_like_contact_name(t) for t in raw_texts)
        if not has_valid_name:
            return False, f"非联系人({name!r})"

    # === 层级 2：明确排除导航和功能入口 ===
    if name in NAVIGATION_ITEMS:
        return False, "导航项"
    # 邮件相关关键词检测（单关键词也拦截）
    lower_all = all_text.lower()
    if any(kw in lower_all or kw in all_text for kw in EMAIL_KEYWORDS):
        return False, "邮件/系统项"
    # 系统消息特征
    for p in SYSTEM_MSG_PATTERNS:
        if p.search(name) or p.search(preview):
            return False, "系统消息"

    # === 层级 2.5：【新增】系统通知 / 物流 / 号码 拦截 ===
    # 这是最常见的误采来源！
    for p in SYSTEM_NOTIFICATION_PATTERNS:
        if p.search(name) or p.search(preview):
            return False, f"系统通知({name[:20]})"
    if any(kw in name or kw in preview for kw in NOTIFICATION_KEYWORDS):
        return False, f"通知类({name[:15]})"
    if any(kw in all_text for kw in LOGISTICS_KEYWORDS):
        return False, f"物流快递({name[:15]})"
    if PHONE_NUMBER_PATTERN.search(name) or PHONE_NUMBER_PATTERN.search(preview):
        return False, f"含号码({name[:15]})"
    # 快捷回复标签（ZZ开头等）
    for ap in AUTO_REPLY_PATTERNS:
        if ap.match(preview):
            return False, f"快捷回复标签"

    # === 层级 3：私聊 vs 群聊判断 ===
    if is_private_chat(conv):
        return True, "私聊"

    if is_at_me(conv, my_name):
        return True, "@我"

    return False, "群聊未@"


def clean_at_prefix(text: str, my_name: str = "") -> str:
    """
    去掉消息中的 @我/@名字 前缀，只保留实际消息内容。
    例如: "@我 张工在嘛" → "张工在嘛"
         "有人@我: 张工在嘛" → "张工在嘛"
    """
    if not text:
        return text
    # 去掉 "[有人@我]" 标记
    text = re.sub(r"\[?有人@我\]?\s*:?\s*", "", text)
    # 去掉 "@我" 前缀
    text = re.sub(r"@我\s*:?\s*", "", text)
    # 去掉 "@all" 前缀
    text = re.sub(r"@all\s*:?\s*", "", text, flags=re.IGNORECASE)
    # 去掉 "@我的名字" 前缀
    if my_name:
        my_name_clean = my_name.strip()
        if my_name_clean:
            text = re.sub(
                rf"@{re.escape(my_name_clean)}\s*:?\s*",
                "",
                text,
            )
    return text.strip()


# ============================================================
# 主运行逻辑 — 后台 OCR 模式
# ============================================================

# 联系人级别冷却时间（秒）：处理完某联系人的消息后，该联系人冷却期内不再处理
CONTACT_COOLDOWN = 300  # 5分钟
# 内容去重窗口（秒）
CONTENT_DEDUP_WINDOW = 300  # 5分钟（从180提升）


def _normalize_msg_fp(name: str, content: str) -> tuple[str, str]:
    """
    归一化消息指纹，消除OCR文本和预览文本之间的细微差异。
    用途：路径A（聊天区OCR）和路径B（预览检测）对同一条消息产生的文本可能
    有空格/标点/OCR噪声差异，归一化后两条路径能共享去重。
    """
    normalized = re.sub(r'[\s\u3000]+', '', content.strip())
    normalized = re.sub(r'[，。！？、；：""''（）《》【】\-\.\!\?\,\;\:\(\)\[\]]', '', normalized)
    normalized = normalized.lower()
    return (name, normalized)


def _conversation_baseline_file() -> Path:
    return ROOT / ".tmp-userdata" / f"{COMPAT_KEY}-conversation-baselines.json"


def _load_conversation_baselines() -> tuple[dict[str, tuple[str, int]], bool]:
    path = _conversation_baseline_file()
    if not path.exists():
        return {}, False
    try:
        # PowerShell and some Windows editors may prepend a UTF-8 BOM.
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
        baselines = {
            str(name): (str(state[0]), int(state[1]))
            for name, state in raw.items()
            if isinstance(state, list) and len(state) == 2
        }
        return baselines, True
    except Exception as exc:
        logging.warning("Conversation baseline load failed, rebuilding safely: %s", exc)
        return {}, False


def _save_conversation_baselines(baselines: dict[str, tuple[str, int]]) -> None:
    path = _conversation_baseline_file()
    temp_path = path.with_suffix(".tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path.write_text(
            json.dumps(baselines, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        temp_path.replace(path)
    except Exception as exc:
        logging.warning("Conversation baseline save failed: %s", exc)


def run_wecom(
    duration: str,
    instance_id: str,
    api_port: int | None,
    dry_run: bool,
    debounce_seconds: float,
    my_name: str = "",
) -> None:
    from _retry_utils import wait_for_window

    handle = wait_for_window(
        find_wecom_window_handle,
        window_name=WINDOW_DISPLAY_NAME,
        max_wait=60,
        interval=2,
    )
    handle = ensure_usable_window(handle)
    if not handle:
        raise RuntimeError(f"{WINDOW_DISPLAY_NAME}不可用：窗口最小化、隐藏或尺寸异常")

    rect = get_window_rect(handle)
    logging.info(
        "%s window: handle=%d size=%dx%d pos=(%d,%d)",
        PLATFORM_NAME, handle, rect[2], rect[3], rect[0], rect[1],
    )

    port = api_port or discover_api_port()
    bridge = ReplyBridge(port, instance_id, dry_run=dry_run)
    ocr = OcrEngine()
    parser = WeComLayoutParser(ocr)
    deadline = time.time() + parse_duration(duration)

    # 消息去重：(friend, content) -> timestamp
    seen: dict[tuple[str, str], float] = {}
    last_full_scan_at = 0.0
    last_current_chat_name = ""
    conversation_baselines, conversation_baselines_initialized = (
        _load_conversation_baselines()
    )
    current_chat_baselines: dict[str, tuple[str, ...]] = {}
    current_chat_candidates: dict[str, tuple[tuple[str, ...], int]] = {}

    logging.info(
        "%s OCR sidecar started: port=%s ocr=%s dryRun=%s",
        PLATFORM_NAME, port, ocr.available(), dry_run,
    )

    # 启动独立心跳线程，避免主循环阻塞导致 Node.js 侧心跳超时
    health_stop = threading.Event()
    def _health_loop() -> None:
        while not health_stop.wait(10.0):
            bridge.report_health("running")
    health_thread = threading.Thread(target=_health_loop, daemon=True)
    health_thread.start()
    bridge.report_health("running")

    try:
        while time.time() < deadline:
          try:
            now = time.time()

            # 清理过期去重记录（5 分钟）
            seen = {k: v for k, v in seen.items() if now - v < 300}

            # 确保窗口还存在
            handle = find_wecom_window_handle()
            handle = ensure_usable_window(handle)
            if not handle:
                logging.debug("WeCom window gone, waiting...")
                time.sleep(3.0)
                continue

            # ---- 后台截图 + OCR 解析 ----
            layout = parser.capture_and_parse(handle)
            if not layout.get("ok"):
                time.sleep(2.0)
                continue

            # ---- 处理命令文件（辅助回复模式）----
            # 传入已解析的会话列表，避免 process_command 重复 OCR
            process_command(parser, handle, layout.get("conversations", []))

            # === 关键检查：当前是否在消息页面 ===
            current_module = layout.get("current_module", "未知")
            if current_module != "消息":
                if current_module in ("邮件", "文档", "日程", "通讯录", "工作台"):
                    logging.info(
                        "当前在「%s」页面（非消息聊天），跳过本轮采集。"
                        "请切换到「消息」模块以启用自动回复。",
                        current_module,
                    )
                else:
                    logging.debug(
                        "当前页面检测为「%s」（非消息），跳过采集",
                        current_module,
                    )
                time.sleep(5.0)  # 非消息页面，长间隔轮询
                continue

            convs = layout["conversations"]
            if not convs:
                logging.debug("No conversations found by OCR")
                time.sleep(3.0)
                continue

            current_contact = _detect_current_conversation(convs, layout)
            if current_contact:
                bridge.report_context(
                    current_contact,
                    layout.get("chat_messages", []),
                    my_name,
                )

            # ---- 消息过滤：只处理私聊或@我的会话 ----
            filtered_convs = []
            skipped_count = 0
            for conv in convs:
                should, reason = should_process_message(conv, my_name)
                if should:
                    filtered_convs.append(conv)
                else:
                    skipped_count += 1
            if skipped_count > 0 and filtered_convs:
                logging.debug(
                    "Filtered %d group chats (no @me), processing %d conversations",
                    skipped_count, len(filtered_convs),
                )

            # ---- 启动基线：忽略采集器启动前已经存在的未读/历史消息 ----
            changed_convs = []
            for conv in filtered_convs:
                name = str(conv.get("name", "")).strip()
                preview = str(conv.get("preview", "")).strip()
                if not name:
                    continue
                state = (_normalize_msg_fp(name, preview)[1], int(conv.get("unread", 0)))
                previous = conversation_baselines.get(name)
                conversation_baselines[name] = state
                if previous is None:
                    continue
                preview_changed = bool(state[0]) and state[0] != previous[0]
                became_unread = previous[1] <= 0 < state[1]
                if preview_changed or became_unread:
                    changed_convs.append(conv)

            _save_conversation_baselines(conversation_baselines)

            if not conversation_baselines_initialized:
                conversation_baselines_initialized = True
                logging.info(
                    "Conversation baseline initialized: %d conversations; existing unread messages ignored",
                    len(conversation_baselines),
                )
                time.sleep(2.0)
                continue

            # ---- 策略 1：只处理基线建立后发生变化的未读消息 ----
            # 去重：同一会话 3 分钟内不重复处理（避免未读数持续导致反复采集）
            unread_convs = [c for c in changed_convs if c.get("unread", 0) > 0]
            unread_convs = [
                c for c in unread_convs
                if now - seen.get(("__unread__", c.get("name", "")), 0) >= 180
            ]

            # ---- 策略 2：检测会话列表预览变化（新消息）----
            # 通过预览文本变化来检测新消息，不需要点击
            # 草稿/自己回复的文本也要跳过（以[草稿]开头或含"已发送"等）
            DRAFT_PREFIXES = (
                "[草稿]", "[已发送]", "[发送失败]", "[Draft]",
                "我:", "我：", "Me:", "Me：",
            )
            new_message_convs = []
            for conv in changed_convs:
                name = conv.get("name", "")
                preview = conv.get("preview", "")
                if not name or name in ("消息", "邮件", "文档", "日程"):
                    continue
                if not preview:
                    continue
                if REQUIRE_UNREAD_TO_PROCESS and conv.get("unread", 0) <= 0:
                    continue

                # 跳过草稿/己方回复文本
                if any(preview.startswith(dp) for dp in DRAFT_PREFIXES):
                    continue
                # 跳过看起来是自己回复内容的预览（通常较长且不含典型买家短语）
                if len(preview) > 30 and re.match(r"^[\u4e00-\u9fff，。、！？：；""''（）《》 ]+$", preview):
                    # 纯中文长句且无@提及，大概率是自己的回复
                    if not re.search(r"@|？$|吗$|呢$|？!$|！$", preview):
                        continue

                fingerprint = (name, preview)
                norm_fp = _normalize_msg_fp(name, preview)
                # 原始 + 归一化双重检查
                if now - seen.get(fingerprint, 0) < CONTENT_DEDUP_WINDOW or now - seen.get(norm_fp, 0) < CONTENT_DEDUP_WINDOW:
                    continue
                # 如果预览看起来是新的（包含"条"或不是已知模式），标记为待处理
                new_message_convs.append(conv)

            # 合并：有未读标记 OR 预览是新消息
            target_convs = []
            seen_names = set()
            for conv in unread_convs + new_message_convs:
                name = conv.get("name", "")
                if name and name not in seen_names:
                    target_convs.append(conv)
                    seen_names.add(name)

            # 如果没有未读消息，也处理当前打开的会话（OCR 右侧聊天区）
            processed_this_round: set[str] = set()  # 本轮已处理的联系人（防重复）
            if not target_convs:
                if not PROCESS_CURRENT_CHAT_WITHOUT_UNREAD:
                    time.sleep(2.0)
                    continue
                # 直接解析当前聊天区的内容
                chat_msgs = layout.get("chat_messages", [])
                if chat_msgs:
                    # 找当前会话名（会话列表中高亮/选中的）
                    current_name = _detect_current_conversation(convs, layout)
                    if current_name and current_name != last_current_chat_name:
                        last_current_chat_name = current_name
                        logging.debug("Current chat: %s", current_name)

                    latest_msg = None
                    if current_name:
                        # 检查当前会话是否应该处理（私聊或@我）
                        current_conv = find_conv_by_name(convs, current_name)
                        if current_conv:
                            should, reason = should_process_message(current_conv, my_name)
                            if not should:
                                # 群聊未@我，跳过
                                time.sleep(2.0)
                                continue

                        latest_msg = find_latest_customer_msg(chat_msgs, current_name)
                        snapshot = _incoming_chat_snapshot(chat_msgs, current_name)
                        baseline = current_chat_baselines.get(current_name)
                        if baseline is None:
                            current_chat_baselines[current_name] = snapshot
                            current_chat_candidates.pop(current_name, None)
                            logging.info("Current chat baseline initialized for %s", current_name)
                            time.sleep(2.0)
                            continue
                        if not snapshot or snapshot == baseline:
                            current_chat_candidates.pop(current_name, None)
                            time.sleep(2.0)
                            continue

                        candidate, stable_rounds = current_chat_candidates.get(
                            current_name, ((), 0)
                        )
                        stable_rounds = stable_rounds + 1 if candidate == snapshot else 1
                        current_chat_candidates[current_name] = (snapshot, stable_rounds)
                        if stable_rounds < 2:
                            time.sleep(2.0)
                            continue

                        current_chat_baselines[current_name] = snapshot
                        current_chat_candidates.pop(current_name, None)
                    if latest_msg:
                        # 去掉 @我/@名字 前缀再发送给 LLM
                        latest_msg = clean_at_prefix(latest_msg, my_name)
                        if not latest_msg or len(latest_msg) < 2:
                            time.sleep(2.0)
                            continue
                        # 跳过草稿文本
                        if latest_msg.startswith("[草稿]") or latest_msg.startswith("[已发送]"):
                            time.sleep(2.0)
                            continue
                        msg_fp = (current_name, latest_msg)
                        norm_fp = _normalize_msg_fp(current_name, latest_msg)
                        # 原始key + 归一化key + 联系人冷却 三重去重
                        cooldown_key = ("__contact__", current_name)
                        if (now - seen.get(msg_fp, 0) >= CONTENT_DEDUP_WINDOW
                                and now - seen.get(norm_fp, 0) >= CONTENT_DEDUP_WINDOW
                                and now - seen.get(cooldown_key, 0) >= CONTACT_COOLDOWN):
                            seen[msg_fp] = now
                            seen[norm_fp] = now          # 同步归一化指纹（路径B也能命中）
                            seen[cooldown_key] = now     # 联系人级别冷却
                            processed_this_round.add(current_name)  # 记录已处理
                            _handle_message(
                                current_name, latest_msg, bridge, handle, parser,
                                debounce_seconds,
                            )
                time.sleep(2.0)
                continue

            # ---- 处理有新消息的会话 ----
            for conv in target_convs[:5]:  # 每轮最多处理 5 个
                name = conv.get("name", "")
                # 跳过本轮已在聊天区路径A中处理的联系人（防重复抓取）
                if name and name in processed_this_round:
                    continue
                preview = conv.get("preview", "")
                click_x = conv.get("click_x", 0)
                click_y = conv.get("click_y", 0)

                # 用预览作为消息内容（不需要点击切换）
                # 如果预览包含 [N条] 前缀，去掉它
                msg_content = UNREAD_PATTERN.sub("", preview).strip()
                # 去掉 @我/@名字 前缀，只保留实际消息内容
                msg_content = clean_at_prefix(msg_content, my_name)

                # === 质量检查：消息内容太短或看起来不像真实消息 → 跳过 ===
                if not msg_content or len(msg_content) < 2:
                    continue
                # 纯短文本（<4字符）且不含中文句子特征 → 可能是人名/噪声
                if len(msg_content) < 4:
                    has_chinese_sentense = bool(re.search(r'[\u4e00-\u9fff]{2,}', msg_content))
                    if not has_chinese_sentense:
                        logging.debug(
                            "Skipping short non-sentence preview '%s' for %s (looks like name, not message)",
                            msg_content, name,
                        )
                        continue

                # === 最终安全检查：消息内容本身是通知/物流/号码？→ 跳过 ===
                # 先清理尾部 UI 符号（> / » / → / ▶ 等 OCR 噪声）
                msg_clean = msg_content.rstrip(">»→▶› ")
                is_notification = any(p.search(msg_clean) for p in SYSTEM_NOTIFICATION_PATTERNS)
                has_notif_kw = any(kw in msg_clean for kw in NOTIFICATION_KEYWORDS)
                has_logistics_kw = any(kw in msg_clean for kw in LOGISTICS_KEYWORDS)
                has_phone = bool(PHONE_NUMBER_PATTERN.search(msg_clean))
                # 额外检查：纯物流公司名（如"中通快递"、"顺丰速运"等）
                is_pure_logistics_name = bool(re.match(
                    r'^(中通|圆通|申通|韵达|顺丰|邮政|极兔|德邦|京东)[快递速运物流]+[>\»\→]?$',
                    msg_clean,
                ))
                if is_notification or has_notif_kw or has_logistics_kw or has_phone or is_pure_logistics_name:
                    logging.debug(
                        "Skipping notification/logistics content '%s' from %s",
                        msg_content[:40], name[:30],
                    )
                    continue
                # 消息内容是已知非消息短文本（功能名/标签）
                if msg_content in ('管理企业', 'ZTO中通徽商云创', '客户群',
                                    '玉米', '已通知网点'):
                    logging.debug("Skipping known non-message content: %s", msg_content)
                    continue

                msg_fp = (name, msg_content)
                norm_fp = _normalize_msg_fp(name, msg_content)
                cooldown_key = ("__contact__", name)
                # 三重去重：原始key + 归一化key（跨路径）+ 联系人冷却
                if (now - seen.get(msg_fp, 0) < CONTENT_DEDUP_WINDOW
                        or now - seen.get(norm_fp, 0) < CONTENT_DEDUP_WINDOW
                        or now - seen.get(cooldown_key, 0) < CONTACT_COOLDOWN):
                    continue
                seen[msg_fp] = now
                seen[norm_fp] = now              # 同步归一化指纹（路径A也能命中）
                seen[cooldown_key] = now         # 联系人级别冷却
                # 同时标记未读去重（避免未读数持续导致策略1重复采集）
                seen[("__unread__", name)] = now
                processed_this_round.add(name)  # 记录已处理（防重复）

                logging.info(
                    "New message from %s (unread=%d, private/at-me): %s",
                    name, conv.get("unread", 0), msg_content[:60],
                )

                # 调用后端获取 AI 回复
                _handle_message(
                    name, msg_content, bridge, handle, parser,
                    debounce_seconds, click_x, click_y,
                )

            time.sleep(1.5)

          except Exception as loop_err:
            logging.warning("Loop iteration error (skipped): %s", loop_err)
            time.sleep(3.0)

    except KeyboardInterrupt:
        logging.info("Stopped by user")
    finally:
        health_stop.set()
        try:
            health_thread.join(timeout=3.0)
        except Exception:
            pass
        bridge.report_health("stopped")


def _detect_current_conversation(convs: list[dict], layout: dict) -> str:
    """
    检测当前选中的会话。
    企微中选中的会话通常有不同的背景色，但 OCR 无法直接检测。
    这里用启发式方法：如果会话列表中某项的预览与右侧聊天区最后一条消息匹配，
    则认为该会话是当前选中的。
    """
    chat_msgs = layout.get("chat_messages", [])
    if not chat_msgs:
        return ""

    header_name = str(layout.get("current_conversation") or "").strip()
    if not convs:
        return header_name

    # 取聊天区最后几条消息
    recent_chat_texts = [m["text"] for m in chat_msgs[-5:]]

    for conv in convs:
        preview = conv.get("preview", "")
        if not preview:
            continue
        # 去掉 [N条] 前缀
        clean_preview = UNREAD_PATTERN.sub("", preview).strip()
        if not clean_preview:
            continue
        # 如果预览内容出现在聊天区最近消息中，说明这个会话是当前打开的
        for chat_text in recent_chat_texts:
            if clean_preview in chat_text or chat_text in clean_preview:
                return conv.get("name", "")

    # The header title is more reliable than guessing from a stale/off-screen
    # conversation list entry.
    return header_name


def _handle_message(
    name: str,
    content: str,
    bridge: ReplyBridge,
    handle: int,
    parser: WeComLayoutParser,
    debounce_seconds: float,
    click_x: int = 0,
    click_y: int = 0,
) -> None:
    """处理一条消息：调用后端获取回复，按模式执行操作"""
    decision = bridge(name, content)
    if not decision:
        return

    mode = decision.get("mode", "hint")
    reply_text = decision.get("content", "")
    suggestion_id = decision.get("suggestionId")

    if mode == "hint":
        # 提示模式：仅生成建议，不做任何桌面操作
        logging.info("Hint mode: suggestion created for %s", name)
        return

    if mode == "assist":
        # 辅助模式：通过命令文件填入（由 process_command 处理）
        # 这里只记录，不做桌面操作
        logging.info("Assist mode: suggestion pending for %s", name)
        return

    if mode == "unattended":
        # 无人值守模式：自动发送
        if not decision.get("safeToAutoSend"):
            logging.warning("Reply not safe to auto-send for %s", name)
            return

        # 如果有坐标，先用 PostMessage 后台点击切换到该会话
        if click_x and click_y:
            logging.debug("Background click to switch conversation: %s", name)
            post_click_background(handle, click_x, click_y)
            time.sleep(max(debounce_seconds, 1.0))

        # 发送回复（需要短暂前台操作）
        sent = send_reply_foreground(handle, reply_text)
        if sent:
            bridge.report_delivery(suggestion_id, "sent")
            logging.info("Reply sent to %s", name)
        else:
            bridge.report_delivery(suggestion_id, "failed")
            logging.error("Failed to send reply to %s", name)


def send_reply_foreground(handle: int, text: str) -> bool:
    """
    发送回复 — 短暂前台操作，完成后恢复桌面状态。
    这是唯一需要操控鼠标键盘的操作，且会保存/恢复桌面状态。
    """
    if not HAS_PYAUTOGUI:
        logging.error("pyautogui not available, cannot send reply")
        return False

    # 保存桌面状态
    desktop_state = save_desktop_state()
    try:
        bring_to_front(handle)
        time.sleep(0.3)

        # 点击输入区域（窗口底部偏右）
        x, y, w, h = get_window_rect(handle)
        input_x = x + int(w * 0.65)
        input_y = y + h - 45
        pyautogui.click(input_x, input_y, _pause=False)
        time.sleep(0.2)

        # 粘贴文本
        copy_text_to_clipboard(text)
        time.sleep(0.1)
        pyautogui.hotkey("ctrl", "a", _pause=False)
        time.sleep(0.05)
        pyautogui.hotkey("ctrl", "v", _pause=False)
        time.sleep(0.2)

        # Alt+S 发送
        pyautogui.hotkey("alt", "s", _pause=False)
        logging.info("Reply sent via clipboard: %s...", text[:40])
        return True
    except Exception as e:
        logging.exception("Send reply failed: %s", e)
        return False
    finally:
        time.sleep(0.1)
        restore_desktop_state(desktop_state)


def _incoming_chat_snapshot(messages: list[dict], friend_name: str) -> tuple[str, ...]:
    """生成当前聊天最近三条客户消息的稳定快照，用于检测无未读的新消息。"""
    candidates = []
    for msg in messages:
        text = str(msg.get("text", "")).strip()
        if msg.get("is_incoming") is not True:
            continue
        if not text or TIME_PATTERN.match(text) or text == friend_name:
            continue
        if text in ("外部", "星期五", "星期六", "星期日", "星期一", "星期二", "星期三", "星期四"):
            continue
        normalized = _normalize_msg_fp(friend_name, text)[1]
        if normalized:
            candidates.append((msg.get("y", 0), normalized))
    candidates.sort(key=lambda item: item[0])
    return tuple(text for _, text in candidates[-3:])


def find_latest_customer_msg(messages: list[dict], friend_name: str) -> str | None:
    """从聊天区 OCR 结果中找出最新的客户消息"""
    if not messages:
        return None

    candidates = []
    for msg in messages:
        text = msg["text"]
        if msg.get("is_incoming") is not True:
            continue
        if TIME_PATTERN.match(text):
            continue
        # Common customer messages such as “你好”, “在吗”, “有货” are two
        # Chinese characters and must not be discarded as OCR noise.
        if len(text) < 2:
            continue
        if text == friend_name:
            continue
        # 过滤 UI 元素
        if text in ("外部", "星期五", "星期六", "星期日", "星期一", "星期二", "星期三", "星期四"):
            continue
        candidates.append(msg)

    if not candidates:
        return None

    best = max(candidates, key=lambda m: m["y"])
    return best["text"]


def process_command(
    parser: WeComLayoutParser,
    handle: int,
    conversations: list[dict] | None = None,
) -> None:
    """
    处理来自工作台的定位填入命令（辅助回复模式）。
    conversations: 主循环已 OCR 解析的会话列表，传入可避免重复截图 OCR。
    """
    if not COMMAND_FILE.exists():
        return
    try:
        command = json.loads(COMMAND_FILE.read_text(encoding="utf-8"))
        COMMAND_FILE.unlink(missing_ok=True)
        request_id = str(command.get("requestId") or "")
        target = str(command.get("sender") or "").strip()
        text = str(command.get("content") or "").strip()

        if target and text:
            if not HAS_PYAUTOGUI:
                COMMAND_RESULT_FILE.write_text(
                    json.dumps({"requestId": request_id, "ok": False, "error": "pyautogui not available"}),
                    encoding="utf-8",
                )
                return
            handle = find_wecom_window_handle()
            if handle:
                # 优先复用主循环已解析的会话列表，避免重复 OCR
                if conversations:
                    convs = conversations
                else:
                    logging.debug("process_command: 无缓存会话列表，重新 OCR")
                    layout = parser.capture_and_parse(handle)
                    convs = layout.get("conversations", [])
                conv = find_conv_by_name(convs, target)
                if conv:
                    logging.info(
                        "process_command: target=%s click=(%d,%d)",
                        target, conv.get("click_x", 0), conv.get("click_y", 0),
                    )
                    # 保存桌面状态
                    desktop_state = save_desktop_state()
                    try:
                        bring_to_front(handle)
                        time.sleep(0.5)

                        # 用真实点击切换会话（PostMessage 对企微 CEF 渲染不可靠）
                        click_x = conv.get("click_x", 0)
                        click_y = conv.get("click_y", 0)
                        if click_x and click_y:
                            pyautogui.click(click_x, click_y, _pause=False)
                            time.sleep(0.8)

                        # 聚焦输入区域（企微点击会话后不会自动聚焦输入框）
                        x, y, w, h = get_window_rect(handle)
                        input_x = x + int(w * 0.65)
                        input_y = y + h - 45
                        logging.info(
                            "process_command: click input area (%d,%d) window=%dx%d",
                            input_x, input_y, w, h,
                        )
                        pyautogui.click(input_x, input_y, _pause=False)
                        time.sleep(0.3)

                        # 填入回复文本
                        copy_text_to_clipboard(text)
                        time.sleep(0.15)
                        pyautogui.hotkey("ctrl", "a", _pause=False)
                        time.sleep(0.1)
                        pyautogui.hotkey("ctrl", "v", _pause=False)
                        # 关键：等待粘贴生效，不能立即切走窗口
                        time.sleep(0.5)

                        COMMAND_RESULT_FILE.write_text(
                            json.dumps({"requestId": request_id, "ok": True}),
                            encoding="utf-8",
                        )
                        logging.info("Filled reply for: %s", target)
                        return
                    finally:
                        # 等待 UI 完全处理完粘贴操作后再恢复桌面
                        time.sleep(0.3)
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


def find_conv_by_name(conversations: list[dict], name: str) -> dict | None:
    """在会话列表中按名称查找联系人"""
    key = normalize_contact_name(name)
    for conv in conversations:
        if normalize_contact_name(conv.get("name", "")) == key:
            return conv
        for t in conv.get("raw_texts", []):
            if normalize_contact_name(t) == key:
                return conv
    for conv in conversations:
        if key in normalize_contact_name(conv.get("name", "")):
            return conv
    return None


# ============================================================
# 入口
# ============================================================
def main() -> int:
    parser = argparse.ArgumentParser(description="Enterprise WeChat OCR auto-reply sidecar")
    parser.add_argument("--duration", default="12h")
    parser.add_argument("--instance-id", default=DEFAULT_INSTANCE_ID)
    parser.add_argument("--api-port", type=int)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--debounce-seconds", type=float, default=2.0)
    parser.add_argument("--backend", choices=("wecom",), default="wecom")
    parser.add_argument("--my-name", default="", help="你的企微名称，用于检测群聊@提及")
    args = parser.parse_args()

    configure_logging()
    try:
        run_wecom(
            args.duration, args.instance_id, args.api_port,
            args.dry_run, args.debounce_seconds, args.my_name,
        )
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
