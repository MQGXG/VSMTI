PLANNER_PROMPT = """分析以下任务，决定由哪个专家处理：

任务：{task}

可选专家：
- coder: 编程、写代码、调试
- researcher: 搜索信息、研究分析
- analyst: 数据分析、图表生成
- general: 一般任务

返回JSON格式：
{{"needs_specialist": true/false, "assigned_to": "角色", "reason": "原因"}}
"""


async def plan_task(task: str, llm) -> dict:
    """任务规划，决定由哪个 Agent 处理"""
    result = await llm.chat([{"role": "user", "content": PLANNER_PROMPT.format(task=task)}])
    import json
    try:
        return json.loads(result)
    except Exception:
        return {"needs_specialist": False, "assigned_to": "general", "reason": "解析失败，使用通用助手"}


AGENT_PROFILES = {
    "general": {
        "name": "全能助手",
        "system_prompt": "你是一个全能AI助手，可以使用所有工具帮助用户。",
        "tools": ["web_search", "run_code", "read_file", "write_file", "data_analysis", "image_generate", "browse_web"],
    },
    "coder": {
        "name": "代码专家",
        "system_prompt": "你是一个编程专家，擅长写代码、调试和代码审查。",
        "tools": ["run_code", "read_file", "write_file"],
    },
    "researcher": {
        "name": "研究员",
        "system_prompt": "你是一个研究专家，擅长搜索信息、分析和总结。",
        "tools": ["web_search", "browse_web", "read_file"],
    },
    "analyst": {
        "name": "数据分析师",
        "system_prompt": "你是一个数据分析专家，擅长处理数据和生成图表。",
        "tools": ["data_analysis", "run_code", "read_file"],
    },
}
