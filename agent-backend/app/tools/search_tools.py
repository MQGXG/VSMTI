"""Grep + Glob 专用搜索工具"""

import logging
import subprocess
from pathlib import Path
from app.tools.base import BaseTool, ToolParam, ToolResult
from app.core.workspace import workspace

logger = logging.getLogger(__name__)


class GrepTool(BaseTool):
    @property
    def name(self) -> str:
        return "grep"

    @property
    def description(self) -> str:
        return "使用正则表达式搜索文件内容"

    @property
    def parameters(self) -> list[ToolParam]:
        return [
            ToolParam(name="pattern", type="string", description="搜索的正则表达式"),
            ToolParam(name="include", type="string", description="文件过滤模式，如 *.py", required=False),
            ToolParam(name="path", type="string", description="搜索目录（默认当前目录）", required=False),
        ]

    async def execute(self, **kwargs) -> ToolResult:
        pattern = kwargs.get("pattern", "")
        include = kwargs.get("include", "")
        search_path = kwargs.get("path", str(workspace.path))

        if not pattern:
            return ToolResult(success=False, error="需要搜索模式")

        cmd = ["rg", "-n", "--no-heading", pattern, search_path]
        if include:
            cmd.extend(["-g", include])

        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if r.returncode == 0:
                output = r.stdout.strip()[:50000]
                count = len(r.stdout.splitlines())
                return ToolResult(success=True, output=output or f"找到 0 个匹配")
            elif r.returncode == 1:
                return ToolResult(success=True, output="未找到匹配")
            else:
                return ToolResult(success=False, output="", error=r.stderr.strip()[:500])
        except FileNotFoundError:
            # 降级: 用 findstr (Windows) 或 grep
            return await self._fallback_grep(pattern, include, search_path)
        except subprocess.TimeoutExpired:
            return ToolResult(success=False, error="搜索超时")
        except Exception as e:
            return ToolResult(success=False, error=str(e))

    async def _fallback_grep(self, pattern: str, include: str, search_path: str) -> ToolResult:
        try:
            if include:
                cmd = f'findstr /s /n /c:"{pattern}" "{search_path}\\{include}"'
            else:
                cmd = f'findstr /s /n /c:"{pattern}" "{search_path}\\*"'
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
            output = (r.stdout + r.stderr).strip()[:50000]
            return ToolResult(success=True, output=output or "未找到匹配")
        except Exception as e:
            return ToolResult(success=False, error=str(e))


class GlobTool(BaseTool):
    @property
    def name(self) -> str:
        return "glob"

    @property
    def description(self) -> str:
        return "通过模式匹配查找文件"

    @property
    def parameters(self) -> list[ToolParam]:
        return [
            ToolParam(name="pattern", type="string", description="Glob 模式，如 **/*.py 或 src/**/*.ts"),
            ToolParam(name="path", type="string", description="搜索目录（默认当前目录）", required=False),
        ]

    async def execute(self, **kwargs) -> ToolResult:
        pattern = kwargs.get("pattern", "")
        search_path = kwargs.get("path", str(workspace.path))

        if not pattern:
            return ToolResult(success=False, error="需要 glob 模式")

        try:
            root = Path(search_path).resolve()
            if not root.exists():
                return ToolResult(success=False, error=f"目录不存在: {search_path}")

            matches = sorted(root.rglob(pattern))
            if not matches:
                return ToolResult(success=True, output="未找到匹配文件")

            lines = []
            for f in matches[:200]:
                try:
                    rel = workspace.get_relative(f)
                    size = f.stat().st_size if f.is_file() else 0
                    lines.append(f"{'📁' if f.is_dir() else '📄'} {rel} ({size} bytes)" if size else f"{'📁' if f.is_dir() else '📄'} {rel}")
                except ValueError:
                    lines.append(str(f))

            output = "\n".join(lines)
            if len(matches) > 200:
                output += f"\n... (共 {len(matches)} 个，仅显示前 200 个)"

            return ToolResult(success=True, output=output)
        except Exception as e:
            return ToolResult(success=False, error=str(e))
