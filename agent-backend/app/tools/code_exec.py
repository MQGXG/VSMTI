import subprocess
import tempfile
import os
from app.tools.base import BaseTool, ToolParam, ToolResult


class CodeExecutionTool(BaseTool):
    name = "run_code"
    description = "执行 Python 代码并返回结果"
    parameters = [
        ToolParam(name="code", type="string", description="要执行的 Python 代码")
    ]

    async def execute(self, code: str = "", **kwargs) -> ToolResult:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
            f.write(code)
            temp_path = f.name

        try:
            result = subprocess.run(
                ["python", temp_path],
                capture_output=True,
                text=True,
                timeout=30,
            )
            output = result.stdout or result.stderr
            return ToolResult(success=True, output=output[:2000])
        except subprocess.TimeoutExpired:
            return ToolResult(success=False, output="", error="执行超时(30秒)")
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
        finally:
            try:
                os.unlink(temp_path)
            except OSError:
                pass
