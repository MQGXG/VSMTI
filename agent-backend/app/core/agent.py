"""Agent ReAct 循环 — 集成 Hook + 权限 + TodoWrite + 错误恢复 + 通知队列 + 消息规范化"""

import json
import logging
import asyncio
import os
from typing import AsyncIterable

from app.core.llm import BaseLLM
from app.core.events import (
    LLMEvent, ContentDeltaEvent, ToolCallStartEvent,
    ToolCallDeltaEvent, ToolCallFinishEvent, FinishEvent, ErrorEvent,
    StreamEvent, ToolResultEvent, ToolErrorEvent,
)
from app.core.modes import AgentMode, get_mode_config, filter_tools_by_mode
from app.core.hooks import hooks
from app.core.permission import need_user_approval
from app.core import compaction as compact
from app.core import memory_manager as memory
from app.core import prompt_builder
from app.core.normalize import normalize_messages
from app.core.recovery import RecoveryState, choose_recovery, retry_delay, CONTINUE_MESSAGE
from app.core.permission_store import create_request as create_perm_request
from app.core.permission_store import wait_for_response as wait_perm_response
from app.tools.registry import ToolRegistry
from app.tools.todo_write import CURRENT_TODOS
from app.tools.task_tool import TaskTool
from app.core.skill_manager import list_skills
from app.core.workspace import workspace
from app.prompts.system import SYSTEM_PROMPT
from app.core import background as bg
from app.tools.question_tool import drain_pending_questions
from app.core.question_store import wait_for_answer as wait_question_answer

logger = logging.getLogger(__name__)


class Agent:
    """ReAct Agent — 完整管线 + 结构化错误恢复 + 后台通知 + 消息规范化"""

    def __init__(
        self,
        llm: BaseLLM,
        tools: ToolRegistry,
        mode: AgentMode = AgentMode.ASSISTANT,
        primary_model: str = "",
        fallback_model: str = "",
    ):
        self.llm = llm
        self.tools = tools
        self.mode = mode
        self.config = get_mode_config(mode)
        self.todo_rounds_since_update = 0
        self.recovery = RecoveryState(primary=primary_model, fallback=fallback_model)
        self._register_subagent_tool()

    def _register_subagent_tool(self):
        task_tool = TaskTool(self.llm, self.tools)
        existing = self.tools.get("task")
        if existing:
            self.tools._tools["task"] = task_tool
        else:
            self.tools.register(task_tool)
        logger.debug("Subagent tool registered")

    def set_mode(self, mode: AgentMode | str):
        if isinstance(mode, str):
            mode = AgentMode(mode)
        self.mode = mode
        self.config = get_mode_config(mode)
        logger.info("Agent mode switched to %s", mode.value)

    def _build_system_prompt(self) -> str:
        context = {"mode": self.mode.value, "todos": len(CURRENT_TODOS)}
        cached = prompt_builder.get_cached_prompt(context)
        if cached:
            return cached

        tool_names = [t.get("function", {}).get("name", "?") for t in (self._get_available_tools() or [])]
        tools_desc = "\n".join(f"- {name}" for name in tool_names) if tool_names else "无"
        suffix = self.config.system_prompt_suffix or ""
        skills_catalog = list_skills()
        prompt = prompt_builder.assemble_system_prompt(
            tools_desc=tools_desc,
            workspace=f"工作目录: {workspace.path}",
            skills_catalog=skills_catalog,
            mode_suffix=suffix,
            todos=CURRENT_TODOS if CURRENT_TODOS else None,
        )
        prompt_builder.set_cached_prompt(context, prompt)
        return prompt

    def _get_available_tools(self) -> list[dict] | None:
        all_tools = self.tools.all_schemas()
        if not self.llm.supports_tools:
            return None
        return filter_tools_by_mode(all_tools, self.mode)

    def _has_tool_use(self, content: list) -> bool:
        for block in content:
            if getattr(block, "type", None) == "tool_use":
                return True
            if isinstance(block, dict) and block.get("type") == "tool_use":
                return True
        return False

    async def _llm_summary_call(self, prompt: str) -> str:
        try:
            result = ""
            async for event in self.llm.chat_stream(
                [{"role": "user", "content": prompt}], tools=None
            ):
                if isinstance(event, ContentDeltaEvent):
                    result += event.text
            return result
        except Exception as e:
            logger.warning("摘要生成失败: %s", e)
            return ""

    def _convert_llm_event(self, event: LLMEvent) -> StreamEvent | None:
        if isinstance(event, ContentDeltaEvent):
            return StreamEvent.content(event.text)
        elif isinstance(event, ToolCallStartEvent):
            return StreamEvent(type="tool_start", data={"id": event.tool_call_id, "name": event.name})
        elif isinstance(event, ToolCallDeltaEvent):
            return StreamEvent(type="tool_delta", data={"id": event.tool_call_id, "arguments_delta": event.arguments_delta})
        elif isinstance(event, ToolCallFinishEvent):
            try:
                args = json.loads(event.arguments) if event.arguments else {}
            except json.JSONDecodeError:
                args = {"raw": event.arguments}
            return StreamEvent.tool_start(event.name, args)
        elif isinstance(event, ToolResultEvent):
            return StreamEvent.tool_result(event.name, event.output, event.success)
        elif isinstance(event, ToolErrorEvent):
            return StreamEvent(type="tool_error", data={"name": event.name, "error": event.error})
        elif isinstance(event, FinishEvent):
            return StreamEvent.finish(event.reason)
        elif isinstance(event, ErrorEvent):
            return StreamEvent.error(event.error)
        return None

    async def run(
        self,
        user_message: str,
        history: list[dict] | None = None,
    ) -> AsyncIterable[StreamEvent]:
        # UserPromptSubmit hook
        modified = await hooks.trigger("UserPromptSubmit", user_message)
        final_message = modified or user_message

        messages = [
            {"role": "system", "content": self._build_system_prompt()},
            *(history or []),
            {"role": "user", "content": final_message},
        ]

        tools = self._get_available_tools()
        max_iter = self.config.max_iterations
        consolidation_counter = 0
        self.recovery = RecoveryState()  # 每次 run 重置恢复状态

        for iteration in range(max_iter):
            logger.debug("Agent iteration %d/%d, mode=%s", iteration + 1, max_iter, self.mode.value)

            # Step 1: 排空后台通知队列，注入消息历史
            notifications = bg.drain_notifications()
            if notifications:
                text_lines = []
                for n in notifications:
                    text_lines.append(
                        f"[bg:{n['task_id']}] {n['name']} — {n['status']}\n预览: {n['preview']}"
                    )
                messages.append({
                    "role": "user",
                    "content": "后台任务结果:\n" + "\n\n".join(text_lines),
                })

            # Step 2: 上下文压缩管线
            messages = await compact.run_compaction_pipeline(messages, self._llm_summary_call)

            # Step 3: 加载相关记忆
            memories_content = await memory.load_relevant_memories(messages, self._llm_summary_call)

            # Step 4: TodoWrite 提醒
            request_messages = list(messages)
            if self.todo_rounds_since_update >= 3 and request_messages:
                request_messages.append({"role": "user", "content": "<提醒>请更新你的任务列表 (todo_write)。</提醒>"})
                self.todo_rounds_since_update = 0

            # Step 5: 消息规范化（发送前清理）
            clean_messages = normalize_messages(request_messages)

            # Step 6: LLM 调用（带错误恢复）
            pending_tool_calls: list[dict] = []
            current_content = ""
            finish_reason = None
            llm_error = None
            while True:
                try:
                    async for event in self.llm.chat_stream(clean_messages, tools=tools):
                        sse = self._convert_llm_event(event)
                        if sse:
                            yield sse

                        if isinstance(event, ContentDeltaEvent):
                            current_content += event.text
                        elif isinstance(event, ToolCallFinishEvent):
                            pending_tool_calls.append({
                                "id": event.tool_call_id,
                                "name": event.name,
                                "arguments": event.arguments,
                            })
                        elif isinstance(event, FinishEvent):
                            finish_reason = event.reason
                        elif isinstance(event, ErrorEvent):
                            llm_error = event.error

                    # LLM 调用成功，跳出重试循环
                    break

                except Exception as e:
                    llm_error = str(e)

                # 错误恢复决策
                decision = choose_recovery(finish_reason, llm_error, self.recovery)

                if decision["kind"] == "escalate":
                    logger.info("[Recovery] escalate max_tokens")
                    self.recovery.has_escalated = True
                    continue

                if decision["kind"] == "continue":
                    logger.info("[Recovery] continue (attempt %d/3)", self.recovery.continuation_attempts + 1)
                    self.recovery.continuation_attempts += 1
                    clean_messages.append({"role": "user", "content": CONTINUE_MESSAGE})
                    continue

                if decision["kind"] == "compact":
                    logger.info("[Recovery] reactive compact (attempt %d/2)", self.recovery.compact_attempts + 1)
                    self.recovery.compact_attempts += 1
                    clean_messages = await compact.reactive_compact(messages, self._llm_summary_call)
                    continue

                if decision["kind"] == "backoff":
                    delay = retry_delay(self.recovery.backoff_attempts)
                    logger.info("[Recovery] backoff %.1fs (attempt %d/3)", delay, self.recovery.backoff_attempts + 1)
                    self.recovery.backoff_attempts += 1
                    await asyncio.sleep(delay)
                    continue

                if decision["kind"] == "fallback":
                    logger.info("[Recovery] fallback model")
                    # 通知前端模型切换
                    yield StreamEvent(type="model_fallback", data={"model": self.recovery.fallback_model})
                    self.recovery.backoff_attempts = 0
                    continue

                # fail
                logger.error("[Recovery] unrecoverable: %s", decision["reason"])
                yield StreamEvent.error(f"LLM 错误: {llm_error} (恢复失败: {decision['reason']})")
                return

            # 重试：跳过本轮
            if finish_reason is None and not pending_tool_calls:
                continue

            # 没有工具调用，结束
            if not pending_tool_calls:
                await memory.extract_memories(messages, self._llm_summary_call)
                yield StreamEvent.finish(finish_reason or "stop")
                await hooks.trigger("Stop", messages)
                return

            # 将 assistant 回复加入历史
            assistant_msg: dict = {"role": "assistant"}
            if current_content:
                assistant_msg["content"] = current_content
            if pending_tool_calls:
                assistant_msg["tool_calls"] = [
                    {"id": tc["id"], "type": "function",
                     "function": {"name": tc["name"], "arguments": tc["arguments"]}}
                    for tc in pending_tool_calls
                ]
            messages.append(assistant_msg)

            # 执行工具
            for tc in pending_tool_calls:
                name = tc["name"]
                try:
                    args = json.loads(tc["arguments"]) if tc["arguments"] else {}
                except json.JSONDecodeError:
                    err_msg = f"工具参数 JSON 解析失败: {tc['arguments'][:200]}"
                    logger.warning(err_msg)
                    yield StreamEvent.error(f"[{name}] {err_msg}")
                    messages.append({"role": "tool", "tool_call_id": tc["id"], "content": f"Error: {err_msg}"})
                    continue

                # PreToolUse hook（权限闸门）
                blocked = await hooks.trigger("PreToolUse", tc)
                if blocked:
                    logger.warning("工具需要审批: %s — %s", name, blocked)
                    req_id = create_perm_request()
                    yield StreamEvent.permission_request(name, args, str(blocked), req_id)
                    approved = await wait_perm_response(req_id)
                    if not approved:
                        logger.warning("工具调用被拒绝: %s", name)
                        yield StreamEvent(type="tool_error", data={"name": name, "error": f"权限拒绝: {blocked}"})
                        messages.append({"role": "tool", "tool_call_id": tc["id"], "content": f"Error: 权限拒绝: {blocked}"})
                        continue

                # 执行工具
                logger.info("Executing tool: %s", name)
                result = await self.tools.execute(name, args)

                # PostToolUse hook
                await hooks.trigger("PostToolUse", tc, result)

                # TodoWrite 计数
                if name == "todo_write":
                    self.todo_rounds_since_update = 0
                else:
                    self.todo_rounds_since_update += 1

                if result.success:
                    yield StreamEvent.tool_result(name, result.output)
                    messages.append({"role": "tool", "tool_call_id": tc["id"], "content": result.output})
                else:
                    err_output = f"Error executing {name}: {result.error or 'Unknown error'}"
                    logger.warning(err_output)
                    yield StreamEvent(type="tool_error", data={"name": name, "error": err_output})
                    messages.append({"role": "tool", "tool_call_id": tc["id"], "content": err_output})

                # 排空 question 工具产生的待处理问题
                pending_questions = drain_pending_questions()
                for q in pending_questions:
                    yield StreamEvent.question(q["question"], q["options"], q["request_id"])
                    answer = await wait_question_answer(q["request_id"])
                    if answer:
                        yield StreamEvent.question_result(q["request_id"], answer)

            # 每轮结束提取记忆
            await memory.extract_memories(messages, self._llm_summary_call)
            consolidation_counter += 1
            if consolidation_counter % 5 == 0:
                await memory.consolidate_memories(self._llm_summary_call)

            # 重置退避计数（成功一轮）
            self.recovery.reset_backoff()

        yield StreamEvent.error(f"达到最大迭代次数 ({max_iter})，任务未完成。")
        yield StreamEvent.finish("length")
