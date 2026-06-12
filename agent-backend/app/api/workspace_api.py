"""工作目录管理 API"""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.workspace import workspace

logger = logging.getLogger(__name__)
router = APIRouter()


class SetWorkspaceRequest(BaseModel):
    path: str


@router.get("/api/workspace")
async def get_workspace():
    return {
        "path": str(workspace.path),
        "exists": workspace.path.exists(),
    }


@router.post("/api/workspace")
async def set_workspace(body: SetWorkspaceRequest):
    try:
        workspace.path = body.path
        return {"status": "ok", "path": str(workspace.path)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
