"""LoadSkill 工具 — 按需加载技能内容"""

from app.tools.base import BaseTool, ToolParam, ToolResult
from app.core.skill_manager import load_skill, list_skills


class LoadSkillTool(BaseTool):
    @property
    def name(self) -> str:
        return "load_skill"

    @property
    def description(self) -> str:
        return "按名称加载技能的完整内容。技能目录已包含在系统提示词中，需要完整内容时调用此工具。"

    @property
    def parameters(self) -> list[ToolParam]:
        return [
            ToolParam(name="name", type="string", description="技能名称"),
        ]

    async def execute(self, **kwargs) -> ToolResult:
        name = kwargs.get("name", "")
        if not name:
            return ToolResult(success=False, output="", error="name 不能为空")
        content = load_skill(name)
        if content is None:
            return ToolResult(success=False, output="", error=f"未找到技能: {name}")
        return ToolResult(success=True, output=content)

    def to_openai_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "技能名称"},
                    },
                    "required": ["name"],
                },
            },
        }

    def to_claude_schema(self) -> dict:
        s = self.to_openai_schema()
        fn = s["function"]
        return {"name": fn["name"], "description": fn["description"], "input_schema": fn["parameters"]}
