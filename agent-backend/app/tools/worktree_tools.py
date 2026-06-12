"""Worktree 工具 — 隔离执行车道"""

from app.tools.base import BaseTool, ToolParam, ToolResult
from app.core import worktree_manager as wt


class CreateWorktreeTool(BaseTool):
    @property
    def name(self) -> str:
        return "worktree_create"

    @property
    def description(self) -> str:
        return "为任务创建独立的 worktree 执行车道"

    @property
    def parameters(self) -> list[ToolParam]:
        return [
            ToolParam(name="name", type="string", description="Worktree 名称"),
            ToolParam(name="task_id", type="string", description="绑定的任务 ID"),
        ]

    async def execute(self, **kwargs) -> ToolResult:
        name = kwargs.get("name", "")
        task_id = kwargs.get("task_id", "")
        if not name or not task_id:
            return ToolResult(success=False, error="需要 name 和 task_id")
        result = wt.create(name, task_id)
        if "error" in result:
            return ToolResult(success=False, error=result["error"])
        return ToolResult(success=True, output=f"已创建 worktree '{name}' → {result['path']}")


class WorktreeEnterTool(BaseTool):
    @property
    def name(self) -> str:
        return "worktree_enter"

    @property
    def description(self) -> str:
        return "进入指定 worktree 车道"

    @property
    def parameters(self) -> list[ToolParam]:
        return [ToolParam(name="name", type="string", description="Worktree 名称")]

    async def execute(self, **kwargs) -> ToolResult:
        name = kwargs.get("name", "")
        result = wt.enter(name)
        if "error" in result:
            return ToolResult(success=False, error=result["error"])
        return ToolResult(success=True, output=f"已进入 worktree '{name}'")


class WorktreeRunTool(BaseTool):
    @property
    def name(self) -> str:
        return "worktree_run"

    @property
    def description(self) -> str:
        return "在 worktree 目录中执行命令"

    @property
    def parameters(self) -> list[ToolParam]:
        return [
            ToolParam(name="name", type="string", description="Worktree 名称"),
            ToolParam(name="command", type="string", description="要执行的命令"),
        ]

    async def execute(self, **kwargs) -> ToolResult:
        name = kwargs.get("name", "")
        command = kwargs.get("command", "")
        if not name or not command:
            return ToolResult(success=False, error="需要 name 和 command")
        output = wt.run_command(name, command)
        return ToolResult(success=not output.startswith("Error:"), output=output)


class WorktreeCloseoutTool(BaseTool):
    @property
    def name(self) -> str:
        return "worktree_closeout"

    @property
    def description(self) -> str:
        return "收尾 worktree（保留或删除）"

    @property
    def parameters(self) -> list[ToolParam]:
        return [
            ToolParam(name="name", type="string", description="Worktree 名称"),
            ToolParam(name="action", type="string", enum=["keep", "remove"], description="保留或删除"),
            ToolParam(name="reason", type="string", description="收尾原因", required=False),
        ]

    async def execute(self, **kwargs) -> ToolResult:
        name = kwargs.get("name", "")
        action = kwargs.get("action", "keep")
        reason = kwargs.get("reason", "")
        result = wt.closeout(name, action, reason)
        if "error" in result:
            return ToolResult(success=False, error=result["error"])
        return ToolResult(success=True, output=f"Worktree '{name}' 已{action}")


class WorktreeListTool(BaseTool):
    @property
    def name(self) -> str:
        return "worktree_list"

    @property
    def description(self) -> str:
        return "列出所有 worktree"

    @property
    def parameters(self) -> list[ToolParam]:
        return []

    async def execute(self, **kwargs) -> ToolResult:
        all_wt = wt.list_all()
        if not all_wt:
            return ToolResult(success=True, output="暂无 worktree")
        lines = [f"  {w['name']} → {w['path']} [{w['status']}] task: {w['task_id']}" for w in all_wt]
        return ToolResult(success=True, output="\n".join(lines))
