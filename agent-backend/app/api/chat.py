import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.core.agent import Agent
from app.core.llm import get_llm
from app.core.memory import memory_system
from app.tools import tool_registry

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    session_id: str
    model: str = "openai"
    model_name: str = ""
    api_key: str = ""
    api_url: str = ""


@router.post("/api/chat")
async def chat(request: ChatRequest):
    llm = get_llm(
        provider=request.model,
        model_name=request.model_name or None,
        api_key=request.api_key or None,
        api_url=request.api_url or None,
    )
    agent = Agent(llm, tool_registry)
    history = memory_system.get_history(request.session_id)

    memory_system.add_message(request.session_id, "user", request.message)

    async def event_stream():
        try:
            async for event in agent.run(request.message, history):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            yield "data: {\"type\": \"done\"}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'text': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
