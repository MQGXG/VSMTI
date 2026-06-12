"""文件工具 — 支持任意路径 (含权限保护)"""

import os
from pathlib import Path
from app.tools.base import BaseTool, ToolParam, ToolResult

WORKDIR = Path(__file__).resolve().parent.parent.parent.parent


def _resolve_path(path: str) -> Path:
    """解析路径：绝对路径原样，相对路径以工作目录为基准"""
    p = Path(path)
    if p.is_absolute():
        return p.resolve()
    return (WORKDIR / p).resolve()


class FileReadTool(BaseTool):
    name = "read_file"
    description = "读取文件内容。支持绝对路径和相对路径，超出工作区会触发权限审批。"

    parameters = [
        ToolParam(name="path", type="string", description="文件路径（绝对或相对路径）"),
        ToolParam(name="limit", type="integer", description="最多读取行数（可选）", required=False),
    ]

    async def execute(self, path: str = "", limit: int | None = None, **kwargs) -> ToolResult:
        try:
            full_path = _resolve_path(path)
            if not full_path.exists():
                return ToolResult(success=False, output="", error=f"文件不存在: {full_path}")
            if not full_path.is_file():
                return ToolResult(success=False, output="", error=f"不是文件: {path}")

            content = full_path.read_text(encoding="utf-8")
            if limit:
                lines = content.splitlines()
                content = "\n".join(lines[:limit])
                if len(lines) > limit:
                    content += f"\n... (共 {len(lines)} 行，显示前 {limit} 行)"

            max_chars = 50000
            if len(content) > max_chars:
                content = content[:max_chars] + f"\n... (内容过长，截断至 {max_chars} 字符)"

            return ToolResult(success=True, output=content)
        except PermissionError:
            return ToolResult(success=False, output="", error=f"无权限读取: {path}")
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))


class FileWriteTool(BaseTool):
    name = "write_file"
    description = "写入文件内容。超出工作区路径会触发权限审批。"

    parameters = [
        ToolParam(name="path", type="string", description="文件路径（绝对或相对路径）"),
        ToolParam(name="content", type="string", description="文件内容"),
    ]

    async def execute(self, path: str = "", content: str = "", **kwargs) -> ToolResult:
        try:
            full_path = _resolve_path(path)
            full_path.parent.mkdir(parents=True, exist_ok=True)
            full_path.write_text(content, encoding="utf-8")
            return ToolResult(success=True, output=f"已写入 {len(content)} 字节到 {full_path}")
        except PermissionError:
            return ToolResult(success=False, output="", error=f"无权限写入: {path}")
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))


class FileListTool(BaseTool):
    name = "list_files"
    description = "列出目录中的文件和子目录。支持绝对路径和相对路径。"

    parameters = [
        ToolParam(name="path", type="string", description="目录路径（绝对或相对，默认为当前目录）", required=False),
    ]

    async def execute(self, path: str = "", **kwargs) -> ToolResult:
        try:
            target = _resolve_path(path) if path else WORKDIR
            if not target.exists():
                return ToolResult(success=False, output="", error=f"目录不存在: {target}")
            if not target.is_dir():
                return ToolResult(success=False, output="", error=f"不是目录: {path}")

            items = []
            for f in sorted(target.iterdir()):
                prefix = "📁" if f.is_dir() else "📄"
                try:
                    size = f.stat().st_size if f.is_file() else ""
                    size_str = f" ({size} bytes)" if size else ""
                    items.append(f"{prefix} {f.name}{size_str}")
                except OSError:
                    items.append(f"{prefix} {f.name}")

            return ToolResult(success=True, output="\n".join(items) if items else "目录为空")
        except PermissionError:
            return ToolResult(success=False, output="", error=f"无权限访问: {path}")
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
