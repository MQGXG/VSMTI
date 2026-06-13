"""工具系统 — 自动发现并注册所有工具"""

from app.tools.registry import tool_registry
from app.tools.discovery import auto_register

auto_register()

__all__ = ["tool_registry"]
