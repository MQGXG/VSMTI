"""工具基础系统 — 借鉴 OpenCode 设计，支持结构化输出 + Schema 验证"""

from abc import ABC, abstractmethod
from enum import Enum
from pathlib import Path
from typing import Any
from pydantic import BaseModel, Field


class ToolParam(BaseModel):
    """工具参数定义"""
    name: str
    type: str = "string"
    description: str = ""
    required: bool = True
    default: Any = None
    enum: list[str] | None = None

    def to_json_schema(self) -> dict:
        schema: dict[str, Any] = {"type": self.type, "description": self.description}
        if self.default is not None:
            schema["default"] = self.default
        if self.enum:
            schema["enum"] = self.enum
        return schema

    def validate_value(self, name: str, value: Any) -> tuple[bool, str]:
        if value is None:
            return True, ""
        if self.type == "integer":
            if not isinstance(value, int):
                return False, f"参数 {name} 应为整数，实际为 {type(value).__name__}"
        elif self.type == "number":
            if not isinstance(value, (int, float)):
                return False, f"参数 {name} 应为数字，实际为 {type(value).__name__}"
        elif self.type == "boolean":
            if not isinstance(value, bool):
                return False, f"参数 {name} 应为布尔值，实际为 {type(value).__name__}"
        elif self.type == "array":
            if not isinstance(value, (list, tuple)):
                return False, f"参数 {name} 应为数组，实际为 {type(value).__name__}"
        if self.enum and value not in self.enum:
            return False, f"参数 {name} 值无效，可选: {self.enum}"
        return True, ""


class OutputType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    FILE = "file"
    ERROR = "error"


class OutputContent(BaseModel):
    type: OutputType
    text: str | None = None
    data: str | None = None
    mime: str | None = None
    name: str | None = None
    uri: str | None = None

    @classmethod
    def text(cls, content: str) -> "OutputContent":
        return cls(type=OutputType.TEXT, text=content)

    @classmethod
    def image(cls, data: str, mime: str = "image/png", name: str = "image.png") -> "OutputContent":
        return cls(type=OutputType.IMAGE, data=data, mime=mime, name=name)

    @classmethod
    def file(cls, data: str, mime: str, name: str) -> "OutputContent":
        return cls(type=OutputType.FILE, data=data, mime=mime, name=name)

    @classmethod
    def error(cls, message: str) -> "OutputContent":
        return cls(type=OutputType.ERROR, text=message)


class ToolResult(BaseModel):
    """工具执行结果"""
    success: bool
    output: str = ""
    error: str | None = None
    content: list[OutputContent] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    def add_text(self, text: str) -> "ToolResult":
        self.content.append(OutputContent.text(text))
        return self

    def add_image(self, data: str, mime: str = "image/png", name: str = "image.png") -> "ToolResult":
        self.content.append(OutputContent.image(data, mime, name))
        return self

    def to_model_content(self) -> list[dict]:
        if not self.content:
            return [{"type": "text", "text": self.output or self.error or ""}]
        result = []
        for c in self.content:
            if c.type == OutputType.TEXT and c.text:
                result.append({"type": "text", "text": c.text})
            elif c.type in (OutputType.IMAGE, OutputType.FILE) and c.data:
                result.append({
                    "type": "image" if c.type == OutputType.IMAGE else "file",
                    "source": {"type": "base64", "media_type": c.mime, "data": c.data},
                })
        return result or [{"type": "text", "text": self.output or ""}]


class ToolContext(BaseModel):
    """工具执行上下文"""
    session_id: str = ""
    agent_id: str = ""
    message_id: str = ""
    tool_call_id: str = ""
    workspace: str = ""
    mode: str = "assistant"
    metadata: dict[str, Any] = Field(default_factory=dict)


class ToolMeta(BaseModel):
    """工具元数据"""
    tags: list[str] = Field(default_factory=list)
    permission: str | None = None
    dangerous: bool = False
    readonly: bool = False


class BaseTool(ABC):
    """工具基类"""

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        pass

    @property
    @abstractmethod
    def parameters(self) -> list[ToolParam]:
        pass

    @property
    def meta(self) -> ToolMeta:
        return ToolMeta()

    async def execute(self, context: ToolContext | None = None, **kwargs) -> ToolResult:
        return await self._execute(**kwargs)

    async def _execute(self, **kwargs) -> ToolResult:
        raise NotImplementedError("子类必须实现 execute 或 _execute 方法")

    def _check_path(self, path: str) -> Path:
        """统一路径安全检查：禁止逃逸到工作目录之外"""
        from app.core.workspace import workspace
        resolved = workspace.resolve(path)
        if not workspace.is_inside(resolved):
            raise PermissionError(f"路径 {resolved} 超出工作目录范围")
        return resolved

    def to_openai_schema(self) -> dict:
        props = {}
        required = []
        for p in self.parameters:
            props[p.name] = p.to_json_schema()
            if p.required:
                required.append(p.name)

        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": props,
                    "required": required,
                },
            },
        }

    def to_claude_schema(self) -> dict:
        props = {}
        required = []
        for p in self.parameters:
            props[p.name] = p.to_json_schema()
            if p.required:
                required.append(p.name)

        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": props,
                "required": required,
            },
        }

    def to_model_output(self, result: "ToolResult") -> str:
        """将工具执行结果格式化为 LLM 可消费的文本（子类可覆盖）"""
        return result.output

    def validate_args(self, args: dict) -> tuple[bool, str]:
        for p in self.parameters:
            if p.required and p.name not in args:
                return False, f"缺少必需参数: {p.name}"
            if p.name in args and args[p.name] is not None:
                valid, msg = p.validate_value(p.name, args[p.name])
                if not valid:
                    return False, msg
        return True, ""
