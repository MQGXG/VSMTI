"""会话/任务 API"""

import logging
import uuid
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.memory import memory_system
from app.core.workspace import workspace

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateSessionRequest(BaseModel):
    title: str = ""


class CreateTaskRequest(BaseModel):
    title: str = ""


class ForkRequest(BaseModel):
    session_id: str
    fork_at_message_id: int | None = None


@router.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    info = memory_system.get_session_info(session_id)
    if not info:
        raise HTTPException(status_code=404, detail="会话不存在")
    return info


@router.get("/api/sessions/{session_id}/messages")
async def get_messages(session_id: str):
    history = memory_system.get_history(session_id)
    return {"session_id": session_id, "messages": history}


@router.post("/api/projects/{project_id}/sessions")
async def create_session(project_id: str, body: CreateSessionRequest):
    """在当前项目下新建会话（复用项目目录）"""
    project = memory_system.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    session_id = memory_system.create_session(
        project_id=project_id,
        title=body.title,
        kind="session",
        workspace_path=project["workspace_path"],
    )
    workspace.path = project["workspace_path"]
    info = memory_system.get_session_info(session_id)
    logger.info("[Session] 新建会话: %s 在项目 %s", session_id, project_id)
    return {"status": "created", "session": info}


@router.post("/api/projects/{project_id}/tasks")
async def create_task(project_id: str, body: CreateTaskRequest):
    """在当前项目下新建任务（自动创建独立子目录）"""
    project = memory_system.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    date_str = datetime.now().strftime("%Y-%m-%d")
    safe_title = "".join(c for c in (body.title or "task") if c.isalnum() or c in (" ", "-", "_")).strip()
    dir_name = f"{date_str}-{safe_title or 'task'}-{str(uuid.uuid4())[:4]}"
    task_dir = Path(project["workspace_path"]) / ".omniagent" / "tasks" / dir_name
    task_dir.mkdir(parents=True, exist_ok=True)

    session_id = memory_system.create_session(
        project_id=project_id,
        title=body.title or "未命名任务",
        kind="task",
        workspace_path=str(task_dir),
    )
    workspace.path = str(task_dir)
    info = memory_system.get_session_info(session_id)
    logger.info("[Task] 新建任务: %s 目录: %s", session_id, task_dir)
    return {"status": "created", "session": info}


@router.post("/api/sessions/{session_id}/fork")
async def fork_session(session_id: str, body: ForkRequest | None = None):
    """从指定消息处分叉会话。不传 fork_at_message_id 则分叉整个会话"""
    fork_point = body.fork_at_message_id if body else None
    try:
        new_id = memory_system.fork_session(session_id, fork_point)
        info = memory_system.get_session_info(new_id)
        # 分叉后切换到源会话的工作目录
        if info and info.get("workspace_path"):
            workspace.path = info["workspace_path"]
        logger.info("[Fork] %s → %s (at msg %s)", session_id, new_id, fork_point)
        return {"status": "forked", "session": info}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    memory_system.delete_session(session_id)
    return {"status": "deleted"}
