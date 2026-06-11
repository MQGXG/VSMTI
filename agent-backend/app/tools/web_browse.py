import base64
from app.tools.base import BaseTool, ToolParam, ToolResult


class WebBrowseTool(BaseTool):
    name = "browse_web"
    description = "打开网页并提取内容，可以浏览任意网站"
    parameters = [
        ToolParam(name="url", type="string", description="要访问的网址"),
        ToolParam(name="action", type="string", description="操作: extract_text/screenshot", required=False),
    ]

    async def execute(self, url: str = "", action: str = "extract_text", **kwargs) -> ToolResult:
        try:
            from playwright.async_api import async_playwright

            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()
                await page.goto(url, wait_until="networkidle")

                if action == "extract_text":
                    text = await page.inner_text("body")
                    await browser.close()
                    return ToolResult(success=True, output=text[:5000])
                elif action == "screenshot":
                    screenshot = await page.screenshot(full_page=False)
                    await browser.close()
                    b64 = base64.b64encode(screenshot).decode()
                    return ToolResult(
                        success=True,
                        output=f"data:image/png;base64,{b64}",
                    )
                await browser.close()
                return ToolResult(success=True, output="操作完成")
        except ImportError:
            return ToolResult(
                success=True,
                output=f"目标网页: {url}\n(需要安装 playwright 以启用浏览器控制)"
            )
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
