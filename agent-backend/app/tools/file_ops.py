import os
from pathlib import Path
from app.tools.base import BaseTool, ToolParam, ToolResult
from app.config import settings


class FileReadTool(BaseTool):
    name = "read_file"
    description = "读取文件内容"
    parameters = [
        ToolParam(name="path", type="string", description="文件路径（相对 uploads 目录）")
    ]

    async def execute(self, path: str = "", **kwargs) -> ToolResult:
        try:
            full_path = Path(settings.upload_dir) / path
            if not full_path.exists():
                return ToolResult(success=False, output="", error=f"文件不存在: {path}")
            content = full_path.read_text(encoding="utf-8")
            return ToolResult(success=True, output=content[:5000])
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))


class FileWriteTool(BaseTool):
    name = "write_file"
    description = "写入文件内容"
    parameters = [
        ToolParam(name="path", type="string", description="文件路径（相对 uploads 目录）"),
        ToolParam(name="content", type="string", description="文件内容"),
    ]

    async def execute(self, path: str = "", content: str = "", **kwargs) -> ToolResult:
        try:
            full_path = Path(settings.upload_dir) / path
            full_path.parent.mkdir(parents=True, exist_ok=True)
            full_path.write_text(content, encoding="utf-8")
            return ToolResult(success=True, output=f"文件已写入: {path}")
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))


class FileListTool(BaseTool):
    name = "list_files"
    description = "列出 uploads 目录中的文件"
    parameters = [
        ToolParam(name="subdir", type="string", description="子目录（可选）", required=False)
    ]

    async def execute(self, subdir: str = "", **kwargs) -> ToolResult:
        try:
            base = Path(settings.upload_dir)
            target = base / subdir if subdir else base
            if not target.exists():
                return ToolResult(success=True, output="目录为空")
            files = []
            for f in target.iterdir():
                files.append(f"{'📁' if f.is_dir() else '📄'} {f.relative_to(base)}")
            return ToolResult(success=True, output="\n".join(files) if files else "目录为空")
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
