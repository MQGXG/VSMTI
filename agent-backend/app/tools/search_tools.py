import asyncio
import logging
from pathlib import Path
from app.tools.base import BaseTool, ToolParam, ToolResult
from app.core.workspace import workspace


class WebSearchTool(BaseTool):
    name = "web_search"
    description = "搜索互联网获取最新信息"
    parameters = [
        ToolParam(name="query", type="string", description="搜索关键词")
    ]

    async def execute(self, query: str = "", **kwargs) -> ToolResult:
        if not query:
            return ToolResult(success=False, error="搜索关键词不能为空")
        try:
            from duckduckgo_search import AsyncDDGS
            results = []
            async with AsyncDDGS() as ddgs:
                async for r in ddgs.text(query, max_results=5):
                    results.append(r)
            if not results:
                return ToolResult(success=True, output=f"搜索「{query}」未找到结果")
            formatted = "\n\n".join(
                f"[{r['title']}]({r['href']})\n{r['body']}" for r in results
            )
            return ToolResult(success=True, output=formatted)
        except ImportError:
            return ToolResult(success=True, output=f"搜索: {query}\n(需要安装 duckduckgo_search)")
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))

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

        try:
            cmd = ["rg", "-n", "--no-heading", pattern, search_path]
            if include:
                cmd.extend(["-g", include])

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
            except asyncio.TimeoutError:
                proc.kill()
                return ToolResult(success=False, error="搜索超时")

            if proc.returncode == 0:
                output = stdout.decode("utf-8", errors="replace").strip()[:50000]
                return ToolResult(success=True, output=output or f"找到 0 个匹配")
            elif proc.returncode == 1:
                return ToolResult(success=True, output="未找到匹配")
            else:
                err = stderr.decode("utf-8", errors="replace").strip()[:500]
                return ToolResult(success=False, output="", error=err or "搜索失败")

        except FileNotFoundError:
            return await self._fallback_grep(pattern, include, search_path)
        except Exception as e:
            return ToolResult(success=False, error=str(e))

    async def _fallback_grep(self, pattern: str, include: str, search_path: str) -> ToolResult:
        try:
            if include:
                cmd = f'findstr /s /n /c:"{pattern}" "{search_path}\\{include}"'
            else:
                cmd = f'findstr /s /n /c:"{pattern}" "{search_path}\\*"'

            proc = await asyncio.create_subprocess_exec(
                "cmd", "/c", cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
            except asyncio.TimeoutError:
                proc.kill()
                return ToolResult(success=False, error="搜索超时")

            output = (stdout + stderr).decode("utf-8", errors="replace").strip()[:50000]
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
