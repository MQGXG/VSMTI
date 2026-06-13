"""工具注册表 — 借鉴 OpenCode 设计，支持分类、权限、上下文"""

import asyncio
import logging
from typing import Callable
from app.tools.base import BaseTool, ToolResult, ToolContext, ToolMeta
from app.core.modes import AgentMode, get_mode_config

logger = logging.getLogger(__name__)


class ToolRegistry:
    """工具注册表 — 管理所有工具的注册、查询、执行"""

    def __init__(self):
        self._tools: dict[str, BaseTool] = {}
        self._hooks: dict[str, list[Callable]] = {
            "before_execute": [],
            "after_execute": [],
            "on_error": [],
        }

    def register(self, tool: BaseTool):
        """注册工具"""
        if tool.name in self._tools:
            logger.warning("工具 '%s' 已存在，将被覆盖", tool.name)
        self._tools[tool.name] = tool
        logger.debug("注册工具: %s (%s)", tool.name, tool.meta.tags)

    def unregister(self, name: str):
        """注销工具"""
        self._tools.pop(name, None)

    def get(self, name: str) -> BaseTool | None:
        """获取工具"""
        return self._tools.get(name)

    def has(self, name: str) -> bool:
        """检查工具是否存在"""
        return name in self._tools

    def all(self) -> list[BaseTool]:
        """获取所有工具"""
        return list(self._tools.values())

    def all_schemas(self) -> list[dict]:
        """获取所有工具的 OpenAI schema"""
        return [t.to_openai_schema() for t in self._tools.values()]

    def all_claude_schemas(self) -> list[dict]:
        """获取所有工具的 Claude schema"""
        return [t.to_claude_schema() for t in self._tools.values()]

    def by_tag(self, tag: str) -> list[BaseTool]:
        """按标签筛选工具"""
        return [t for t in self._tools.values() if tag in t.meta.tags]

    def by_permission(self, permission: str) -> list[BaseTool]:
        """按权限组筛选工具"""
        return [t for t in self._tools.values() if t.meta.permission == permission]

    def readonly_tools(self) -> list[BaseTool]:
        """获取只读工具"""
        return [t for t in self._tools.values() if t.meta.readonly]

    def dangerous_tools(self) -> list[BaseTool]:
        """获取危险工具"""
        return [t for t in self._tools.values() if t.meta.dangerous]

    def get_schemas_for_mode(self, mode: AgentMode | str) -> list[dict]:
        """获取指定模式允许的工具 schema"""
        config = get_mode_config(mode)
        all_schemas = self.all_schemas()
        if not config.allowed_tools:
            return all_schemas
        allowed = set(config.allowed_tools)
        return [s for s in all_schemas if s.get("function", {}).get("name") in allowed]

    def get_tools_for_mode(self, mode: AgentMode | str) -> list[BaseTool]:
        """获取指定模式允许的工具实例"""
        config = get_mode_config(mode)
        if not config.allowed_tools:
            return list(self._tools.values())
        allowed = set(config.allowed_tools)
        return [t for t in self._tools.values() if t.name in allowed]

    def is_tool_allowed(self, name: str, mode: AgentMode | str) -> bool:
        """检查工具在当前模式下是否允许"""
        config = get_mode_config(mode)
        if not config.allowed_tools:
            return True
        return name in config.allowed_tools

    def on(self, event: str, callback: Callable):
        """注册钩子"""
        if event in self._hooks:
            self._hooks[event].append(callback)

    async def execute(
        self,
        name: str,
        args: dict,
        context: ToolContext | None = None,
        timeout: float = 120,
        max_output: int = 50000,
    ) -> ToolResult:
        """执行工具（带钩子 + 超时 + 输出截断）"""
        tool = self._tools.get(name)
        if not tool:
            return ToolResult(success=False, error=f"未知工具: {name}")

        valid, err_msg = tool.validate_args(args)
        if not valid:
            return ToolResult(success=False, error=err_msg)

        for hook in self._hooks.get("before_execute", []):
            try:
                await hook(name, args, context)
            except Exception as e:
                logger.warning("before_execute 钩子错误: %s", e)

        try:
            result = await asyncio.wait_for(
                tool.execute(context=context, **args),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            logger.error("工具 '%s' 执行超时 (%ss)", name, timeout)
            result = ToolResult(success=False, error=f"工具 {name} 执行超时 ({timeout}s)")
        except Exception as e:
            logger.error("工具 '%s' 执行异常: %s", name, e)
            result = ToolResult(success=False, error=str(e))

            for hook in self._hooks.get("on_error", []):
                try:
                    await hook(name, args, e, context)
                except Exception:
                    pass

        if result.output and len(result.output) > max_output:
            result.output = result.output[:max_output] + f"\n\n...(输出过长，截断至 {max_output} 字符，共 {len(result.output)} 字符)"

        for hook in self._hooks.get("after_execute", []):
            try:
                await hook(name, args, result, context)
            except Exception as e:
                logger.warning("after_execute 钩子错误: %s", e)

        return result

    def stats(self) -> dict:
        """获取工具统计"""
        return {
            "total": len(self._tools),
            "readonly": len(self.readonly_tools()),
            "dangerous": len(self.dangerous_tools()),
            "by_tag": {
                tag: len(self.by_tag(tag))
                for tag in set(t for tool in self._tools.values() for t in tool.meta.tags)
            },
        }


# 全局工具注册表
tool_registry = ToolRegistry()
