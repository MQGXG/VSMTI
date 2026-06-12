"""任务管理工具 — create_task / list_tasks / get_task / claim_task / complete_task"""

from app.tools.base import BaseTool, ToolParam, ToolResult
from app.core import task_system as ts


class CreateTaskTool(BaseTool):
    @property
    def name(self) -> str:
        return "create_task"

    @property
    def description(self) -> str:
        return "创建一个新任务，可指定依赖 (blockedBy 为依赖的任务ID列表)"

    @property
    def parameters(self) -> list[ToolParam]:
        return [
            ToolParam(name="subject", type="string", description="任务标题"),
            ToolParam(name="description", type="string", description="任务详细描述", required=False),
            ToolParam(name="blockedBy", type="array", description="依赖的任务ID列表", required=False),
        ]

    async def execute(self, **kwargs) -> ToolResult:
        task = ts.create_task(
            subject=kwargs.get("subject", ""),
            description=kwargs.get("description", ""),
            blockedBy=kwargs.get("blockedBy"),
        )
        deps = f" (依赖: {task.blockedBy})" if task.blockedBy else ""
        return ToolResult(success=True, output=f"已创建 {task.id}: {task.subject}{deps}")


class ListTasksTool(BaseTool):
    @property
    def name(self) -> str:
        return "list_tasks"

    @property
    def description(self) -> str:
        return "列出所有任务及其状态"

    @property
    def parameters(self) -> list[ToolParam]:
        return []

    async def execute(self, **kwargs) -> ToolResult:
        tasks = ts.list_tasks()
        if not tasks:
            return ToolResult(success=True, output="当前没有任务")
        lines = []
        for t in tasks:
            icon = {"pending": "○", "in_progress": "●", "completed": "✓"}.get(t.status, "?")
            owner = f" [{t.owner}]" if t.owner else ""
            deps = f" (依赖: {t.blockedBy})" if t.blockedBy else ""
            lines.append(f"{icon} {t.id}: {t.subject} [{t.status}]{owner}{deps}")
        return ToolResult(success=True, output="\n".join(lines))


class GetTaskTool(BaseTool):
    @property
    def name(self) -> str:
        return "get_task"

    @property
    def description(self) -> str:
        return "获取任务的完整详情"

    @property
    def parameters(self) -> list[ToolParam]:
        return [ToolParam(name="task_id", type="string", description="任务ID")]

    async def execute(self, **kwargs) -> ToolResult:
        data = ts.get_task_json(kwargs.get("task_id", ""))
        if not data:
            return ToolResult(success=False, output="", error="任务不存在")
        return ToolResult(success=True, output=data)


class ClaimTaskTool(BaseTool):
    @property
    def name(self) -> str:
        return "claim_task"

    @property
    def description(self) -> str:
        return "认领一个 pending 状态的任务"

    @property
    def parameters(self) -> list[ToolParam]:
        return [ToolParam(name="task_id", type="string", description="任务ID")]

    async def execute(self, **kwargs) -> ToolResult:
        result = ts.claim_task(kwargs.get("task_id", ""))
        success = result.startswith("已认领")
        return ToolResult(success=success, output=result, error="" if success else result)


class CompleteTaskTool(BaseTool):
    @property
    def name(self) -> str:
        return "complete_task"

    @property
    def description(self) -> str:
        return "完成一个 in_progress 状态的任务，解锁下游依赖"

    @property
    def parameters(self) -> list[ToolParam]:
        return [ToolParam(name="task_id", type="string", description="任务ID")]

    async def execute(self, **kwargs) -> ToolResult:
        result = ts.complete_task(kwargs.get("task_id", ""))
        success = result.startswith("已完成")
        return ToolResult(success=success, output=result, error="" if success else result)
