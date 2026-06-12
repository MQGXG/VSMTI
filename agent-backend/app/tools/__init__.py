from app.tools.registry import tool_registry
from app.tools.search import WebSearchTool
from app.tools.code_exec import CodeExecutionTool
from app.tools.file_ops import FileReadTool, FileWriteTool, FileListTool
from app.tools.data_analysis import DataAnalysisTool
from app.tools.image_gen import ImageGenerationTool
from app.tools.web_browse import WebBrowseTool
from app.tools.todo_write import TodoWriteTool
from app.tools.skill_tool import LoadSkillTool
from app.tools.task_management_tools import (
    CreateTaskTool, ListTasksTool, GetTaskTool,
    ClaimTaskTool, CompleteTaskTool,
)
from app.tools.cron_tools import ScheduleCronTool, ListCronsTool, CancelCronTool
from app.tools.team_tools import (
    SpawnTeammateTool, SendMessageTool, CheckInboxTool,
    RequestShutdownTool, RequestPlanTool, ReviewPlanTool,
)
from app.tools.question_tool import QuestionTool
from app.tools.search_tools import GrepTool, GlobTool
from app.tools.worktree_tools import (
    CreateWorktreeTool, WorktreeEnterTool, WorktreeRunTool,
    WorktreeCloseoutTool, WorktreeListTool,
)

tool_registry.register(QuestionTool())
tool_registry.register(GrepTool())
tool_registry.register(GlobTool())
tool_registry.register(WebSearchTool())
tool_registry.register(TodoWriteTool())
tool_registry.register(LoadSkillTool())
tool_registry.register(CreateTaskTool())
tool_registry.register(ListTasksTool())
tool_registry.register(GetTaskTool())
tool_registry.register(ClaimTaskTool())
tool_registry.register(CompleteTaskTool())
tool_registry.register(ScheduleCronTool())
tool_registry.register(ListCronsTool())
tool_registry.register(CancelCronTool())
tool_registry.register(SpawnTeammateTool())
tool_registry.register(SendMessageTool())
tool_registry.register(CheckInboxTool())
tool_registry.register(RequestShutdownTool())
tool_registry.register(RequestPlanTool())
tool_registry.register(ReviewPlanTool())
tool_registry.register(CodeExecutionTool())
tool_registry.register(FileReadTool())
tool_registry.register(FileWriteTool())
tool_registry.register(FileListTool())
tool_registry.register(DataAnalysisTool())
tool_registry.register(ImageGenerationTool())
tool_registry.register(WebBrowseTool())
tool_registry.register(CreateWorktreeTool())
tool_registry.register(WorktreeEnterTool())
tool_registry.register(WorktreeRunTool())
tool_registry.register(WorktreeCloseoutTool())
tool_registry.register(WorktreeListTool())

__all__ = ["tool_registry"]
