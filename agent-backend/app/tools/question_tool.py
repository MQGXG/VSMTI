"""Question 工具 — LLM 在执行中向用户提问"""

import json
import logging
from app.tools.base import BaseTool, ToolParam, ToolResult
from app.core.question_store import create_question, wait_for_answer

logger = logging.getLogger(__name__)

# 待处理的问题队列 (agent 循环会排空)
_pending_questions: list[dict] = []


class QuestionTool(BaseTool):
    @property
    def name(self) -> str:
        return "question"

    @property
    def description(self) -> str:
        return "在执行过程中向用户提问，收集偏好、澄清需求或获取决策"

    @property
    def parameters(self) -> list[ToolParam]:
        return [
            ToolParam(name="question", type="string", description="向用户提出的问题"),
            ToolParam(name="options", type="string", description="可选项 JSON 数组", required=False),
        ]

    async def execute(self, **kwargs) -> ToolResult:
        question = kwargs.get("question", "")
        options_raw = kwargs.get("options", "[]")

        if isinstance(options_raw, str):
            try:
                options = json.loads(options_raw)
            except json.JSONDecodeError:
                options = []
        elif isinstance(options_raw, list):
            options = options_raw
        else:
            options = []

        if not question:
            return ToolResult(success=False, error="问题不能为空")

        req_id = create_question()

        # 加入待处理队列，agent 循环会处理
        _pending_questions.append({
            "question": question,
            "options": options,
            "request_id": req_id,
        })

        answer = await wait_for_answer(req_id)
        if answer is None:
            return ToolResult(success=False, error="用户未回答（超时）")

        return ToolResult(success=True, output=f"用户回答: {answer}")


def drain_pending_questions() -> list[dict]:
    """排空待处理问题队列"""
    result = list(_pending_questions)
    _pending_questions.clear()
    return result
