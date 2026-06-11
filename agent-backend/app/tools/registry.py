from app.tools.base import BaseTool, ToolResult


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool):
        self._tools[tool.name] = tool

    def get(self, name: str) -> BaseTool | None:
        return self._tools.get(name)

    def all_schemas(self) -> list[dict]:
        return [t.to_openai_schema() for t in self._tools.values()]

    async def execute(self, name: str, args: dict) -> ToolResult:
        tool = self._tools.get(name)
        if not tool:
            return ToolResult(success=False, output="", error=f"未知工具: {name}")
        return await tool.execute(**args)


tool_registry = ToolRegistry()
