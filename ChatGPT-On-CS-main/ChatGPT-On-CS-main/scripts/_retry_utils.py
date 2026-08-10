"""Small shared retry helpers for desktop sidecars."""

from __future__ import annotations

import time
import functools
import logging
from collections.abc import Callable
from typing import Any, TypeVar

T = TypeVar("T")
logger = logging.getLogger(__name__)


def retry(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: tuple[type[BaseException], ...] = (Exception,),
    on_fail: Callable[[BaseException, int], None] | None = None,
):
    """Retry a synchronous operation with bounded exponential backoff."""

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> T:
            wait = max(0.0, delay)
            last_error: BaseException | None = None
            for attempt in range(1, max(1, max_attempts) + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as error:
                    last_error = error
                    if on_fail:
                        on_fail(error, attempt)
                    else:
                        logger.warning(
                            "%s attempt %d/%d failed: %s",
                            func.__name__,
                            attempt,
                            max_attempts,
                            error,
                        )
                    if attempt < max_attempts:
                        time.sleep(wait)
                        wait *= max(1.0, backoff)
            if last_error is not None:
                raise last_error
            raise RuntimeError("retry called without an attempt")

        return wrapper

    return decorator


def wait_for_window(
    finder: Callable[[], T | None],
    timeout: float | None = None,
    interval: float = 0.5,
    *,
    window_name: str | None = None,
    max_wait: float | None = None,
) -> T | None:
    """Wait for a window while supporting both old and new call signatures."""
    legacy_call = max_wait is not None or window_name is not None
    timeout = max_wait if max_wait is not None else (timeout if timeout is not None else 30.0)
    deadline = time.monotonic() + max(0.0, timeout)
    while True:
        value = finder()
        if value:
            return value
        if time.monotonic() >= deadline:
            if legacy_call:
                raise RuntimeError(f"{window_name or '目标窗口'} 在 {timeout:g}s 内未出现")
            return None
        time.sleep(max(0.05, interval))
