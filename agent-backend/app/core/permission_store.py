"""权限审批存储 — 异步等待前端审批结果"""

import asyncio
import logging
import uuid

logger = logging.getLogger(__name__)

_pending: dict[str, asyncio.Event] = {}
_results: dict[str, bool] = {}


def create_request() -> str:
    """创建新的审批请求，返回 request_id"""
    req_id = str(uuid.uuid4())[:8]
    _pending[req_id] = asyncio.Event()
    logger.info("[Permission] 创建审批请求: %s", req_id)
    return req_id


async def wait_for_response(request_id: str, timeout: float = 300) -> bool:
    """等待用户审批结果，默认 5 分钟超时"""
    event = _pending.get(request_id)
    if not event:
        return False
    try:
        await asyncio.wait_for(event.wait(), timeout=timeout)
        return _results.get(request_id, False)
    except asyncio.TimeoutError:
        logger.warning("[Permission] 审批超时: %s", request_id)
        return False
    finally:
        _pending.pop(request_id, None)
        _results.pop(request_id, None)


def respond(request_id: str, approved: bool) -> bool:
    """用户响应审批请求"""
    event = _pending.get(request_id)
    if not event:
        logger.warning("[Permission] 未知请求: %s", request_id)
        return False
    _results[request_id] = approved
    event.set()
    logger.info("[Permission] 响应 %s: %s", request_id, "允许" if approved else "拒绝")
    return True
