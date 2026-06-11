from fastapi import APIRouter
from app.core.memory import memory_system

router = APIRouter()


@router.get("/api/sessions")
async def list_sessions():
    sessions = memory_system.list_sessions()
    return {"sessions": sessions}


@router.post("/api/sessions/{session_id}")
async def create_session(session_id: str):
    return {"session_id": session_id, "status": "created"}


@router.get("/api/sessions/{session_id}/messages")
async def get_messages(session_id: str):
    history = memory_system.get_history(session_id)
    return {"session_id": session_id, "messages": history}


@router.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    memory_system.delete_session(session_id)
    return {"status": "deleted"}
