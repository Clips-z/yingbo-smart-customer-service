import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from qianniu_rapidocr import QianniuRapidOcr, emit


def main() -> int:
    try:
        engine = QianniuRapidOcr()
        emit({"type": "ready"})
    except Exception as error:
        emit({"type": "fatal", "error": str(error)})
        return 1

    for raw_line in sys.stdin.buffer:
        try:
            request = json.loads(raw_line.decode("utf-8"))
            result = engine.recognize(request["image"])
            result["id"] = request["id"]
            emit(result)
        except Exception as error:
            emit(
                {
                    "id": request.get("id") if "request" in locals() else None,
                    "ok": False,
                    "error": str(error),
                }
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
