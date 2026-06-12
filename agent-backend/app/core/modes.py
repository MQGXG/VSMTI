from enum import Enum
from dataclasses import dataclass, field


class AgentMode(Enum):
    """Agent 运行模式"""
    ASSISTANT = "assistant"    # 日常问答、写作、分析 — 安全工具
    EXPERT = "expert"          # 深度研究、数据分析 — 代码执行 + 文件读取
    ACTION = "action"          # 自动化任务、批量处理 — 全部工具（含写入）
    SAFE = "safe"              # 只读探索 — 仅搜索和读取


@dataclass
class ModeConfig:
    """模式配置"""
    name: str
    description: str
    allowed_tools: list[str] = field(default_factory=list)
    system_prompt_suffix: str = ""
    max_iterations: int = 10
    allow_file_write: bool = False
    allow_system_command: bool = False


# 模式定义
MODE_CONFIGS: dict[AgentMode, ModeConfig] = {
    AgentMode.ASSISTANT: ModeConfig(
        name="助手",
        description="日常问答、写作、分析",
        allowed_tools=["web_search", "read_file", "list_files",
                       "run_code", "data_analysis"],
        system_prompt_suffix="你是一个通用AI助手。请提供准确、有用的回答。",
        max_iterations=5,
        allow_file_write=False,
        allow_system_command=False,
    ),
    AgentMode.EXPERT: ModeConfig(
        name="专家",
        description="深度研究、数据分析",
        allowed_tools=["web_search", "read_file", "list_files",
                       "run_code", "data_analysis", "browse_web"],
        system_prompt_suffix="你是领域专家。你可以运行代码和深度分析数据来回答复杂问题。",
        max_iterations=15,
        allow_file_write=False,
        allow_system_command=False,
    ),
    AgentMode.ACTION: ModeConfig(
        name="执行",
        description="自动化任务、批量处理",
        allowed_tools=[],  # 空表示全部允许
        system_prompt_suffix="你是任务执行专家。你可以读写文件、批量处理数据、自动化工作流程。",
        max_iterations=20,
        allow_file_write=True,
        allow_system_command=True,
    ),
    AgentMode.SAFE: ModeConfig(
        name="安全",
        description="只读探索、不修改任何内容",
        allowed_tools=["web_search", "read_file", "list_files"],
        system_prompt_suffix="你处于只读模式。你可以搜索信息和读取文件，但**绝对不允许**修改、删除或创建任何文件。",
        max_iterations=5,
        allow_file_write=False,
        allow_system_command=False,
    ),
}


def get_mode_config(mode: AgentMode | str) -> ModeConfig:
    """获取模式配置"""
    if isinstance(mode, str):
        mode = AgentMode(mode)
    return MODE_CONFIGS.get(mode, MODE_CONFIGS[AgentMode.ASSISTANT])


def filter_tools_by_mode(tools: list, mode: AgentMode | str) -> list:
    """根据模式过滤工具列表"""
    config = get_mode_config(mode)
    if not config.allowed_tools:
        return tools  # 空列表表示全部允许

    allowed = set(config.allowed_tools)
    return [t for t in tools if t.get("function", {}).get("name") in allowed]
