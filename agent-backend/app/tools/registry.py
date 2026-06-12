from app.tools.base import BaseTool, ToolResult
from app.core.modes import AgentMode, get_mode_config


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool):
        self._tools[tool.name] = tool

    def get(self, name: str) -> BaseTool | None:
        return self._tools.get(name)

    def all_schemas(self) -> list[dict]:
        return [t.to_openai_schema() for t in self._tools.values()]

    def all_claude_schemas(self) -> list[dict]:
        return [t.to_claude_schema() for t in self._tools.values()]

    def get_schemas_for_mode(self, mode: AgentMode | str) -> list[dict]:
        """获取指定模式允许的工具 schema"""
        config = get_mode_config(mode)
        all_schemas = self.all_schemas()
        if not config.allowed_tools:
            return all_schemas
        allowed = set(config.allowed_tools)
        return [s for s in all_schemas if s.get("function", {}).get("name") in allowed]

    def is_tool_allowed(self, name: str, mode: AgentMode | str) -> bool:
        """检查工具在当前模式下是否允许"""
        config = get_mode_config(mode)
        if not config.allowed_tools:
            return True
        return name in config.allowed_tools

    async def execute(self, name: str, args: dict) -> ToolResult:
        tool = self._tools.get(name)
        if not tool:
            return ToolResult(success=False, output="", error=f"未知工具: {name}")
        return await tool.execute(**args)


tool_registry = ToolRegistry()
