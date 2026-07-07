"""
采集脚本公共工具 — 重试 / 窗口恢复 / 熔断器 / 日志

所有平台采集脚本 (qianniu / wechat / wecom / jinmai) 共用此模块，
统一异常恢复策略，避免每个脚本各自实现一套不一致的重试逻辑。

用法:
    from _retry_utils import retry, wait_for_window, with_circuit_breaker

    @retry(max_attempts=3, delay=1.0, backoff=2.0)
    def capture_window(...): ...

    window = wait_for_window(find_func, max_wait=60, interval=2)
"""

import time
import logging
import functools
from typing import Callable, TypeVar, Tuple, Optional

logger = logging.getLogger(__name__)

T = TypeVar("T")


# ──────────────────────────────────────────────
# 通用重试装饰器（指数退避）
# ──────────────────────────────────────────────
def retry(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: Tuple = (Exception,),
    on_fail: Optional[Callable[[Exception, int], None]] = None,
):
    """
    通用重试装饰器。

    Args:
        max_attempts: 最多重试次数（含首次）
        delay: 首次失败后等待秒数
        backoff: 每次重试的退避倍数 (delay *= backoff)
        exceptions: 触发重试的异常类型
        on_fail: 每次失败时的回调 (exception, attempt_number)
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> T:
            current_delay = delay
            last_exc = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exc = e
                    if on_fail:
                        on_fail(e, attempt)
                    else:
                        logger.warning(
                            "%s 第 %d/%d 次失败: %s，%.1fs 后重试",
                            func.__name__,
                            attempt,
                            max_attempts,
                            e,
                            current_delay,
                        )
                    if attempt < max_attempts:
                        time.sleep(current_delay)
                        current_delay *= backoff
            raise last_exc  # type: ignore[misc]

        return wrapper

    return decorator


# ──────────────────────────────────────────────
# 窗口等待（轮询）
# ──────────────────────────────────────────────
def wait_for_window(
    find_func: Callable[[], Optional[object]],
    window_name: str = "目标窗口",
    max_wait: int = 60,
    interval: float = 2.0,
) -> object:
    """
    轮询等待窗口出现，替代启动时直接 raise。

    Args:
        find_func: 返回窗口对象或 None 的查找函数
        window_name: 日志中显示的窗口名称
        max_wait: 最长等待秒数
        interval: 轮询间隔秒数

    Returns:
        窗口对象

    Raises:
        RuntimeError: 超时未找到窗口
    """
    elapsed = 0.0
    while elapsed < max_wait:
        win = find_func()
        if win is not None:
            logger.info("%s 已就绪 (等待 %.1fs)", window_name, elapsed)
            return win
        if elapsed == 0:
            logger.info("等待 %s 出现...", window_name)
        time.sleep(interval)
        elapsed += interval
    raise RuntimeError(f"{window_name} 在 {max_wait}s 内未出现")


# ──────────────────────────────────────────────
# 熔断器
# ──────────────────────────────────────────────
class CircuitBreaker:
    """
    连续失败熔断器。

    连续失败达到 threshold 次后进入 "open" 状态，
    暂停 reset_timeout 秒后再尝试（半开）。
    用于避免窗口长时间消失时无效轮询。
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        reset_timeout: float = 60.0,
        name: str = "default",
    ):
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.name = name
        self._failures = 0
        self._last_fail_time = 0.0

    @property
    def is_open(self) -> bool:
        """是否处于熔断状态"""
        if self._failures >= self.failure_threshold:
            if time.time() - self._last_fail_time < self.reset_timeout:
                return True
            # 超时，半开
            self._failures = 0
        return False

    def record_success(self):
        self._failures = 0

    def record_failure(self):
        self._failures += 1
        self._last_fail_time = time.time()
        if self._failures == self.failure_threshold:
            logger.error(
                "[%s] 连续失败 %d 次，熔断 %.0fs",
                self.name,
                self._failures,
                self.reset_timeout,
            )


# ──────────────────────────────────────────────
# 带熔断的执行
# ──────────────────────────────────────────────
def with_circuit_breaker(breaker: CircuitBreaker):
    """装饰器：函数失败时记录到熔断器，熔断时跳过执行"""

    def decorator(func: Callable[..., T]) -> Callable[..., Optional[T]]:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Optional[T]:
            if breaker.is_open:
                logger.debug("[%s] 熔断中，跳过 %s", breaker.name, func.__name__)
                return None
            try:
                result = func(*args, **kwargs)
                breaker.record_success()
                return result
            except Exception as e:
                breaker.record_failure()
                raise

        return wrapper

    return decorator
