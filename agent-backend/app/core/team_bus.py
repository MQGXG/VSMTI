"""团队通信系统 — MessageBus 文件收件箱 + 协议状态"""

import json
import logging
import time
import threading
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

MAILBOX_DIR = Path(__file__).resolve().parent.parent.parent / ".mailboxes"


class MessageBus:
    """文件收件箱 — 每个 Agent 一个 .jsonl 文件"""

    def send(self, from_agent: str, to_agent: str, content: str,
             msg_type: str = "message", metadata: dict | None = None) -> str:
        MAILBOX_DIR.mkdir(parents=True, exist_ok=True)
        msg = {
            "from": from_agent, "to": to_agent,
            "content": content, "type": msg_type,
            "ts": time.time(), "metadata": metadata or {},
        }
        inbox = MAILBOX_DIR / f"{to_agent}.jsonl"
        with open(inbox, "a", encoding="utf-8") as f:
            f.write(json.dumps(msg, ensure_ascii=False) + "\n")
        logger.debug("[Bus] %s → %s (%s): %s", from_agent, to_agent, msg_type, content[:50])
        return f"已发送至 {to_agent}"

    def read_inbox(self, agent: str) -> list[dict]:
        inbox = MAILBOX_DIR / f"{agent}.jsonl"
        if not inbox.exists():
            return []
        msgs = [json.loads(line) for line in inbox.read_text(encoding="utf-8").splitlines() if line.strip()]
        inbox.unlink(missing_ok=True)
        return msgs


bus = MessageBus()


@dataclass
class ProtocolState:
    request_id: str
    type: str          # "shutdown" | "plan_approval"
    sender: str
    target: str
    status: str        # pending | approved | rejected
    payload: str = ""
    created_at: float = field(default_factory=time.time)


REQUESTS_DIR = MAILBOX_DIR.parent / ".protocol_requests"
_pending_requests: dict[str, ProtocolState] = {}
_request_lock = threading.Lock()


def _ensure_requests_dir():
    REQUESTS_DIR.mkdir(parents=True, exist_ok=True)


def _request_path(request_id: str) -> Path:
    return REQUESTS_DIR / f"{request_id}.json"


def _persist_request(state: ProtocolState):
    _ensure_requests_dir()
    with _request_lock:
        _request_path(state.request_id).write_text(
            json.dumps({
                "request_id": state.request_id,
                "type": state.type,
                "sender": state.sender,
                "target": state.target,
                "status": state.status,
                "payload": state.payload,
                "created_at": state.created_at,
            }, ensure_ascii=False),
            encoding="utf-8",
        )


def _load_persisted_requests():
    """启动时恢复持久化的请求"""
    _ensure_requests_dir()
    with _request_lock:
        for path in sorted(REQUESTS_DIR.glob("req_*.json")):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if data["status"] == "pending":
                    _pending_requests[data["request_id"]] = ProtocolState(**data)
            except Exception:
                pass


def new_request_id() -> str:
    return f"req_{int(time.time())}_{threading.get_ident()}"


def create_request(req_type: str, sender: str, target: str, payload: str = "") -> str:
    req_id = new_request_id()
    state = ProtocolState(
        request_id=req_id, type=req_type,
        sender=sender, target=target,
        status="pending", payload=payload,
    )
    with _request_lock:
        _pending_requests[req_id] = state
    _persist_request(state)
    logger.info("[Protocol] 创建请求 %s: %s → %s (%s)", req_id, sender, target, req_type)
    return req_id


def resolve_request(request_id: str, approved: bool) -> bool:
    """解析一个协议请求，返回是否找到"""
    with _request_lock:
        state = _pending_requests.get(request_id)
        if not state or state.status != "pending":
            return False
        state.status = "approved" if approved else "rejected"
    _persist_request(state)
    logger.info("[Protocol] 解析 %s: %s", request_id, state.status)
    return True


def get_request(request_id: str) -> ProtocolState | None:
    with _request_lock:
        state = _pending_requests.get(request_id)
        if state:
            return state
    # 尝试从磁盘恢复
    path = _request_path(request_id)
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return ProtocolState(**data)
        except Exception:
            pass
    return None


# 启动时恢复待处理请求
_load_persisted_requests()
