"""Cron 调度工具 — schedule_cron / list_crons / cancel_cron"""

from app.tools.base import BaseTool, ToolParam, ToolResult
from app.core import cron_scheduler as cron


class ScheduleCronTool(BaseTool):
    @property
    def name(self) -> str:
        return "schedule_cron"

    @property
    def description(self) -> str:
        return "调度一个定时任务。cron 为五段式: 分 时 日 月 星期"

    @property
    def parameters(self) -> list[ToolParam]:
        return [
            ToolParam(name="cron", type="string", description="cron 表达式 (5段)"),
            ToolParam(name="prompt", type="string", description="触发时注入的提示"),
            ToolParam(name="recurring", type="boolean", description="是否循环 (默认true)", required=False),
            ToolParam(name="durable", type="boolean", description="是否持久化 (默认true)", required=False),
        ]

    async def execute(self, **kwargs) -> ToolResult:
        cron.ensure_running()
        result = cron.schedule(
            cron=kwargs.get("cron", ""),
            prompt=kwargs.get("prompt", ""),
            recurring=kwargs.get("recurring", True),
            durable=kwargs.get("durable", True),
        )
        success = result.startswith("已调度")
        return ToolResult(success=success, output=result, error="" if success else result)


class ListCronsTool(BaseTool):
    @property
    def name(self) -> str:
        return "list_crons"

    @property
    def description(self) -> str:
        return "列出所有已注册的定时任务"

    @property
    def parameters(self) -> list[ToolParam]:
        return []

    async def execute(self, **kwargs) -> ToolResult:
        jobs = cron.list_jobs()
        if not jobs:
            return ToolResult(success=True, output="没有定时任务")
        lines = []
        for j in jobs:
            tag = "循环" if j.recurring else "一次性"
            dur = "持久" if j.durable else "会话"
            lines.append(f"  {j.id}: '{j.cron}' → {j.prompt[:40]} [{tag}, {dur}]")
        return ToolResult(success=True, output="\n".join(lines))


class CancelCronTool(BaseTool):
    @property
    def name(self) -> str:
        return "cancel_cron"

    @property
    def description(self) -> str:
        return "取消一个定时任务"

    @property
    def parameters(self) -> list[ToolParam]:
        return [ToolParam(name="job_id", type="string", description="任务ID")]

    async def execute(self, **kwargs) -> ToolResult:
        result = cron.cancel(kwargs.get("job_id", ""))
        success = result.startswith("已取消")
        return ToolResult(success=success, output=result, error="" if success else result)
