import json
import logging
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.core.agent import Agent
from app.core.llm import get_llm
from app.core.memory import memory_system
from app.core.modes import AgentMode
from app.core.permission_store import respond as respond_permission
from app.core.question_store import answer_question
from app.core.permission_config import permission_config
from app.core.workspace import workspace
from app.tools import tool_registry

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    session_id: str
    model: str = "openai"
    model_name: str = ""
    api_key: str = ""
    api_url: str = ""
    mode: str = "assistant"  # assistant / expert / action / safe


logger = logging.getLogger(__name__)


def _switch_workspace_for_session(session_id: str):
    """根据会话记录切换工作目录"""
    info = memory_system.get_session_info(session_id)
    ws = (info or {}).get("workspace_path", "")
    if ws:
        try:
            workspace.path = ws
            logger.info("[Chat] 已切换工作目录: %s", ws)
        except Exception as e:
            logger.warning("[Chat] 切换工作目录失败: %s", e)


@router.post("/api/chat")
async def chat(request: ChatRequest):
    logger.info(
        f"[Chat] session={request.session_id}, model={request.model}/{request.model_name}, mode={request.mode}"
    )
    try:
        llm = get_llm(
            provider=request.model,
            model_name=request.model_name or None,
            api_key=request.api_key or None,
            api_url=request.api_url or None,
        )
    except Exception as e:
        logger.error(f"[Chat] Failed to create LLM: {e}")
        raise

    # 解析模式
    try:
        mode = AgentMode(request.mode)
    except ValueError:
        mode = AgentMode.ASSISTANT

    # 切换到该会话绑定的任务目录
    _switch_workspace_for_session(request.session_id)

    agent = Agent(llm, tool_registry, mode=mode)
    history = memory_system.get_history(request.session_id)

    memory_system.add_message(request.session_id, "user", request.message)

    # 收集 assistant 回复用于持久化
    assistant_content = ""

    async def event_stream():
        nonlocal assistant_content
        try:
            async for event in agent.run(request.message, history):
                # 累积内容用于持久化
                if event.type == "content":
                    assistant_content += event.data.get("text", "")

                # SSE 输出
                yield event.to_sse()

            # 完成标记
            yield f"data: {json.dumps({'type': 'finish'}, ensure_ascii=False)}\n\n"

        except Exception as e:
            logger.exception("[Chat] SSE error")
            yield f"data: {json.dumps({'type': 'error', 'text': str(e)}, ensure_ascii=False)}\n\n"

        finally:
            # 持久化 assistant 回复
            if assistant_content:
                memory_system.add_message(request.session_id, "assistant", assistant_content)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


class PermissionResponse(BaseModel):
    request_id: str
    approved: bool


@router.post("/api/permission/respond")
async def permission_respond(body: PermissionResponse):
    ok = respond_permission(body.request_id, body.approved)
    return {"ok": ok}


class QuestionResponse(BaseModel):
    request_id: str
    answer: str


@router.post("/api/question/respond")
async def question_respond(body: QuestionResponse):
    ok = answer_question(body.request_id, body.answer)
    return {"ok": ok}


@router.post("/api/permission/reload")
async def reload_permission():
    """重新加载权限配置"""
    permission_config.reload()
    return {"status": "reloaded", "rules": len(permission_config._rules)}
