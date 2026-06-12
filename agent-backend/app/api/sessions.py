import uuid
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core.memory import memory_system

logger = logging.getLogger(__name__)
router = APIRouter()


class ForkRequest(BaseModel):
    session_id: str
    fork_at_message_id: int | None = None


@router.get("/api/sessions")
async def list_sessions():
    sessions = memory_system.list_sessions()
    return {"sessions": sessions}


@router.post("/api/sessions/{session_id}")
async def create_session(session_id: str):
    if session_id == "new":
        session_id = str(uuid.uuid4())
    return {"session_id": session_id, "status": "created"}


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


@router.post("/api/sessions/{session_id}/fork")
async def fork_session(session_id: str, body: ForkRequest | None = None):
    """从指定消息处分叉会话。不传 fork_at_message_id 则分叉整个会话"""
    fork_point = body.fork_at_message_id if body else None
    try:
        new_id = memory_system.fork_session(session_id, fork_point)
        info = memory_system.get_session_info(new_id)
        logger.info("[Fork] %s → %s (at msg %s)", session_id, new_id, fork_point)
        return {"status": "forked", "session": info}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    memory_system.delete_session(session_id)
    return {"status": "deleted"}
