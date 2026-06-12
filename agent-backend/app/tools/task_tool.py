"""Task 工具 — 子智能体 (Subagent)"""

import json
import logging
from typing import AsyncIterable

from app.tools.base import BaseTool, ToolParam, ToolResult
from app.core.llm import BaseLLM
from app.core.hooks import hooks
from app.core.permission import need_user_approval
from app.tools.registry import ToolRegistry

logger = logging.getLogger(__name__)

SUBAGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": "执行 shell 命令",
            "parameters": {
                "type": "object",
                "properties": {"command": {"type": "string"}},
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "读取文件内容",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "写入文件内容",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "glob",
            "description": "按 glob 模式查找文件",
            "parameters": {
                "type": "object",
                "properties": {"pattern": {"type": "string"}},
                "required": ["pattern"],
            },
        },
    },
]

SUBAGENT_SYSTEM_PROMPT = """你是子智能体，专注于完成分配给你的子任务。
完成工作后返回一个简洁的摘要。
不要进一步委派子任务。"""


async def _run_subagent_loop(
    llm: BaseLLM,
    tool_registry: ToolRegistry,
    description: str,
    max_rounds: int = 30,
) -> str:
    """运行子智能体循环，返回最终文本摘要"""
    messages = [{"role": "user", "content": description}]

    for _ in range(max_rounds):
        pending_calls = []
        content_text = ""

        try:
            async for event in llm.chat_stream(messages, tools=SUBAGENT_TOOLS):
                from app.core.events import (
                    ContentDeltaEvent, ToolCallFinishEvent, FinishEvent, ErrorEvent,
                )
                if isinstance(event, ContentDeltaEvent):
                    content_text += event.text
                elif isinstance(event, ToolCallFinishEvent):
                    pending_calls.append(event)
                elif isinstance(event, FinishEvent):
                    pass
                elif isinstance(event, ErrorEvent):
                    logger.warning("Subagent LLM error: %s", event.error)
                    return f"子智能体错误: {event.error}"
        except Exception as e:
            logger.exception("Subagent loop error")
            return f"子智能体异常: {e}"

        assistant_msg = {"role": "assistant"}
        if content_text:
            assistant_msg["content"] = content_text
        if pending_calls:
            assistant_msg["tool_calls"] = [
                {"id": c.tool_call_id, "type": "function",
                 "function": {"name": c.name, "arguments": c.arguments}}
                for c in pending_calls
            ]
        messages.append(assistant_msg)

        if not pending_calls:
            return content_text or "(子智能体无输出)"

        # 执行工具
        tc_list = [
            {"id": c.tool_call_id, "name": c.name, "arguments": c.arguments}
            for c in pending_calls
        ]

        for tc in tc_list:
            name = tc["name"]
            try:
                args = json.loads(tc["arguments"]) if tc["arguments"] else {}
            except json.JSONDecodeError:
                messages.append({"role": "tool", "tool_call_id": tc["id"], "content": "参数错误"})
                continue

            blocked = await hooks.trigger("PreToolUse", tc)
            if blocked:
                messages.append({"role": "tool", "tool_call_id": tc["id"], "content": f"权限拒绝: {blocked}"})
                continue

            result = await tool_registry.execute(name, args)
            await hooks.trigger("PostToolUse", tc, result)
            output = result.output if result.success else f"错误: {result.error}"
            messages.append({"role": "tool", "tool_call_id": tc["id"], "content": output})

    return "(子智能体达到最大轮次)"



class TaskTool(BaseTool):
    """子智能体工具 — 派生子任务并收集结果"""

    def __init__(self, llm: BaseLLM, tool_registry: ToolRegistry):
        self._llm = llm
        self._tool_registry = tool_registry

    @property
    def name(self) -> str:
        return "task"

    @property
    def description(self) -> str:
        return "启动一个子智能体处理复杂子任务。子智能体有独立上下文，完成后只返回最终结论。"

    @property
    def parameters(self) -> list[ToolParam]:
        return [
            ToolParam(
                name="description",
                type="string",
                description="子任务的详细描述，包括目标和约束",
            ),
        ]

    async def execute(self, **kwargs) -> ToolResult:
        description = kwargs.get("description", "")
        if not description:
            return ToolResult(success=False, output="", error="description 不能为空")

        logger.info("[Subagent] 启动子智能体: %s", description[:100])
        summary = await _run_subagent_loop(self._llm, self._tool_registry, description)
        logger.info("[Subagent] 完成: %s", summary[:100])
        return ToolResult(success=True, output=summary)

    def to_openai_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "description": {
                            "type": "string",
                            "description": "子任务的详细描述，包括目标和约束",
                        },
                    },
                    "required": ["description"],
                },
            },
        }

    def to_claude_schema(self) -> dict:
        s = self.to_openai_schema()
        fn = s["function"]
        return {"name": fn["name"], "description": fn["description"], "input_schema": fn["parameters"]}
