import json
import os
import re
import sys
import logging
from contextlib import redirect_stdout
from pathlib import Path

from _retry_utils import retry

logging.basicConfig(level=logging.WARNING, format="[%(levelname)s] %(message)s")


PROJECT_ROOT = Path(__file__).resolve().parent.parent
RUNTIME_DIR = PROJECT_ROOT / "tools" / "rapidocr-py311"
sys.path.insert(0, str(RUNTIME_DIR))
os.environ.setdefault("PYTHONIOECODING", "utf-8")

import numpy as np
from PIL import Image
try:
    from rapidocr import RapidOCR
except ImportError:
    from rapidocr_onnxruntime import RapidOCR


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), flush=True)


# ============================================================
# 布局配置 — 全部使用比例，适配不同分辨率
# 原硬编码值基于 1366x768，现在按比例自动适配
# ============================================================

class LayoutConfig:
    """千牛工作台布局比例配置（相对于完整窗口截图）"""

    # 截图裁剪区域（识别区域）
    # Keep store/account tabs and the right-side product panel in the OCR
    # evidence. Candidate selection below still limits messages to the chat
    # column, so scanning the full window does not turn panel text into replies.
    CROP_LEFT = 0.0
    CROP_TOP = 0.0
    CROP_RIGHT = 1.0
    CROP_BOTTOM = 1.0
    OCR_SCALE = 0.75

    # 气泡蓝色偏移检测区域
    BUBBLE_X_START = 0.223     # 原 305
    BUBBLE_X_END = 0.614       # 原 838
    BUBBLE_Y_START = 0.371     # 原 285
    BUBBLE_Y_END = 0.990       # 原 760
    BUBBLE_X_PADDING = 14
    BUBBLE_Y_PADDING = 8

    # 发送方气泡检测区域（lowest_outgoing_y）
    OUTGOING_Y_START = 0.378   # 原 290
    OUTGOING_Y_END = 0.918     # 原 705
    OUTGOING_X_START = 0.329   # 原 450
    OUTGOING_X_END = 0.614     # 原 838

    # 发送者名称区域
    SENDER_X_MIN = 0.234       # 原 320
    SENDER_X_MAX = 0.454       # 原 620
    # Buyer names stay near the header while the window height changes with
    # DPI and client chrome. The old lower bound excluded valid names.
    SENDER_Y_MIN = 0.130
    SENDER_Y_MAX = 0.241       # 原 185

    # 候选消息气泡区域
    CANDIDATE_X_MIN = 0.249    # 原 340
    CANDIDATE_X_MAX = 0.381    # 原 520
    CANDIDATE_RIGHT_MAX = 0.556  # 原 760
    CANDIDATE_Y_MIN = 0.391    # 原 300
    # Stop above the composer toolbar; OCR may otherwise treat an icon such
    # as the letter "C" as the newest message.
    CANDIDATE_Y_MAX = 0.690

    # 蓝色气泡阈值
    BUBBLE_BLUE_THRESHOLD = 8.0
    LIGHTNESS_THRESHOLD = 185

    # 发送方气泡颜色特征
    OUTGOING_RED_MIN = 205
    OUTGOING_GREEN_MIN = 215
    OUTGOING_BLUE_MIN = 225
    OUTGOING_BLUE_RED_DIFF = 10
    OUTGOING_BLUE_GREEN_DIFF = 3
    OUTGOING_MIN_HITS = 3


def bubble_blue_bias(image: np.ndarray, line: dict, cfg: LayoutConfig) -> float:
    height, width = image.shape[:2]
    x_start = max(
        int(width * cfg.BUBBLE_X_START),
        int(line["x"]) - cfg.BUBBLE_X_PADDING,
    )
    x_end = min(
        width - 1,
        int(width * cfg.BUBBLE_X_END),
        int(line["x"]) + int(line["width"]) + cfg.BUBBLE_X_PADDING,
    )
    y_start = max(
        int(height * cfg.BUBBLE_Y_START),
        int(line["y"]) - cfg.BUBBLE_Y_PADDING,
    )
    y_end = min(
        height - 1,
        int(height * cfg.BUBBLE_Y_END),
        int(line["y"]) + int(line["height"]) + cfg.BUBBLE_Y_PADDING,
    )
    area = image[y_start : y_end + 1 : 2, x_start : x_end + 1 : 3]
    if area.size == 0:
        return 0.0
    light = np.all(area >= cfg.LIGHTNESS_THRESHOLD, axis=2)
    if not np.any(light):
        return 0.0
    pixels = area[light].astype(np.int16)
    return round(float(np.mean(pixels[:, 2] - pixels[:, 0])), 2)


def lowest_outgoing_y(image: np.ndarray, cfg: LayoutConfig) -> int:
    height, width = image.shape[:2]
    max_x = min(width - 1, int(width * cfg.OUTGOING_X_END))
    max_y = min(height - 1, int(height * cfg.OUTGOING_Y_END))
    y_start = int(height * cfg.OUTGOING_Y_START)
    x_start = int(width * cfg.OUTGOING_X_START)
    lowest = 0
    for y in range(y_start, max_y + 1, 2):
        pixels = image[y, x_start : max_x + 1 : 4].astype(np.int16)
        if pixels.size == 0:
            continue
        red, green, blue = pixels[:, 0], pixels[:, 1], pixels[:, 2]
        hits = np.count_nonzero(
            (red >= cfg.OUTGOING_RED_MIN)
            & (green >= cfg.OUTGOING_GREEN_MIN)
            & (blue >= cfg.OUTGOING_BLUE_MIN)
            & (blue - red >= cfg.OUTGOING_BLUE_RED_DIFF)
            & (blue - green >= cfg.OUTGOING_BLUE_GREEN_DIFF)
        )
        if hits >= cfg.OUTGOING_MIN_HITS:
            lowest = y
    return lowest


def extract_candidate(
    image: np.ndarray,
    lines: list[dict],
    cfg: LayoutConfig,
) -> dict:
    height, width = image.shape[:2]

    sender_x_min = int(width * cfg.SENDER_X_MIN)
    sender_x_max = int(width * cfg.SENDER_X_MAX)
    sender_y_min = int(height * cfg.SENDER_Y_MIN)
    sender_y_max = int(height * cfg.SENDER_Y_MAX)

    sender_line = next(
        (
            line
            for line in lines
            if sender_x_min <= line["x"] <= sender_x_max
            and sender_y_min <= line["y"] <= sender_y_max
            and re.search(r"(?:[A-Za-z0-9_]{5,}|[\u4e00-\u9fff]{2,})", line["text"])
            and len(re.sub(r"\s+", "", line["text"])) >= 2
            and not re.match(r"^20\d\d", line["text"])
        ),
        None,
    )

    cand_x_min = int(width * 0.240)
    cand_x_max = int(width * cfg.CANDIDATE_X_MAX)
    cand_right_max = int(width * cfg.CANDIDATE_RIGHT_MAX)
    cand_y_min = int(height * cfg.CANDIDATE_Y_MIN)
    cand_y_max = int(height * min(cfg.CANDIDATE_Y_MAX, 0.78))

    candidates = []
    card_y = [
        line["y"]
        for line in lines
        if re.search(r"[¥￥]\s*\d|https?://|月销\s*\d|商品详情页", line["text"])
    ]
    for line in lines:
        text = line["text"]
        right = line["x"] + line["width"]
        bias = bubble_blue_bias(image, line, cfg)
        if not (
            cand_x_min <= line["x"] <= cand_x_max
            and line["x"] <= int(width * 0.31)
            and right <= cand_right_max
            and cand_y_min <= line["y"] <= cand_y_max
            and bias < cfg.BUBBLE_BLUE_THRESHOLD
        ):
            continue
        if re.match(r"^\s*[O0]\s*$", text):
            continue
        if not re.search(r"[A-Za-z0-9\u4e00-\u9fff]{2,}", text):
            continue
        if any(
            abs(line["y"] - peer["y"]) <= 8
            and re.search(r"20\d\d[-/.]", peer["text"])
            for peer in lines
            if peer is not line
        ):
            continue
        if re.match(r"^\s*20\d\d", text) or re.search(r"https?://", text):
            continue
        if re.match(r"^\s*tb\d+\s+20\d\d", text, re.IGNORECASE):
            continue
        if re.match(r"^\s*(已读|未读)\s*$", text):
            continue
        if "买家30天内" in text or "才能给买家发消息" in text:
            continue
        if "转交给" in text or "商品详情页" in text or re.search(r"[¥￥]\s*\d", text):
            continue
        if re.match(r"^\s*(月销|销量|库存)\s*\d", text):
            continue
        if any(abs(line["y"] - y) <= 85 for y in card_y):
            continue
        candidates.append((line, bias))

    candidate_line, blue_bias = max(
        candidates,
        key=lambda item: item[0]["y"],
        default=(None, 0.0),
    )
    structured_outgoing_y = max(
        (
            line["y"]
            for line in lines
            if line["x"] > int(width * 0.31)
            and line["x"] + line["width"] <= cand_right_max
            and cand_y_min <= line["y"] <= cand_y_max
            and re.search(r"[A-Za-z0-9\u4e00-\u9fff]{2,}", line["text"])
            and not re.search(r"20\d\d[-/.]", line["text"])
        ),
        default=0,
    )
    outgoing_y = max(lowest_outgoing_y(image, cfg), structured_outgoing_y)
    if candidate_line is None:
        latest_direction = "unknown"
        content = ""
    else:
        content = re.sub(r"\s+", "", candidate_line["text"].strip())
        latest_direction = (
            "outgoing"
            if outgoing_y > candidate_line["y"] + candidate_line["height"] + 5
            else "incoming"
        )

    return {
        "sender": sender_line["text"].strip() if sender_line else "",
        "content": content,
        "confidence": float(candidate_line["score"]) if candidate_line else 0.0,
        "direction": "incoming" if candidate_line and blue_bias < cfg.BUBBLE_BLUE_THRESHOLD else "unknown",
        "latest_direction": latest_direction,
        "bubble_blue_bias": blue_bias,
        "lowest_outgoing_y": outgoing_y,
        "x": candidate_line["x"] if candidate_line else 0,
        "y": candidate_line["y"] if candidate_line else 0,
    }


class QianniuRapidOcr:
    def __init__(self, config: LayoutConfig | None = None) -> None:
        self.cfg = config or LayoutConfig()
        with redirect_stdout(sys.stderr):
            self.engine = RapidOCR()

    @retry(max_attempts=2, delay=0.5, backoff=2.0)
    def recognize(self, image_path: str) -> dict:
        try:
            image = Image.open(image_path).convert("RGB")
        except Exception as e:
            return {"ok": False, "error": f"图片打开失败: {e}", "lines": []}
        image_array = np.asarray(image)
        width, height = image.size
        left = max(0, int(width * self.cfg.CROP_LEFT))
        top = max(0, int(height * self.cfg.CROP_TOP))
        right = min(width, int(width * self.cfg.CROP_RIGHT))
        bottom = min(height, int(height * self.cfg.CROP_BOTTOM))
        crop = image_array[top:bottom, left:right]
        ocr_scale = self.cfg.OCR_SCALE
        if ocr_scale < 1.0:
            crop = np.asarray(
                Image.fromarray(crop).resize(
                    (
                        max(1, round(crop.shape[1] * ocr_scale)),
                        max(1, round(crop.shape[0] * ocr_scale)),
                    ),
                    Image.Resampling.LANCZOS,
                )
            )

        with redirect_stdout(sys.stderr):
            try:
                output = self.engine(crop)
            except Exception as e:
                return {"ok": False, "error": f"OCR 引擎错误: {e}", "lines": []}
        if hasattr(output, "txts"):
            texts = list(output.txts) if output.txts is not None else []
            scores = list(output.scores) if output.scores is not None else []
            boxes = list(output.boxes) if output.boxes is not None else []
        else:
            legacy = output[0] if isinstance(output, tuple) else output
            legacy = legacy or []
            boxes = [item[0] for item in legacy]
            texts = [item[1] for item in legacy]
            scores = [item[2] for item in legacy]
        lines = []
        for text, score, box in zip(texts, scores, boxes):
            xs = [float(point[0]) for point in box]
            ys = [float(point[1]) for point in box]
            x1, x2 = min(xs) / ocr_scale + left, max(xs) / ocr_scale + left
            y1, y2 = min(ys) / ocr_scale + top, max(ys) / ocr_scale + top
            lines.append(
                {
                    "text": str(text),
                    "score": round(float(score), 5),
                    "x": round(x1),
                    "y": round(y1),
                    "width": max(1, round(x2 - x1)),
                    "height": max(1, round(y2 - y1)),
                }
            )

        for line in lines:
            if line["y"] > 70:
                continue
            x1 = max(0, int(line["x"]) - 18)
            y1 = max(0, int(line["y"]) - 10)
            x2 = min(width, int(line["x"] + line["width"]) + 18)
            y2 = min(height, int(line["y"] + line["height"]) + 10)
            pixels = image_array[y1:y2, x1:x2].astype(np.int16)
            if pixels.size:
                blue = (
                    (pixels[:, :, 2] - pixels[:, :, 0] > 55)
                    & (pixels[:, :, 2] - pixels[:, :, 1] > 35)
                )
                if float(blue.mean()) >= 0.2:
                    line["active_tab"] = True

        card_y = [
            line["y"]
            for line in lines
            if re.search(r"[¥￥]\s*\d|https?://|月销\s*\d|商品详情页", line["text"])
        ]
        speaker_headers = []
        for time_line in lines:
            if not re.search(r"20\d\d[-/.]", time_line["text"]):
                continue
            row_text = "".join(
                peer["text"]
                for peer in lines
                if abs(peer["y"] - time_line["y"]) <= 8
            )
            speaker_text = re.sub(
                r"20\d\d[-/.]\d{1,2}[-/.]\d{1,2}\s*\d{1,2}:\d{2}:\d{2}",
                "",
                row_text,
            )
            speaker_headers.append(
                {
                    "y": time_line["y"],
                    "direction": "outgoing"
                    if ":" in speaker_text or "：" in speaker_text
                    else "incoming",
                }
            )

        recent_messages = []
        for line in lines:
            text = re.sub(r"\s+", "", line["text"].strip())
            right = line["x"] + line["width"]
            if not (
                int(width * 0.24) <= line["x"]
                and right <= int(width * 0.64)
                and int(height * 0.30) <= line["y"] <= int(height * 0.90)
            ):
                continue
            if (
                len(text) < 2
                or not re.search(r"[A-Za-z0-9\u4e00-\u9fff]{2,}", text)
                or re.match(r"^\d{1,2}:\d{2}", text)
                or re.search(r"20\d\d[-/.]", text)
                or any(
                    abs(line["y"] - peer["y"]) <= 8
                    and re.search(r"20\d\d[-/.]", peer["text"])
                    for peer in lines
                    if peer is not line
                )
                or re.match(r"^(已读|未读|月销|销量|库存)", text)
                or re.search(r"https?://|买家30天内|才能给买家发消息|转交给|商品详情页|[¥￥]\s*\d", text)
                or any(abs(line["y"] - y) <= 85 for y in card_y)
            ):
                continue
            prior_header = max(
                (header for header in speaker_headers if header["y"] < line["y"]),
                key=lambda header: header["y"],
                default=None,
            )
            bias = bubble_blue_bias(image_array, line, self.cfg)
            if prior_header and line["y"] - prior_header["y"] <= 85:
                direction = prior_header["direction"]
            elif bias >= self.cfg.BUBBLE_BLUE_THRESHOLD:
                direction = "outgoing"
            elif bias < self.cfg.BUBBLE_BLUE_THRESHOLD and line["x"] <= int(width * 0.305):
                direction = "incoming"
            else:
                continue
            if recent_messages:
                previous = recent_messages[-1]
                if previous["content"] == text:
                    continue
                if previous["direction"] == direction and line["y"] - previous["y"] <= 36:
                    previous["content"] += text
                    previous["y"] = line["y"]
                    continue
            recent_messages.append(
                {"direction": direction, "content": text, "y": line["y"]}
            )

        return {
            "ok": True,
            "engine": "rapidocr",
            "image_size": {"width": width, "height": height},
            "candidate": extract_candidate(image_array, lines, self.cfg),
            "lines": lines,
            "recent_messages": recent_messages[-3:],
        }


def recognize_once() -> int:
    if len(sys.argv) != 2:
        emit({"ok": False, "error": "image path is required", "lines": []})
        return 2
    try:
        emit(QianniuRapidOcr().recognize(sys.argv[1]))
        return 0
    except Exception as error:
        emit({"ok": False, "error": str(error), "lines": []})
        return 1


if __name__ == "__main__":
    raise SystemExit(recognize_once())
