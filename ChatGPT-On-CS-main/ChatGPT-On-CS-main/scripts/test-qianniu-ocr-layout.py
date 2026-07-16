import importlib.util
import sys
import types
from pathlib import Path


fake_numpy = types.ModuleType("numpy")
fake_numpy.ndarray = object
sys.modules["numpy"] = fake_numpy

fake_pil = types.ModuleType("PIL")
fake_pil.Image = object
sys.modules["PIL"] = fake_pil

fake_rapidocr = types.ModuleType("rapidocr")
fake_rapidocr.RapidOCR = object
sys.modules["rapidocr"] = fake_rapidocr

script = Path(__file__).resolve().parent / "qianniu_rapidocr.py"
spec = importlib.util.spec_from_file_location("qianniu_rapidocr_under_test", script)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

module.bubble_blue_bias = lambda image, line, cfg: 0.0
module.lowest_outgoing_y = lambda image, cfg: 0


class FakeImage:
    shape = (1000, 1000, 3)


lines = [
    {"text": "迎波智能科技", "score": 0.99, "x": 300, "y": 150, "width": 90, "height": 20},
    {"text": "麻烦今天发顺丰，谢谢", "score": 0.98, "x": 300, "y": 600, "width": 130, "height": 24},
    {"text": "C", "score": 0.95, "x": 300, "y": 720, "width": 12, "height": 16},
]

candidate = module.extract_candidate(FakeImage(), lines, module.LayoutConfig())
assert candidate["sender"] == "迎波智能科技", candidate
assert candidate["content"] == "麻烦今天发顺丰，谢谢", candidate
assert candidate["latest_direction"] == "incoming", candidate
print("Qianniu OCR layout checks passed.")
