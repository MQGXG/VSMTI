"""团队工具 — spawn_teammate / send_message / check_inbox / request_shutdown / review_plan"""

import os
from app.tools.base import BaseTool, ToolParam, ToolResult
from app.core.team_bus import bus, create_request, resolve_request, get_request
from app.core.teammate_runner import spawn as spawn_teammate_thread


class SpawnTeammateTool(BaseTool):
    @property
    def name(self) -> str:
        return "spawn_teammate"

    @property
    def description(self) -> str:
        return "启动一个队友线程并行执行任务"

    @property
    def parameters(self) -> list[ToolParam]:
        return [
            ToolParam(name="name", type="string", description="队友名称"),
            ToolParam(name="role", type="string", description="角色描述"),
            ToolParam(name="prompt", type="string", description="初始任务"),
            ToolParam(name="api_key", type="string", description="API Key (可选)", required=False),
            ToolParam(name="base_url", type="string", description="API Base URL (可选)", required=False),
            ToolParam(name="model", type="string", description="模型名称 (可选)", required=False),
        ]

    async def execute(self, **kwargs) -> ToolResult:
        name = kwargs.get("name", "")
        role = kwargs.get("role", "")
        prompt = kwargs.get("prompt", "")
        if not all([name, role, prompt]):
            return ToolResult(success=False, output="", error="name/role/prompt 不能为空")
        api_key = kwargs.get("api_key") or os.getenv("ANTHROPIC_API_KEY", "")
        base_url = kwargs.get("base_url") or os.getenv("ANTHROPIC_BASE_URL", "")
        model = kwargs.get("model") or os.getenv("MODEL_ID", "claude-sonnet-4-20250514")
        result = spawn_teammate_thread(name, role, prompt, api_key, base_url, model)
        return ToolResult(success=True, output=result)


class SendMessageTool(BaseTool):
    @property
    def name(self) -> str:
        return "send_message"

    @property
    def description(self) -> str:
        return "向其他 Agent 发送消息"

    @property
    def parameters(self) -> list[ToolParam]:
        return [
            ToolParam(name="to", type="string", description="接收者"),
            ToolParam(name="content", type="string", description="消息内容"),
        ]

    async def execute(self, **kwargs) -> ToolResult:
        to = kwargs.get("to", "")
        content = kwargs.get("content", "")
        if not to or not content:
            return ToolResult(success=False, output="", error="to 和 content 不能为空")
        result = bus.send("lead", to, content)
        return ToolResult(success=True, output=result)


class CheckInboxTool(BaseTool):
    @property
    def name(self) -> str:
        return "check_inbox"

    @property
    def description(self) -> str:
        return "检查 Lead 的收件箱"

    @property
    def parameters(self) -> list[ToolParam]:
        return []

    async def execute(self, **kwargs) -> ToolResult:
        msgs = bus.read_inbox("lead")
        if not msgs:
            return ToolResult(success=True, output="(收件箱为空)")
        lines = []
        for m in msgs:
            req_id = m.get("metadata", {}).get("request_id", "")
            tag = f" [{m['type']} #{req_id}]" if req_id else f" [{m['type']}]"
            lines.append(f"[{m['from']}]{tag} {m['content'][:200]}")
        return ToolResult(success=True, output="\n".join(lines))


class RequestShutdownTool(BaseTool):
    @property
    def name(self) -> str:
        return "request_shutdown"

    @property
    def description(self) -> str:
        return "请求队友体面关机"

    @property
    def parameters(self) -> list[ToolParam]:
        return [ToolParam(name="teammate", type="string", description="队友名称")]

    async def execute(self, **kwargs) -> ToolResult:
        teammate = kwargs.get("teammate", "")
        if not teammate:
            return ToolResult(success=False, output="", error="teammate 不能为空")
        req_id = create_request("shutdown", "lead", teammate)
        bus.send("lead", teammate, "请体面关机。", "shutdown_request", {"request_id": req_id})
        return ToolResult(success=True, output=f"关机请求已发送至 {teammate} ({req_id})")


class RequestPlanTool(BaseTool):
    @property
    def name(self) -> str:
        return "request_plan"

    @property
    def description(self) -> str:
        return "要求队友提交计划供审批"

    @property
    def parameters(self) -> list[ToolParam]:
        return [
            ToolParam(name="teammate", type="string", description="队友名称"),
            ToolParam(name="task", type="string", description="任务描述"),
        ]

    async def execute(self, **kwargs) -> ToolResult:
        teammate = kwargs.get("teammate", "")
        task = kwargs.get("task", "")
        bus.send("lead", teammate, f"请提交计划: {task}", "plan_request")
        return ToolResult(success=True, output=f"已要求 {teammate} 提交计划")


class ReviewPlanTool(BaseTool):
    @property
    def name(self) -> str:
        return "review_plan"

    @property
    def description(self) -> str:
        return "审批队友提交的计划"

    @property
    def parameters(self) -> list[ToolParam]:
        return [
            ToolParam(name="request_id", type="string", description="请求ID"),
            ToolParam(name="approve", type="boolean", description="是否批准"),
            ToolParam(name="feedback", type="string", description="反馈意见", required=False),
        ]

    async def execute(self, **kwargs) -> ToolResult:
        req_id = kwargs.get("request_id", "")
        approve = kwargs.get("approve", False)
        feedback = kwargs.get("feedback", "")
        if resolve_request(req_id, approve):
            state = get_request(req_id)
            if state:
                bus.send("lead", state.sender, feedback or ("已批准" if approve else "已拒绝"),
                         "plan_response", {"request_id": req_id, "approve": approve})
            return ToolResult(success=True, output=f"计划 {'批准' if approve else '拒绝'} ({req_id})")
        return ToolResult(success=False, output="", error=f"请求 {req_id} 未找到或已处理")
