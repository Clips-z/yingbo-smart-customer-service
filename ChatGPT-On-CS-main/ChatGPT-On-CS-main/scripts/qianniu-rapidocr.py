import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from qianniu_rapidocr import recognize_once


if __name__ == "__main__":
    raise SystemExit(recognize_once())
