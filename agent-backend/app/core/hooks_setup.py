"""默认钩子注册 — 权限检查、日志记录"""

import logging

from app.core.hooks import hooks
from app.core.permission import need_user_approval

logger = logging.getLogger(__name__)


async def log_user_prompt(query: str) -> None:
    """UserPromptSubmit: 记录用户输入"""
    logger.info("[Hook] 用户输入: %s", query[:100])


async def permission_check(tc: dict) -> str | None:
    """PreToolUse: 权限闸门检查"""
    name = tc.get("name", "")
    try:
        import json
        args = json.loads(tc.get("arguments", "{}")) if tc.get("arguments") else {}
    except (json.JSONDecodeError, TypeError):
        args = {}
    reason = need_user_approval(name, args)
    if reason:
        logger.warning("[Hook] 权限拦截: %s — %s", name, reason)
        return f"权限拒绝: {reason}"
    return None


async def log_tool_call(tc: dict) -> None:
    """PreToolUse: 记录工具调用"""
    name = tc.get("name", "")
    logger.info("[Hook] 工具调用: %s", name)


async def log_tool_result(tc: dict, result) -> None:
    """PostToolUse: 记录工具执行结果"""
    name = tc.get("name", "")
    logger.info("[Hook] 工具完成: %s, success=%s", name, getattr(result, 'success', '?'))


async def log_stop(messages: list) -> None:
    """Stop: 记录会话统计"""
    logger.info("[Hook] 循环结束, 消息数: %d", len(messages))


def setup_default_hooks():
    """注册所有默认钩子"""
    hooks.register("UserPromptSubmit", log_user_prompt)
    hooks.register("PreToolUse", permission_check)
    hooks.register("PreToolUse", log_tool_call)
    hooks.register("PostToolUse", log_tool_result)
    hooks.register("Stop", log_stop)
    logger.info("默认钩子注册完成: %s", hooks.events)
