"""队友线程 — 独立 LLM 循环 + 收件箱 + 任务认领 + Worktree 隔离"""

import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any

from app.core.team_bus import bus
from app.core.task_system import list_tasks, claim_task, complete_task, can_start
from app.core import worktree_manager as wt
from app.core.workspace import workspace

logger = logging.getLogger(__name__)

IDLE_POLL_INTERVAL = 5
IDLE_TIMEOUT = 60

_active_teammates: dict[str, threading.Thread] = {}
_teammate_lock = threading.Lock()

TEAMMATE_TOOLS = [
    {"name": "bash", "description": "执行 shell 命令",
     "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},
    {"name": "read_file", "description": "读取文件",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
    {"name": "write_file", "description": "写入文件",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}},
    {"name": "send_message", "description": "发送消息给其他 Agent",
     "input_schema": {"type": "object", "properties": {"to": {"type": "string"}, "content": {"type": "string"}}, "required": ["to", "content"]}},
    {"name": "list_tasks", "description": "列出所有任务",
     "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "claim_task", "description": "认领任务",
     "input_schema": {"type": "object", "properties": {"task_id": {"type": "string"}}, "required": ["task_id"]}},
    {"name": "complete_task", "description": "完成任务",
     "input_schema": {"type": "object", "properties": {"task_id": {"type": "string"}}, "required": ["task_id"]}},
    {"name": "submit_plan", "description": "提交计划供 Lead 审批",
     "input_schema": {"type": "object", "properties": {"plan": {"type": "string"}}, "required": ["plan"]}},
]


_teammate_worktrees: dict[str, str] = {}  # teammate_name -> worktree_name


def _get_cwd(teammate_name: str) -> str:
    """获取队友当前工作目录（优先 worktree）"""
    wt_name = _teammate_worktrees.get(teammate_name)
    if wt_name:
        wt_entry = wt.get(wt_name)
        if wt_entry and wt_entry.get("path"):
            return wt_entry["path"]
    return str(workspace.path)


def _execute_teammate_tool(name: str, args: dict, teammate_name: str) -> str:
    """执行队友的工具（在 worktree 目录中）"""
    from app.tools.registry import tool_registry
    import subprocess
    from pathlib import Path
    import os

    cwd = _get_cwd(teammate_name)

    if name == "bash":
        try:
            r = subprocess.run(args.get("command", ""), shell=True,
                               capture_output=True, text=True, timeout=120,
                               cwd=cwd)
            out = (r.stdout + r.stderr).strip()
            return out[:50000] if out else "(no output)"
        except Exception as e:
            return f"Error: {e}"

    elif name == "read_file":
        try:
            path = (Path(cwd) / args.get("path", "")).resolve()
            if not path.exists():
                path = Path(args.get("path", "")).resolve()
            if not path.exists():
                return f"Error: file not found: {path}"
            return path.read_text(encoding="utf-8")
        except Exception as e:
            return f"Error: {e}"

    elif name == "write_file":
        try:
            path = Path(cwd) / args.get("path", "")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(args.get("content", ""), encoding="utf-8")
            return f"Wrote {len(args.get('content', ''))} bytes"
        except Exception as e:
            return f"Error: {e}"

    elif name == "send_message":
        to = args.get("to", "")
        content = args.get("content", "")
        return bus.send(teammate_name, to, content)

    elif name == "list_tasks":
        tasks = list_tasks()
        if not tasks:
            return "No tasks."
        return "\n".join(f"  {t.id}: {t.subject} [{t.status}]" for t in tasks)

    elif name == "claim_task":
        result = claim_task(args.get("task_id", ""), owner=teammate_name)
        return result

    elif name == "complete_task":
        result = complete_task(args.get("task_id", ""))
        return result

    elif name == "submit_plan":
        from app.core.team_bus import create_request
        plan = args.get("plan", "")
        req_id = create_request("plan_approval", teammate_name, "lead", plan)
        bus.send(teammate_name, "lead", plan, "plan_approval_request", {"request_id": req_id})
        return f"Plan submitted ({req_id})"

    return f"Unknown tool: {name}"


def _llm_chat(messages: list, tools: list, api_key: str, base_url: str, model: str) -> tuple[str, list[dict], str]:
    """同步调用 LLM（队友线程用）"""
    from anthropic import Anthropic

    client = Anthropic(api_key=api_key, base_url=base_url or None)

    try:
        response = client.messages.create(
            model=model,
            system="你是 AI 队友，专注完成分配的任务。使用工具解决问题。",
            messages=messages,
            tools=tools if tools else None,
            max_tokens=4096,
        )
    except Exception as e:
        return f"[LLM Error] {e}", [], "error"

    content_text = ""
    pending_calls = []

    for block in response.content:
        if block.type == "text":
            content_text += block.text
        elif block.type == "tool_use":
            pending_calls.append({
                "id": block.id,
                "name": block.name,
                "input": block.input,
            })

    return content_text, pending_calls, response.stop_reason


def _scan_unclaimed(role: str = "") -> list[dict]:
    """扫描可认领的任务（按角色过滤）"""
    unclaimed = []
    for t in list_tasks():
        if t.status == "pending" and not t.owner:
            ok, _ = can_start(t.id)
            if ok:
                desc = t.description.lower()
                if role:
                    role_keywords = {"frontend": ["frontend", "ui", "界面", "component"],
                                     "backend": ["backend", "api", "后端", "database"],
                                     "tester": ["test", "测试", "qa"],
                                     "coder": ["implement", "实现", "refactor", "重构"]}
                    allowed = role_keywords.get(role.lower(), [])
                    if allowed and not any(kw in desc for kw in allowed):
                        continue
                unclaimed.append({"id": t.id, "subject": t.subject})
    return unclaimed


def _inject_identity(messages: list, name: str, role: str, team_name: str = "default"):
    """确保队友身份上下文存在"""
    has_identity = any(
        isinstance(m, dict) and "identity" in m.get("content", "")
        for m in messages[:3]
    )
    if not has_identity:
        messages.insert(0, {
            "role": "user",
            "content": f"<identity>你是 '{name}'，角色: {role}，团队: {team_name}。</identity>",
        })
        messages.insert(1, {
            "role": "assistant",
            "content": f"我是 {name}。继续工作。",
        })


def _run_teammate(name: str, role: str, prompt: str,
                  api_key: str, base_url: str, model: str):
    """队友线程主循环：WORK → IDLE → SHUTDOWN"""
    logger.info("[Teammate] %s 启动 (role=%s)", name, role)

    system_prompt = f"你是 '{name}'，角色: {role}。使用工具完成任务。可以通过 send_message 与 lead 通信。"

    messages = [{"role": "user", "content": prompt}]
    _inject_identity(messages, name, role)
    shutdown_requested = False

    while not shutdown_requested:
        # WORK 阶段
        work_done = False
        for _ in range(15):
            # 检查收件箱
            inbox = bus.read_inbox(name)
            for msg in inbox:
                msg_type = msg.get("type", "")
                if msg_type == "shutdown_request":
                    req_id = msg.get("metadata", {}).get("request_id", "")
                    bus.send(name, "lead", f"Shutting down.", "shutdown_response",
                             {"request_id": req_id, "approve": True})
                    shutdown_requested = True
                    work_done = True
                    break
                elif msg_type in ("message", "plan_request"):
                    messages.append({"role": "user", "content": f"[Inbox] {msg['content']}"})

            if shutdown_requested:
                break

            # 身份重注入（压缩后可能丢失）
            _inject_identity(messages, name, role)

            # LLM 调用
            content_text, pending_calls, stop_reason = _llm_chat(
                messages, TEAMMATE_TOOLS, api_key, base_url, model)

            assistant_msg = {"role": "assistant"}
            if content_text:
                assistant_msg["content"] = content_text
            if pending_calls:
                assistant_msg["tool_calls"] = [
                    {"id": c["id"], "type": "function",
                     "function": {"name": c["name"], "arguments": json.dumps(c["input"])}}
                    for c in pending_calls
                ]
            messages.append(assistant_msg)

            if not pending_calls:
                work_done = True
                break

            # 执行工具
            for call in pending_calls:
                output = _execute_teammate_tool(call["name"], call["input"], name)
                logger.debug("[Teammate.%s] %s", name, call["name"])
                messages.append({"role": "user", "content": output})

        if shutdown_requested:
            break

        # IDLE 阶段：轮询收件箱 + 任务板
        if work_done:
            logger.info("[Teammate] %s 进入 IDLE", name)
            for _ in range(IDLE_TIMEOUT // IDLE_POLL_INTERVAL):
                time.sleep(IDLE_POLL_INTERVAL)

                # 检查收件箱
                inbox = bus.read_inbox(name)
                for msg in inbox:
                    msg_type = msg.get("type", "")
                    if msg_type == "shutdown_request":
                        req_id = msg.get("metadata", {}).get("request_id", "")
                        bus.send(name, "lead", "Shutting down.", "shutdown_response",
                                 {"request_id": req_id, "approve": True})
                        shutdown_requested = True
                        break
                    elif msg_type == "plan_response":
                        approve = msg.get("metadata", {}).get("approve", False)
                        messages.append({"role": "user", "content": f"[Plan {'approved' if approve else 'rejected'}]"})
                        work_done = False
                    else:
                        content = msg.get("content", "")
                        messages.append({"role": "user", "content": f"[Inbox] {content}"})
                        work_done = False

                if shutdown_requested:
                    break
                if not work_done:
                    break

                # 扫描任务板（按角色过滤）
                unclaimed = _scan_unclaimed(role)
                if unclaimed:
                    task = unclaimed[0]
                    result = claim_task(task["id"], owner=name, source="auto")
                    if "已认领" in result:
                        # 绑定 worktree
                        wt_entry = wt.get_by_task(task["id"])
                        if wt_entry:
                            _teammate_worktrees[name] = wt_entry["name"]
                            wt.enter(wt_entry["name"])
                        _inject_identity(messages, name, role)
                        messages.append({"role": "user",
                                         "content": f"[Auto-claim] Task: {task['subject']}"})
                        work_done = False
                        break

            if not work_done and not shutdown_requested:
                continue  # 回到 WORK

    # SHUTDOWN: 清理 worktree 绑定
    if name in _teammate_worktrees:
        del _teammate_worktrees[name]
    bus.send(name, "lead", f"Teammate {name} finished.", "result")
    with _teammate_lock:
        _active_teammates.pop(name, None)
    logger.info("[Teammate] %s 已退出", name)


def spawn(name: str, role: str, prompt: str,
          api_key: str = "", base_url: str = "", model: str = "") -> str:
    """启动队友线程"""
    with _teammate_lock:
        if name in _active_teammates:
            return f"队友 '{name}' 已存在"
        thread = threading.Thread(
            target=_run_teammate,
            args=(name, role, prompt, api_key, base_url, model),
            daemon=True,
        )
        _active_teammates[name] = thread
        thread.start()
    logger.info("[Teammate] 已启动: %s (%s)", name, role)
    return f"队友 '{name}' 已启动 (role={role})"


def is_active(name: str) -> bool:
    with _teammate_lock:
        return name in _active_teammates


def list_active() -> list[str]:
    with _teammate_lock:
        return list(_active_teammates.keys())
