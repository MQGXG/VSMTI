from pydantic import BaseModel, create_model
from typing import Any
from app.tools.base import BaseTool, ToolResult


class SchemaTool(BaseTool):
    """
    基于 Pydantic BaseModel 自动生成工具 schema 的基类。
    子类只需定义 `name`, `description`, `ParametersModel`（继承 pydantic.BaseModel）。
    """

    ParametersModel: type[BaseModel] | None = None  # 子类设置

    @property
    def parameters(self):
        from app.tools.base import ToolParam
        if not self.ParametersModel:
            return []
        schema = self.ParametersModel.model_json_schema()
        props = schema.get("properties", {})
        required = set(schema.get("required", []))
        return [
            ToolParam(
                name=name,
                type=info.get("type", "string"),
                description=info.get("description", ""),
                required=name in required,
            )
            for name, info in props.items()
        ]

    async def execute(self, **kwargs) -> ToolResult:
        try:
            if self.ParametersModel:
                parsed = self.ParametersModel(**kwargs)
                return await self.run(**parsed.model_dump())
            return await self.run(**kwargs)
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))

    async def run(self, **kwargs) -> ToolResult:
        """子类实现实际逻辑"""
        return ToolResult(success=False, output="", error="未实现")
