"""问题存储 — 异步等待用户回答问题"""

import asyncio
import logging
import uuid

logger = logging.getLogger(__name__)

_pending: dict[str, asyncio.Event] = {}
_results: dict[str, str] = {}


def create_question() -> str:
    """创建新问题，返回 request_id"""
    req_id = str(uuid.uuid4())[:8]
    _pending[req_id] = asyncio.Event()
    return req_id


async def wait_for_answer(request_id: str, timeout: float = 300) -> str | None:
    """等待用户回答，默认 5 分钟超时"""
    event = _pending.get(request_id)
    if not event:
        return None
    try:
        await asyncio.wait_for(event.wait(), timeout=timeout)
        return _results.get(request_id)
    except asyncio.TimeoutError:
        logger.warning("[Question] 超时: %s", request_id)
        return None
    finally:
        _pending.pop(request_id, None)
        _results.pop(request_id, None)


def answer_question(request_id: str, answer: str) -> bool:
    """用户回答"""
    event = _pending.get(request_id)
    if not event:
        return False
    _results[request_id] = answer
    event.set()
    return True
