from app.tools.registry import tool_registry
from app.tools.search import WebSearchTool
from app.tools.code_exec import CodeExecutionTool
from app.tools.file_ops import FileReadTool, FileWriteTool, FileListTool
from app.tools.data_analysis import DataAnalysisTool
from app.tools.image_gen import ImageGenerationTool
from app.tools.web_browse import WebBrowseTool

tool_registry.register(WebSearchTool())
tool_registry.register(CodeExecutionTool())
tool_registry.register(FileReadTool())
tool_registry.register(FileWriteTool())
tool_registry.register(FileListTool())
tool_registry.register(DataAnalysisTool())
tool_registry.register(ImageGenerationTool())
tool_registry.register(WebBrowseTool())

__all__ = ["tool_registry"]
