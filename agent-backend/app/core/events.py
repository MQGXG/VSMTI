from dataclasses import dataclass, field
from typing import Any


@dataclass
class LLMEvent:
    """LLM 流事件基类"""
    pass


@dataclass
class ContentDeltaEvent(LLMEvent):
    """文本增量事件"""
    text: str


@dataclass
class ToolCallStartEvent(LLMEvent):
    """工具调用开始"""
    tool_call_id: str
    name: str


@dataclass
class ToolCallDeltaEvent(LLMEvent):
    """工具调用参数增量（流式）"""
    tool_call_id: str
    arguments_delta: str


@dataclass
class ToolCallFinishEvent(LLMEvent):
    """工具调用完成（参数接收完毕）"""
    tool_call_id: str
    name: str
    arguments: str  # 完整 JSON string


@dataclass
class ToolResultEvent(LLMEvent):
    """工具执行结果"""
    tool_call_id: str
    name: str
    output: str
    success: bool


@dataclass
class ToolErrorEvent(LLMEvent):
    """工具执行失败（可恢复）"""
    tool_call_id: str
    name: str
    error: str


@dataclass
class FinishEvent(LLMEvent):
    """LLM 响应完成"""
    reason: str = "stop"  # stop / length / tool_calls
    usage: dict = field(default_factory=dict)


@dataclass
class ErrorEvent(LLMEvent):
    """LLM 调用错误（不可恢复）"""
    error: str
    code: str | None = None


@dataclass
class PermissionRequestEvent(LLMEvent):
    """权限审批请求"""
    tool_name: str
    args: dict
    reason: str
    request_id: str


# 前端兼容的简化事件类型
@dataclass
class StreamEvent:
    """SSE 发送到前端的标准格式"""
    type: str  # content / tool_start / tool_delta / tool_finish / tool_result / error / finish
    data: dict = field(default_factory=dict)

    @staticmethod
    def content(text: str) -> "StreamEvent":
        return StreamEvent(type="content", data={"text": text})

    @staticmethod
    def tool_start(name: str, args: dict) -> "StreamEvent":
        return StreamEvent(type="tool_start", data={"name": name, "args": args})

    @staticmethod
    def tool_result(name: str, output: str, success: bool = True) -> "StreamEvent":
        return StreamEvent(type="tool_result", data={"name": name, "output": output, "success": success})

    @staticmethod
    def error(message: str) -> "StreamEvent":
        return StreamEvent(type="error", data={"message": message})

    @staticmethod
    def finish(reason: str = "stop") -> "StreamEvent":
        return StreamEvent(type="finish", data={"reason": reason})

    @staticmethod
    def permission_request(tool_name: str, args: dict, reason: str, request_id: str) -> "StreamEvent":
        return StreamEvent(type="permission_request", data={
            "tool_name": tool_name,
            "args": args,
            "reason": reason,
            "request_id": request_id,
        })

    @staticmethod
    def permission_result(request_id: str, approved: bool) -> "StreamEvent":
        return StreamEvent(type="permission_result", data={
            "request_id": request_id,
            "approved": approved,
        })

    def to_sse(self) -> str:
        import json
        return f"data: {json.dumps({'type': self.type, **self.data}, ensure_ascii=False)}\n\n"
