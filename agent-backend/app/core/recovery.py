"""结构化错误恢复 — RecoveryState + 续写 + 退避 + fallback"""

import asyncio
import logging
import random
import time
from typing import Callable

logger = logging.getLogger(__name__)

CONTINUE_MESSAGE = (
    "输出被截断。请直接从中断处继续，不要重复已输出的内容。"
)

PRIMARY_MODEL = ""
FALLBACK_MODEL = ""


class RecoveryState:
    """恢复状态机——跟踪各路径的重试预算"""

    def __init__(self, primary: str = "", fallback: str = ""):
        self.has_escalated = False
        self.continuation_attempts = 0
        self.backoff_attempts = 0
        self.compact_attempts = 0
        self.consecutive_529 = 0
        self.has_attempted_reactive = False
        self.current_model = primary or PRIMARY_MODEL
        self.fallback_model = fallback or FALLBACK_MODEL
        self.max_continuations = 3
        self.max_backoffs = 3
        self.max_compacts = 2

    def reset_backoff(self):
        self.backoff_attempts = 0
        self.consecutive_529 = 0

    def should_fail(self) -> bool:
        return (self.continuation_attempts >= self.max_continuations
                and self.backoff_attempts >= self.max_backoffs
                and self.compact_attempts >= self.max_compacts)


def retry_delay(attempt: int, base_ms: float = 500) -> float:
    """指数退避 + 抖动"""
    sleep_ms = min(base_ms * (2 ** attempt), 32000)
    jitter = random.uniform(0, sleep_ms * 0.25)
    return (sleep_ms + jitter) / 1000


def is_rate_limit(error_text: str) -> bool:
    return any(w in error_text.lower()
               for w in ["rate_limit", "429", "too many requests"])


def is_overloaded(error_text: str) -> bool:
    return any(w in error_text.lower()
               for w in ["overloaded", "529", "service unavailable"])


def is_prompt_too_long(error_text: str) -> bool:
    return any(w in error_text.lower()
               for w in ["prompt", "too long", "context_length", "token limit"])


def is_timeout(error_text: str) -> bool:
    return any(w in error_text.lower()
               for w in ["timeout", "connection", "deadline"])


def choose_recovery(stop_reason: str | None, error_text: str | None,
                    state: RecoveryState) -> dict:
    """选择恢复路径"""
    if stop_reason == "max_tokens":
        if not state.has_escalated:
            return {"kind": "escalate", "reason": "max_tokens, escalate to 64K"}
        if state.continuation_attempts < state.max_continuations:
            return {"kind": "continue", "reason": "output truncated, inject continue prompt"}
        return {"kind": "fail", "reason": "continuation exhausted"}

    if error_text:
        err = error_text.lower()
        if is_prompt_too_long(err):
            if state.compact_attempts < state.max_compacts:
                return {"kind": "compact", "reason": "context too large, reactive compact"}
            return {"kind": "fail", "reason": "compact exhausted"}
        if is_rate_limit(err) or is_overloaded(err):
            if state.backoff_attempts < state.max_backoffs:
                return {"kind": "backoff", "reason": f"transient error: {error_text[:60]}"}
            if state.fallback_model and state.current_model != state.fallback_model:
                return {"kind": "fallback", "reason": f"switch to fallback model"}
            return {"kind": "fail", "reason": "backoff exhausted"}
        if is_timeout(err):
            if state.backoff_attempts < state.max_backoffs:
                return {"kind": "backoff", "reason": "timeout, retry"}
            return {"kind": "fail", "reason": "timeout exhausted"}

    return {"kind": "fail", "reason": "non-recoverable error"}


async def with_retry(fn: Callable, state: RecoveryState,
                     error_text: str = "") -> tuple[dict | None, str | None]:
    """带恢复逻辑的重试包装"""
    decision = choose_recovery(None, error_text, state)

    if decision["kind"] == "backoff":
        delay = retry_delay(state.backoff_attempts)
        logger.info("[Recovery] backoff %.1fs (attempt %d/3): %s",
                    delay, state.backoff_attempts + 1, decision["reason"])
        state.backoff_attempts += 1
        state.consecutive_529 += 1
        if "overloaded" in error_text.lower() or "529" in error_text:
            state.consecutive_529 += 1
        await asyncio.sleep(delay)
        if state.consecutive_529 >= 3 and state.fallback_model:
            return {"kind": "fallback", "reason": "consecutive 529, switching model"}, None
        return {"kind": "retry", "reason": "backoff done"}, None

    if decision["kind"] == "fallback":
        old_model = state.current_model
        state.current_model = state.fallback_model
        state.backoff_attempts = 0
        state.consecutive_529 = 0
        logger.info("[Recovery] fallback %s → %s", old_model, state.fallback_model)
        return {"kind": "retry", "reason": "fallback model"}, None

    if decision["kind"] == "fail":
        return None, decision["reason"]

    return decision, None
