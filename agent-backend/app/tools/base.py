from abc import ABC, abstractmethod
from typing import Any
from pydantic import BaseModel


class ToolParam(BaseModel):
    name: str
    type: str
    description: str
    required: bool = True


class ToolResult(BaseModel):
    success: bool
    output: str
    error: str | None = None


class BaseTool(ABC):
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

    @abstractmethod
    async def execute(self, **kwargs) -> ToolResult:
        pass

    def to_openai_schema(self) -> dict:
        props = {}
        required = []
        for p in self.parameters:
            props[p.name] = {"type": p.type, "description": p.description}
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
