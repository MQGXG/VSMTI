"""项目/工作目录管理 API"""

import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.memory import memory_system
from app.core.workspace import workspace

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateProjectRequest(BaseModel):
    name: str = ""
    workspace_path: str
    color: str = ""


class UpdateProjectRequest(BaseModel):
    name: str | None = None
    color: str | None = None


# 项目支持的颜色选项
PROJECT_COLORS = [
    "bg-rose-500",
    "bg-orange-500",
    "bg-amber-500",
    "bg-emerald-500",
    "bg-teal-500",
    "bg-cyan-500",
    "bg-sky-500",
    "bg-blue-500",
    "bg-indigo-500",
    "bg-violet-500",
    "bg-purple-500",
    "bg-fuchsia-500",
    "bg-pink-500",
    "bg-red-500",
    "bg-lime-500",
    "bg-neutral-700",
]


@router.get("/api/projects")
async def list_projects():
    return {"projects": memory_system.list_projects()}


@router.post("/api/projects")
async def create_project(body: CreateProjectRequest):
    p = Path(body.workspace_path).resolve()
    if not p.exists():
        p.mkdir(parents=True, exist_ok=True)
    if not p.is_dir():
        raise HTTPException(status_code=400, detail=f"不是目录: {body.workspace_path}")

    project_id = memory_system.create_project(
        name=body.name or p.name,
        workspace_path=str(p),
        color=body.color,
    )
    info = memory_system.get_project(project_id)
    # 自动切换到新项目
    workspace.path = str(p)
    logger.info("[Project] 创建/打开项目: %s (%s)", project_id, info["name"])
    return {"status": "created", "project": info}


@router.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    info = memory_system.get_project(project_id)
    if not info:
        raise HTTPException(status_code=404, detail="项目不存在")
    return info


@router.patch("/api/projects/{project_id}")
async def update_project(project_id: str, body: UpdateProjectRequest):
    info = memory_system.get_project(project_id)
    if not info:
        raise HTTPException(status_code=404, detail="项目不存在")
    memory_system.update_project(
        project_id,
        name=body.name,
        color=body.color,
    )
    return memory_system.get_project(project_id)


@router.get("/api/projects/colors")
async def list_project_colors():
    """返回可用的项目颜色选项"""
    return {"colors": PROJECT_COLORS}


@router.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    memory_system.delete_project(project_id)
    return {"status": "deleted"}


@router.get("/api/projects/{project_id}/sessions")
async def list_project_sessions(project_id: str):
    return {
        "project_id": project_id,
        "sessions": memory_system.list_sessions(project_id=project_id),
    }


@router.post("/api/projects/{project_id}/switch")
async def switch_project(project_id: str):
    """切换到指定项目的工作目录"""
    info = memory_system.get_project(project_id)
    if not info:
        raise HTTPException(status_code=404, detail="项目不存在")
    workspace.path = info["workspace_path"]
    logger.info("[Project] 切换项目: %s (%s)", project_id, info["workspace_path"])
    return {"status": "ok", "project": info}
