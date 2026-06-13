"""运行时提示词组装 — 分节拼接 + 缓存"""

import json
import logging

logger = logging.getLogger(__name__)

_last_context_key = None
_last_prompt = None


PROMPT_SECTIONS = {
    "identity": "你是 OmniAgent，一个全能 AI 助手。直接行动，不要过多解释。",
    "tools": "",  # 动态填充
    "workspace": "",  # 动态填充
    "memory": "",  # 动态填充
    "skills": "",  # 动态填充
}

# 工具使用指南：告诉 LLM 何时使用特定工具
TOOL_USAGE_GUIDE = """
## 工具使用指南
当用户提到以下需求时，请主动使用对应工具：
- 用户要求读取、查看、分析本地文件 → 使用 read_file
- 用户要求列出目录内容 → 使用 list_files
- 用户要求搜索文件内容 → 使用 grep
- 用户要求按模式查找文件 → 使用 glob
- 用户要求执行代码 → 使用 run_code
- 用户要求搜索网络信息 → 使用 web_search
- 用户上传文件后要求分析 → 使用 read_file 读取文件内容后分析
"""


def assemble_system_prompt(
    tools_desc: str,
    workspace: str,
    skills_catalog: str = "",
    memories: str = "",
    mode_suffix: str = "",
    todos: list | None = None,
) -> str:
    """按需拼接 system prompt"""
    sections = ["## 身份\n" + PROMPT_SECTIONS["identity"]]

    if mode_suffix:
        sections.append("## 模式\n" + mode_suffix)

    if tools_desc:
        sections.append("## 工具\n" + tools_desc)

    # 工具使用指南
    sections.append(TOOL_USAGE_GUIDE)

    if workspace:
        sections.append("## 工作区\n" + workspace)

    if skills_catalog:
        sections.append("## 可用技能\n" + skills_catalog)

    if memories:
        sections.append("## 相关记忆\n" + memories)

    if todos:
        todo_lines = ["## 当前任务"]
        for t in todos:
            icon = {"pending": "○", "in_progress": "▸", "completed": "✓"}[t["status"]]
            todo_lines.append(f"{icon} {t['content']} [{t['status']}]")
        sections.append("\n".join(todo_lines))

    return "\n\n".join(sections)


def get_cached_prompt(context: dict) -> str | None:
    """返回缓存的 prompt，如果上下文不变"""
    global _last_context_key, _last_prompt
    key = json.dumps(context, sort_keys=True, ensure_ascii=False)
    if key == _last_context_key and _last_prompt:
        return _last_prompt
    return None


def set_cached_prompt(context: dict, prompt: str):
    """更新 prompt 缓存"""
    global _last_context_key, _last_prompt
    _last_context_key = json.dumps(context, sort_keys=True, ensure_ascii=False)
    _last_prompt = prompt
