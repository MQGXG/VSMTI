from app.tools.base import BaseTool, ToolParam, ToolResult
from app.config import settings
from openai import AsyncOpenAI


class ImageGenerationTool(BaseTool):
    name = "image_generate"
    description = "使用 DALL-E 生成图片"
    parameters = [
        ToolParam(name="prompt", type="string", description="图片描述"),
        ToolParam(name="size", type="string", description="图片尺寸: 1024x1024 / 1792x1024", required=False),
    ]

    async def execute(self, prompt: str = "", size: str = "1024x1024", **kwargs) -> ToolResult:
        try:
            client = AsyncOpenAI(api_key=settings.openai_api_key)
            response = await client.images.generate(
                model="dall-e-3",
                prompt=prompt,
                size=size,
                n=1,
            )
            url = response.data[0].url
            return ToolResult(success=True, output=f"![生成的图片]({url})")
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
