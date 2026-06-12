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
