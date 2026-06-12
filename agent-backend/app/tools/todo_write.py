"""TodoWrite 工具 — 计划管理"""

import json
import logging

from app.tools.base import BaseTool, ToolParam, ToolResult

logger = logging.getLogger(__name__)

CURRENT_TODOS: list[dict] = []


class TodoWriteTool(BaseTool):
    @property
    def name(self) -> str:
        return "todo_write"

    @property
    def description(self) -> str:
        return "创建和管理任务列表。在开始多步骤任务前先用此工具列出步骤，每完成一步更新状态。"

    @property
    def parameters(self) -> list[ToolParam]:
        return [
            ToolParam(
                name="todos",
                type="array",
                description="任务列表，每项含 content(任务描述)和 status(pending/in_progress/completed)",
            ),
        ]

    async def execute(self, **kwargs) -> ToolResult:
        global CURRENT_TODOS
        todos = kwargs.get("todos", [])
        if isinstance(todos, str):
            try:
                todos = json.loads(todos)
            except json.JSONDecodeError:
                return ToolResult(success=False, output="", error="todos 必须是 JSON 数组")
        if not isinstance(todos, list):
            return ToolResult(success=False, output="", error="todos 必须是数组")
        for i, t in enumerate(todos):
            if not isinstance(t, dict) or "content" not in t or "status" not in t:
                return ToolResult(
                    success=False, output="",
                    error=f"todos[{i}] 必须含 content 和 status",
                )
            if t["status"] not in ("pending", "in_progress", "completed"):
                return ToolResult(
                    success=False, output="",
                    error=f"todos[{i}] 非法状态: {t['status']}，可选: pending/in_progress/completed",
                )
        CURRENT_TODOS = todos
        status_line = ", ".join(f"「{t['content']}」[{t['status']}]" for t in todos)
        logger.info("[TodoWrite] 已更新 %d 个任务: %s", len(todos), status_line)
        return ToolResult(success=True, output=f"已更新 {len(todos)} 个任务")

    def to_openai_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "todos": {
                            "type": "array",
                            "description": "任务列表",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "content": {
                                        "type": "string",
                                        "description": "任务内容描述",
                                    },
                                    "status": {
                                        "type": "string",
                                        "enum": ["pending", "in_progress", "completed"],
                                        "description": "任务状态",
                                    },
                                },
                                "required": ["content", "status"],
                            },
                        },
                    },
                    "required": ["todos"],
                },
            },
        }

    def to_claude_schema(self) -> dict:
        s = self.to_openai_schema()
        fn = s["function"]
        return {
            "name": fn["name"],
            "description": fn["description"],
            "input_schema": fn["parameters"],
        }
