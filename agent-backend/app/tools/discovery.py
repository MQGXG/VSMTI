"""工具自动发现 — 扫描目录，自动注册所有 BaseTool 子类"""

import importlib
import inspect
import logging
import pkgutil
from pathlib import Path

from app.tools.base import BaseTool
from app.tools.registry import tool_registry

logger = logging.getLogger(__name__)


def _is_tool_module(name: str) -> bool:
    """排除非工具模块"""
    skip = {"__init__", "base", "registry", "discovery", "schema_tool"}
    return name not in skip and not name.startswith("_")


def auto_register():
    """扫描 app/tools 目录，自动注册所有 BaseTool 子类"""
    import app.tools as tools_pkg

    count = 0
    for importer, modname, ispkg in pkgutil.iter_modules(tools_pkg.__path__):
        if ispkg or not _is_tool_module(modname):
            continue
        try:
            module = importlib.import_module(f"app.tools.{modname}")
        except Exception as e:
            logger.warning("导入工具模块 %s 失败: %s", modname, e)
            continue

        for name, obj in inspect.getmembers(module):
            if (inspect.isclass(obj) and issubclass(obj, BaseTool)
                    and obj is not BaseTool and not inspect.isabstract(obj)):
                try:
                    instance = obj()
                    tool_registry.register(instance)
                    count += 1
                    logger.debug("自动注册工具: %s (%s)", instance.name, modname)
                except Exception as e:
                    logger.warning("注册工具 %s 失败: %s", name, e)

    logger.info("工具自动注册完成: %d 个", count)
    return count
