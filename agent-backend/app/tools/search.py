from app.tools.base import BaseTool, ToolParam, ToolResult


class WebSearchTool(BaseTool):
    name = "web_search"
    description = "搜索互联网获取最新信息"
    parameters = [
        ToolParam(name="query", type="string", description="搜索关键词")
    ]

    async def execute(self, query: str = "", **kwargs) -> ToolResult:
        try:
            from duckduckgo_search import DDGS

            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=5))

            formatted = "\n\n".join(
                f"[{r['title']}]({r['href']})\n{r['body']}"
                for r in results
            )
            return ToolResult(success=True, output=formatted)
        except ImportError:
            # 降级方案
            return ToolResult(
                success=True,
                output=f"搜索: {query}\n(需要安装 duckduckgo_search 或配置 Tavily/SerpAPI 以启用网络搜索)"
            )
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
